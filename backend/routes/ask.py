"""
routes/ask.py -- RAG ask endpoints (sync and streaming).

Uses services.rag for shared context building.
Integrates agent memory: loads memories before calls, extracts after.
"""
import json

from fastapi import APIRouter, Query, Depends
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy.orm import Session

from config import ANTHROPIC_API_KEY, CLAUDE_MODEL
from database import get_db
from db_models import Tenant, User, Workspace, SearchLog
from auth import get_current_user
from security import sanitize_query
from services.limits import check_search_limit
from services.rag import build_context, build_system_prompt, call_claude
from streaming import stream_claude, get_conversation_history, save_conversation_turn, _sse
from services.analytics import log_conversation
from services.memory import get_memories, format_memories_for_prompt, extract_memories_background
import time

router = APIRouter(prefix="/api", tags=["ask"])


@router.get("/ask")
def ask(
    q: str = Query(...),
    n: int = Query(5, ge=1, le=20),
    workspace_id: str = Query(""),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """RAG: search + summarize with Claude."""
    q = sanitize_query(q)
    if not q:
        return {"status": "error", "error": "Query is required"}

    tenant = db.query(Tenant).filter(Tenant.id == user.tenant_id).first()
    limit_err = check_search_limit(user.tenant_id, tenant.plan if tenant else "free", db)
    if limit_err:
        return JSONResponse({"error": limit_err}, status_code=403)

    if not ANTHROPIC_API_KEY:
        return {"status": "no_llm", "error": "Anthropic API key not configured. Set ANTHROPIC_API_KEY."}

    # Build context using shared service
    ctx = build_context(q, user.tenant_id, workspace_id, n)

    if not ctx.has_content:
        return {"status": "no_results", "error": "No text content to summarize."}

    # Load agent system prompt
    agent_prompt = ""
    if workspace_id:
        ws = db.query(Workspace).filter(
            Workspace.id == workspace_id, Workspace.tenant_id == user.tenant_id,
        ).first()
        if ws and ws.system_prompt:
            agent_prompt = ws.system_prompt

    # Load memories and inject into system prompt
    memory_context = ""
    if workspace_id:
        memories = get_memories(workspace_id, user.id, db)
        memory_context = format_memories_for_prompt(memories)

    system_prompt = build_system_prompt(agent_prompt, memory_context)
    user_prompt = f"Question: {q}\n\nDocument Excerpts:\n{ctx.context}\n\nProvide a clear answer based on the above."

    try:
        # Load all tools (webhooks + MCP)
        from services.tools import get_all_tools
        from tool_executor import call_claude_with_tools

        t0 = time.time()
        claude_tools, tool_lookup = get_all_tools(workspace_id, user.tenant_id, db) if workspace_id else ([], {})

        if claude_tools:
            messages = [{"role": "user", "content": user_prompt}]
            summary = call_claude_with_tools(
                messages=messages, system=system_prompt,
                tools=claude_tools, tool_lookup=tool_lookup, db_session=db,
            )
        else:
            summary = call_claude(user_prompt, system=system_prompt)
        elapsed_ms = int((time.time() - t0) * 1000)

        # Extract memories in background
        if workspace_id and summary:
            extract_memories_background(q, summary, workspace_id, user.tenant_id, user.id)

        # Log
        log = SearchLog(
            tenant_id=user.tenant_id, user_id=user.id, query=q, mode="ask",
            workspace_id=workspace_id or None, result_count=ctx.chunks_used,
        )
        db.add(log)
        db.commit()

        # Analytics
        if workspace_id:
            log_conversation(
                db, tenant_id=user.tenant_id, workspace_id=workspace_id,
                query=q, answer=summary, channel="internal", user_id=user.id,
                chunks_used=ctx.chunks_used, sources=ctx.sources, response_time_ms=elapsed_ms,
            )

        return {
            "status": "ok", "summary": summary, "model": CLAUDE_MODEL,
            "sources": ctx.sources, "chunks_used": ctx.chunks_used, "images": ctx.images,
        }
    except Exception as e:
        return {"status": "error", "error": f"LLM call failed: {str(e)}"}


@router.get("/ask/stream")
def ask_stream(
    q: str = Query(...),
    n: int = Query(5, ge=1, le=20),
    workspace_id: str = Query(""),
    session_id: str = Query(""),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """RAG: search + stream answer via SSE."""
    q = sanitize_query(q)
    if not q:
        return JSONResponse({"status": "error", "error": "Query is required"})

    tenant = db.query(Tenant).filter(Tenant.id == user.tenant_id).first()
    limit_err = check_search_limit(user.tenant_id, tenant.plan if tenant else "free", db)
    if limit_err:
        return JSONResponse({"error": limit_err}, status_code=403)

    if not ANTHROPIC_API_KEY:
        return JSONResponse({"status": "no_llm", "error": "Anthropic API key not configured."})

    # Build context using shared service
    ctx = build_context(q, user.tenant_id, workspace_id, n)

    if not ctx.has_content:
        return JSONResponse({"status": "no_results", "error": "No text content to summarize."})

    # Load agent system prompt
    agent_prompt = ""
    if workspace_id:
        ws = db.query(Workspace).filter(
            Workspace.id == workspace_id, Workspace.tenant_id == user.tenant_id,
        ).first()
        if ws and ws.system_prompt:
            agent_prompt = ws.system_prompt

    # Load memories and inject into system prompt
    memory_context = ""
    if workspace_id:
        memories = get_memories(workspace_id, user.id, db)
        memory_context = format_memories_for_prompt(memories)

    system_prompt = build_system_prompt(agent_prompt, memory_context)

    # Build messages with conversation history
    messages = get_conversation_history(session_id)
    messages.append({
        "role": "user",
        "content": f"Question: {q}\n\nDocument Excerpts:\n{ctx.context}\n\nProvide a clear answer based on the above."
    })

    # Load all tools (webhooks + MCP)
    from services.tools import get_all_tools
    from tool_executor import call_claude_with_tools

    claude_tools, tool_lookup = get_all_tools(workspace_id, user.tenant_id, db) if workspace_id else ([], {})
    has_tools = len(claude_tools) > 0

    # Capture user context for memory extraction
    _user_id = user.id
    _tenant_id = user.tenant_id
    _workspace_id = workspace_id

    def generate():
        if has_tools:
            try:
                yield _sse({"type": "meta", "sources": ctx.sources, "images": ctx.images,
                             "chunks_used": ctx.chunks_used})
                yield _sse({"type": "tool_status", "message": "Checking tools..."})

                from database import SessionLocal
                tool_db = SessionLocal()
                try:
                    full_response = call_claude_with_tools(
                        messages=messages, system=system_prompt,
                        tools=claude_tools, tool_lookup=tool_lookup, db_session=tool_db,
                    )
                finally:
                    tool_db.close()

                chunk_size = 8
                for i in range(0, len(full_response), chunk_size):
                    yield _sse({"type": "text", "text": full_response[i:i+chunk_size]})
                save_conversation_turn(session_id, q, full_response)

                # Extract memories in background
                if _workspace_id and full_response:
                    extract_memories_background(q, full_response, _workspace_id, _tenant_id, _user_id)

            except Exception as e:
                yield _sse({"type": "error", "error": f"Tool execution failed: {str(e)}"})
        else:
            yield _sse({"type": "meta", "sources": ctx.sources, "images": ctx.images,
                         "chunks_used": ctx.chunks_used})
            full_text = []
            for chunk in stream_claude("", system=system_prompt, messages=messages):
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

            # Extract memories in background
            if _workspace_id and full_response:
                extract_memories_background(q, full_response, _workspace_id, _tenant_id, _user_id)

        yield _sse({"type": "done"})

    # Log
    log = SearchLog(
        tenant_id=user.tenant_id, user_id=user.id, query=q, mode="ask_stream",
        workspace_id=workspace_id or None, result_count=ctx.chunks_used,
    )
    db.add(log)
    db.commit()

    return StreamingResponse(generate(), media_type="text/event-stream")
