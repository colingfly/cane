"""
routes/ask.py -- RAG ask endpoints (sync and streaming).

Uses services.rag for shared context building.
Integrates agent memory: loads memories before calls, extracts after.
"""
import json

from fastapi import APIRouter, Query, Depends, Request
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy.orm import Session

from cane.core.config import ANTHROPIC_API_KEY, CLAUDE_MODEL
from cane.inference.routing import get_model_display
from cane.core.database import get_db
from cane.core.models import Tenant, User, Workspace, SearchLog
from cane.auth.jwt import get_current_user, get_optional_user
from cane.core.security import sanitize_query
from cane.core.config import GUEST_TENANT_ID
from cane.core.limits import check_search_limit
from cane.rag.context import build_context, build_system_prompt, call_claude
from cane.agents.streaming import get_conversation_history, save_conversation_turn, persist_conversation_turn, _sse
from cane.inference.routing import infer_stream
from cane.core.analytics import log_conversation
from cane.agents.memory import get_memories, format_memories_for_prompt, extract_memories_background
import time

router = APIRouter(prefix="/api", tags=["ask"])


@router.get("/ask")
def ask(
    request: Request,
    q: str = Query(...),
    n: int = Query(5, ge=1, le=20),
    workspace_id: str = Query(""),
    user: User = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """RAG: search + summarize with Claude (works for anonymous users)."""
    q = sanitize_query(q)
    if not q:
        return {"status": "error", "error": "Query is required"}

    guest_session_id = request.headers.get("x-guest-session", "")
    if user:
        tenant_id = user.tenant_id
        tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
        limit_err = check_search_limit(tenant_id, tenant.plan if tenant else "free", db)
    else:
        if not guest_session_id:
            return JSONResponse({"error": "Authentication required"}, status_code=401)
        tenant_id = GUEST_TENANT_ID
        limit_err = check_search_limit(tenant_id, "guest", db)

    if limit_err:
        return JSONResponse({"error": limit_err}, status_code=403)

    if not ANTHROPIC_API_KEY:
        return {"status": "no_llm", "error": "Anthropic API key not configured. Set ANTHROPIC_API_KEY."}

    # Load agent system prompt
    agent_prompt = ""
    ws = None
    if workspace_id:
        ws = db.query(Workspace).filter(
            Workspace.id == workspace_id, Workspace.tenant_id == tenant_id,
        ).first()
        if ws and ws.system_prompt:
            agent_prompt = ws.system_prompt

    is_agent = bool(ws and (ws.system_prompt or ws.agent_type))

    # Build context using shared service
    ctx = build_context(q, tenant_id, workspace_id, n)

    if not ctx.has_content and not is_agent:
        return {"status": "no_results", "error": "No text content to summarize."}

    # Load memories and inject into system prompt
    memory_context = ""
    if workspace_id:
        memories = get_memories(workspace_id, user.id if user else None, db)
        memory_context = format_memories_for_prompt(memories)

    system_prompt = build_system_prompt(agent_prompt, memory_context)
    if ctx.has_content:
        user_prompt = f"Question: {q}\n\nDocument Excerpts:\n{ctx.context}\n\nProvide a clear answer based on the above."
    else:
        user_prompt = q

    try:
        # Load all tools (webhooks + MCP)
        from cane.tools.registry import get_all_tools
        from cane.tools.executor import call_claude_with_tools

        t0 = time.time()
        claude_tools, tool_lookup = get_all_tools(workspace_id, tenant_id, db) if workspace_id else ([], {})

        if claude_tools:
            chaining = getattr(ws, "tool_chaining_enabled", False) if workspace_id and ws else False
            messages = [{"role": "user", "content": user_prompt}]
            summary = call_claude_with_tools(
                messages=messages, system=system_prompt,
                tools=claude_tools, tool_lookup=tool_lookup, db_session=db,
                max_iterations=5 if chaining else 3,
            )
        else:
            summary = call_claude(user_prompt, system=system_prompt, workspace=ws)
        elapsed_ms = int((time.time() - t0) * 1000)

        # Extract memories in background
        if workspace_id and summary:
            extract_memories_background(q, summary, workspace_id, tenant_id, user.id if user else None)

        # Log
        log = SearchLog(
            tenant_id=tenant_id, user_id=user.id if user else None, query=q, mode="ask",
            workspace_id=workspace_id or None, result_count=ctx.chunks_used,
        )
        db.add(log)
        db.commit()

        # Analytics
        if workspace_id:
            log_conversation(
                db, tenant_id=tenant_id, workspace_id=workspace_id,
                query=q, answer=summary, channel="internal", user_id=user.id if user else None,
                chunks_used=ctx.chunks_used, sources=ctx.sources, response_time_ms=elapsed_ms,
            )
            # Persist to conversation history
            persist_conversation_turn(
                session_id="", workspace_id=workspace_id,
                tenant_id=tenant_id, user_id=user.id if user else None,
                query=q, answer=summary, sources=ctx.sources,
                chunks_used=ctx.chunks_used, response_time_ms=elapsed_ms,
                channel="internal",
            )

        return {
            "status": "ok", "summary": summary, "model": get_model_display(ws),
            "sources": ctx.sources, "chunks_used": ctx.chunks_used, "images": ctx.images,
        }
    except Exception as e:
        return {"status": "error", "error": f"LLM call failed: {str(e)}"}


@router.get("/ask/stream")
def ask_stream(
    request: Request,
    q: str = Query(...),
    n: int = Query(5, ge=1, le=20),
    workspace_id: str = Query(""),
    session_id: str = Query(""),
    user: User = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """RAG: search + stream answer via SSE (works for anonymous users)."""
    q = sanitize_query(q)
    if not q:
        return JSONResponse({"status": "error", "error": "Query is required"})

    guest_session_id = request.headers.get("x-guest-session", "")
    if user:
        tenant_id = user.tenant_id
        tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
        limit_err = check_search_limit(tenant_id, tenant.plan if tenant else "free", db)
    else:
        if not guest_session_id:
            return JSONResponse({"error": "Authentication required"}, status_code=401)
        tenant_id = GUEST_TENANT_ID
        limit_err = check_search_limit(tenant_id, "guest", db)

    if limit_err:
        return JSONResponse({"error": limit_err}, status_code=403)

    if not ANTHROPIC_API_KEY:
        return JSONResponse({"status": "no_llm", "error": "Anthropic API key not configured."})

    # Load agent system prompt
    agent_prompt = ""
    ws = None
    if workspace_id:
        ws = db.query(Workspace).filter(
            Workspace.id == workspace_id, Workspace.tenant_id == tenant_id,
        ).first()
        if ws and ws.system_prompt:
            agent_prompt = ws.system_prompt

    # Check if this is an agent (has system prompt or agent_type)
    is_agent = bool(ws and (ws.system_prompt or ws.agent_type))

    # Build context using shared service
    ctx = build_context(q, tenant_id, workspace_id, n)

    if not ctx.has_content and not is_agent:
        return JSONResponse({"status": "no_results", "error": "No text content to summarize."})

    # Load memories and inject into system prompt
    memory_context = ""
    if workspace_id:
        memories = get_memories(workspace_id, user.id if user else None, db)
        memory_context = format_memories_for_prompt(memories)

    system_prompt = build_system_prompt(agent_prompt, memory_context)

    # Orchestrator mode: inject routing instructions
    is_orchestrator = getattr(ws, "orchestrator_mode", False) if workspace_id and ws else False
    if is_orchestrator:
        system_prompt += "\n\nYou are an orchestrator agent. Analyze each query and route it to the most relevant specialist agent available as a tool. You may consult multiple agents and synthesize their responses into a unified answer. Always explain which specialists you consulted and why."

    # Build messages with conversation history
    messages = get_conversation_history(session_id)
    if ctx.has_content:
        messages.append({
            "role": "user",
            "content": f"Question: {q}\n\nDocument Excerpts:\n{ctx.context}\n\nProvide a clear answer based on the above."
        })
    else:
        messages.append({
            "role": "user",
            "content": q,
        })

    # Load all tools (webhooks + MCP)
    from cane.tools.registry import get_all_tools
    from cane.tools.executor import call_claude_with_tools

    claude_tools, tool_lookup = get_all_tools(workspace_id, tenant_id, db) if workspace_id else ([], {})
    has_tools = len(claude_tools) > 0
    chaining = getattr(ws, "tool_chaining_enabled", False) if workspace_id and ws else False

    # Capture user context for memory extraction
    _user_id = user.id if user else None
    _tenant_id = tenant_id
    _workspace_id = workspace_id

    def generate():
        if has_tools:
            try:
                yield _sse({"type": "meta", "sources": ctx.sources, "images": ctx.images,
                             "chunks_used": ctx.chunks_used})
                yield _sse({"type": "tool_status", "message": "Checking tools..."})

                # Collect tool + agent events for SSE
                tool_events = []
                agent_events = []
                def _on_tool_event(evt):
                    tool_events.append(evt)
                def _on_agent_event(evt):
                    agent_events.append(evt)

                from cane.core.database import SessionLocal
                tool_db = SessionLocal()
                try:
                    full_response = call_claude_with_tools(
                        messages=messages, system=system_prompt,
                        tools=claude_tools, tool_lookup=tool_lookup, db_session=tool_db,
                        max_iterations=5 if chaining else 3,
                        on_tool_event=_on_tool_event,
                        session_id=session_id,
                        tenant_id=_tenant_id,
                        on_agent_event=_on_agent_event,
                    )
                finally:
                    tool_db.close()

                # Yield tool step events
                for evt in tool_events:
                    yield _sse({"type": "tool_step", **evt})

                # Yield agent delegation events
                for evt in agent_events:
                    yield _sse({"type": "agent_delegation", **evt})

                chunk_size = 8
                for i in range(0, len(full_response), chunk_size):
                    yield _sse({"type": "text", "text": full_response[i:i+chunk_size]})
                save_conversation_turn(session_id, q, full_response)

                # Persist to DB
                if _workspace_id:
                    persist_conversation_turn(
                        session_id=session_id, workspace_id=_workspace_id,
                        tenant_id=_tenant_id, user_id=_user_id,
                        query=q, answer=full_response, sources=ctx.sources,
                        chunks_used=ctx.chunks_used, channel="internal",
                    )

                # Extract memories in background
                if _workspace_id and full_response:
                    extract_memories_background(q, full_response, _workspace_id, _tenant_id, _user_id)

            except Exception as e:
                yield _sse({"type": "error", "error": f"Tool execution failed: {str(e)}"})
        else:
            yield _sse({"type": "meta", "sources": ctx.sources, "images": ctx.images,
                         "chunks_used": ctx.chunks_used})
            full_text = []
            for chunk in infer_stream("", system=system_prompt, messages=messages, workspace=ws):
                yield chunk
                if chunk.startswith("data: "):
                    try:
                        d = json.loads(chunk[6:].strip())
                        if d.get("type") == "text":
                            full_text.append(d["text"])
                    except Exception:
                        pass
            full_response = "".join(full_text)
            save_conversation_turn(session_id, q, full_response)

            # Persist to DB
            if _workspace_id:
                persist_conversation_turn(
                    session_id=session_id, workspace_id=_workspace_id,
                    tenant_id=_tenant_id, user_id=_user_id,
                    query=q, answer=full_response, sources=ctx.sources,
                    chunks_used=ctx.chunks_used, channel="internal",
                )

            # Extract memories in background
            if _workspace_id and full_response:
                extract_memories_background(q, full_response, _workspace_id, _tenant_id, _user_id)

        yield _sse({"type": "done"})

    # Log
    log = SearchLog(
        tenant_id=tenant_id, user_id=user.id if user else None, query=q, mode="ask_stream",
        workspace_id=workspace_id or None, result_count=ctx.chunks_used,
    )
    db.add(log)
    db.commit()

    return StreamingResponse(generate(), media_type="text/event-stream")
