"""
routes/api_v1.py -- Public API v1 (API-key authenticated).
"""

from fastapi import APIRouter, HTTPException, Depends, Request
from sqlalchemy.orm import Session
from sqlalchemy import func

from config import ANTHROPIC_API_KEY, CLAUDE_MODEL
from database import get_db
from db_models import Workspace, SearchLog, ApiKey
from tool_models import AgentLink, AgentCommunication, ExternalAgent
from auth import get_api_key_auth
from security import sanitize_query
from services.chroma import text_col
from services.search import build_tenant_where
from services.rag import build_system_prompt

import uuid
import time

router = APIRouter(prefix="/v1", tags=["api_v1"])


@router.post("/ask")
async def v1_ask(
    request: Request,
    api_key: ApiKey = Depends(get_api_key_auth),
    db: Session = Depends(get_db),
):
    """Public API: Ask a question against your documents."""
    try:
        body = await request.json()
    except Exception:
        body = {}

    query = (body.get("query") or "").strip()
    if not query:
        raise HTTPException(400, "query is required")

    workspace_id = body.get("workspace_id") or api_key.workspace_id or ""
    max_chunks = min(body.get("max_chunks", 5), 20)
    history = body.get("history") or []  # [{role, content}, ...]
    query = sanitize_query(query)

    if not ANTHROPIC_API_KEY:
        raise HTTPException(503, "AI service not configured")

    where = build_tenant_where(api_key.tenant_id, workspace_id)

    # Gather context
    context_chunks = []
    sources = []
    seen = set()

    if text_col.count() > 0:
        try:
            fetch_n = min(max_chunks * 3, text_col.count())
            r = text_col.query(query_texts=[query], n_results=fetch_n, where=where,
                               include=["documents", "metadatas", "distances"])
            docs = r.get("documents", [[]])[0]
            metas = r.get("metadatas", [[]])[0]

            for txt, meta in zip(docs, metas):
                if not txt or len(txt.strip()) < 20:
                    continue
                sig = txt.strip()[:100]
                if sig in seen:
                    continue
                seen.add(sig)
                context_chunks.append(txt.strip())
                src = meta.get("source_file", "unknown")
                if src not in sources:
                    sources.append(src)
                if len(context_chunks) >= max_chunks:
                    break
        except Exception:
            pass

    # Build prompt
    agent_prompt = ""
    if workspace_id:
        ws = db.query(Workspace).filter(Workspace.id == workspace_id).first()
        if ws and ws.system_prompt:
            agent_prompt = ws.system_prompt

    # Check if agent has tools configured
    from services.tools import get_all_tools
    from tool_executor import call_claude_with_tools
    from services.analytics import log_conversation

    t0 = time.time()
    claude_tools, tool_lookup = get_all_tools(workspace_id, api_key.tenant_id, db) if workspace_id else ([], {})

    if not context_chunks and not claude_tools:
        return {"answer": "No relevant documents found for your query.", "sources": [], "chunks_used": 0, "model": CLAUDE_MODEL}

    system = build_system_prompt(agent_prompt)
    if context_chunks:
        numbered = "\n\n".join(f"[{i+1}] {c}" for i, c in enumerate(context_chunks))
        user_msg = f"DOCUMENT EXCERPTS:\n{numbered}\n\nQUESTION: {query}"
    else:
        user_msg = f"QUESTION: {query}"

    # Build messages with conversation history
    messages = []
    for h in history[-10:]:  # Keep last 10 turns to avoid token overflow
        role = h.get("role", "")
        content = h.get("content", "")
        if role in ("user", "assistant") and content:
            messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": user_msg})

    answer = ""
    if claude_tools:
        try:
            answer = call_claude_with_tools(
                messages=messages,
                system=system, tools=claude_tools, tool_lookup=tool_lookup, db_session=db,
            )
        except Exception:
            answer = ""

    # Fallback or standard call
    if not answer or not answer.strip():
        answer = _plain_claude_call(system, messages=messages)
    elapsed_ms = int((time.time() - t0) * 1000)

    # Log
    log = SearchLog(
        tenant_id=api_key.tenant_id, user_id=None, query=query, mode="api_ask",
        workspace_id=workspace_id or None, result_count=len(context_chunks),
    )
    db.add(log)
    db.commit()

    # Analytics — detect widget vs API by checking header
    channel = "api"
    if workspace_id:
        log_conversation(
            db, tenant_id=api_key.tenant_id, workspace_id=workspace_id,
            query=query, answer=answer, channel=channel,
            chunks_used=len(context_chunks), sources=sources, response_time_ms=elapsed_ms,
        )

    return {"answer": answer, "sources": sources, "chunks_used": len(context_chunks), "model": CLAUDE_MODEL}


@router.post("/search")
async def v1_search(
    request: Request,
    api_key: ApiKey = Depends(get_api_key_auth),
    db: Session = Depends(get_db),
):
    """Public API: Search documents and return raw chunks."""
    try:
        body = await request.json()
    except Exception:
        body = {}

    query = (body.get("query") or "").strip()
    if not query:
        raise HTTPException(400, "query is required")

    workspace_id = body.get("workspace_id") or api_key.workspace_id or ""
    max_results = min(body.get("max_results", 10), 50)
    query = sanitize_query(query)
    where = build_tenant_where(api_key.tenant_id, workspace_id)

    results = []
    if text_col.count() > 0:
        try:
            fetch_n = min(max_results * 2, text_col.count())
            r = text_col.query(query_texts=[query], n_results=fetch_n, where=where,
                               include=["documents", "metadatas", "distances"])
            docs = r.get("documents", [[]])[0]
            metas = r.get("metadatas", [[]])[0]
            dists = r.get("distances", [[]])[0]

            seen = set()
            for txt, meta, dist in zip(docs, metas, dists):
                if not txt or len(txt.strip()) < 20:
                    continue
                sig = txt.strip()[:100]
                if sig in seen:
                    continue
                seen.add(sig)
                score = round(max(0, 1 - dist / 2), 4)
                results.append({
                    "text": txt.strip(), "source_file": meta.get("source_file", ""),
                    "score": score,
                    "metadata": {
                        "page": meta.get("page", 0), "chunk_index": meta.get("chunk_index", 0),
                        "workspace_id": meta.get("workspace_id", ""),
                    },
                })
                if len(results) >= max_results:
                    break
        except Exception:
            pass

    log = SearchLog(
        tenant_id=api_key.tenant_id, user_id=None, query=query, mode="api_search",
        workspace_id=workspace_id or None, result_count=len(results),
    )
    db.add(log)
    db.commit()

    return {"results": results, "query": query, "total": len(results)}


@router.get("/health")
def v1_health():
    return {"status": "ok", "service": "cane", "api_version": "v1"}


# ---- External Agent Registry ----

@router.post("/agents/register")
async def v1_register_agent(
    request: Request,
    api_key: ApiKey = Depends(get_api_key_auth),
    db: Session = Depends(get_db),
):
    """Register an external agent into the Cane network."""
    try:
        body = await request.json()
    except Exception:
        body = {}

    name = (body.get("name") or "").strip()
    description = (body.get("description") or "").strip()
    endpoint = (body.get("endpoint") or "").strip()

    if not name:
        raise HTTPException(400, "name is required")
    if not endpoint:
        raise HTTPException(400, "endpoint URL is required")

    auth_type = body.get("auth_type", "none")
    auth_token = body.get("auth_token", "")
    icon = body.get("icon", "")
    parameters = body.get("parameters", "[]")

    # Create workspace record so the agent appears in the network graph
    ws_id = str(uuid.uuid4())
    ws = Workspace(
        id=ws_id,
        tenant_id=api_key.tenant_id,
        name=name,
        description=description or name,
        agent_type="external",
        agent_description=description,
        agent_icon=icon,
    )
    db.add(ws)

    # Encrypt auth token if provided
    encrypted_token = ""
    if auth_token:
        from services.crypto import encrypt
        encrypted_token = encrypt(auth_token)

    # Create external agent config
    ext = ExternalAgent(
        id=str(uuid.uuid4()),
        workspace_id=ws_id,
        tenant_id=api_key.tenant_id,
        endpoint_url=endpoint,
        auth_type=auth_type,
        auth_token=encrypted_token,
        parameters=str(parameters) if not isinstance(parameters, str) else parameters,
    )
    db.add(ext)
    db.commit()

    return {"agent_id": ws_id, "name": name, "type": "external"}


@router.get("/agents")
def v1_list_agents(
    api_key: ApiKey = Depends(get_api_key_auth),
    db: Session = Depends(get_db),
):
    """List all agents (native and external) in the tenant."""
    agents = db.query(Workspace).filter(
        Workspace.tenant_id == api_key.tenant_id,
        Workspace.agent_type.isnot(None),
    ).all()

    # Get external agent IDs for type detection
    ext_ws_ids = set()
    try:
        ext_rows = db.query(ExternalAgent.workspace_id).filter(
            ExternalAgent.tenant_id == api_key.tenant_id,
        ).all()
        ext_ws_ids = {r[0] for r in ext_rows}
    except Exception:
        pass

    # Get links for each agent
    links = db.query(AgentLink).filter(
        AgentLink.tenant_id == api_key.tenant_id,
    ).all()
    links_by_parent = {}
    for link in links:
        links_by_parent.setdefault(link.parent_workspace_id, []).append({
            "child_id": link.child_workspace_id,
            "tool_name": link.tool_name,
        })

    result = []
    for a in agents:
        result.append({
            "id": a.id,
            "name": a.name,
            "description": a.agent_description or a.description or "",
            "icon": a.agent_icon or "",
            "type": "external" if a.id in ext_ws_ids else "native",
            "orchestrator_mode": getattr(a, "orchestrator_mode", False) or False,
            "linked_agents": links_by_parent.get(a.id, []),
        })

    return {"agents": result, "total": len(result)}


@router.post("/agents/{agent_id}/link")
async def v1_link_agent(
    agent_id: str,
    request: Request,
    api_key: ApiKey = Depends(get_api_key_auth),
    db: Session = Depends(get_db),
):
    """Link an agent as a sub-agent of another (create a delegation edge)."""
    try:
        body = await request.json()
    except Exception:
        body = {}

    parent_agent_id = (body.get("parent_agent_id") or "").strip()
    tool_name = (body.get("tool_name") or "").strip()
    tool_description = (body.get("tool_description") or "").strip()

    if not parent_agent_id:
        raise HTTPException(400, "parent_agent_id is required")
    if not tool_name:
        raise HTTPException(400, "tool_name is required")
    if not tool_description:
        raise HTTPException(400, "tool_description is required")

    # Verify both agents belong to this tenant
    parent = db.query(Workspace).filter(
        Workspace.id == parent_agent_id, Workspace.tenant_id == api_key.tenant_id,
    ).first()
    child = db.query(Workspace).filter(
        Workspace.id == agent_id, Workspace.tenant_id == api_key.tenant_id,
    ).first()

    if not parent:
        raise HTTPException(404, "Parent agent not found")
    if not child:
        raise HTTPException(404, "Child agent not found")
    if parent_agent_id == agent_id:
        raise HTTPException(400, "An agent cannot link to itself")

    # Check for existing link
    existing = db.query(AgentLink).filter(
        AgentLink.parent_workspace_id == parent_agent_id,
        AgentLink.child_workspace_id == agent_id,
    ).first()
    if existing:
        raise HTTPException(409, "This link already exists")

    # Simple circular ref check
    reverse = db.query(AgentLink).filter(
        AgentLink.parent_workspace_id == agent_id,
        AgentLink.child_workspace_id == parent_agent_id,
    ).first()
    if reverse:
        raise HTTPException(400, "Circular link detected: child already links to parent")

    link = AgentLink(
        id=str(uuid.uuid4()),
        parent_workspace_id=parent_agent_id,
        child_workspace_id=agent_id,
        tenant_id=api_key.tenant_id,
        tool_name=tool_name,
        tool_description=tool_description,
    )
    db.add(link)
    db.commit()

    return {"link_id": link.id, "parent": parent_agent_id, "child": agent_id}


@router.delete("/agents/{agent_id}")
def v1_delete_agent(
    agent_id: str,
    api_key: ApiKey = Depends(get_api_key_auth),
    db: Session = Depends(get_db),
):
    """Remove an external agent and its workspace."""
    ws = db.query(Workspace).filter(
        Workspace.id == agent_id, Workspace.tenant_id == api_key.tenant_id,
    ).first()
    if not ws:
        raise HTTPException(404, "Agent not found")
    if ws.agent_type != "external":
        raise HTTPException(400, "Only external agents can be deleted via API")

    # Delete external agent config
    db.query(ExternalAgent).filter(ExternalAgent.workspace_id == agent_id).delete()
    # Delete links referencing this agent
    db.query(AgentLink).filter(
        (AgentLink.parent_workspace_id == agent_id) | (AgentLink.child_workspace_id == agent_id)
    ).delete(synchronize_session=False)
    # Delete the workspace
    db.delete(ws)
    db.commit()

    return {"deleted": agent_id}


@router.get("/network")
def v1_network(
    api_key: ApiKey = Depends(get_api_key_auth),
    db: Session = Depends(get_db),
):
    """Get the full agent network graph: nodes, edges, and communication stats."""
    # Nodes
    agents = db.query(Workspace).filter(
        Workspace.tenant_id == api_key.tenant_id,
        Workspace.agent_type.isnot(None),
    ).all()

    ext_ws_ids = set()
    try:
        ext_rows = db.query(ExternalAgent.workspace_id).filter(
            ExternalAgent.tenant_id == api_key.tenant_id,
        ).all()
        ext_ws_ids = {r[0] for r in ext_rows}
    except Exception:
        pass

    nodes = [
        {
            "id": a.id,
            "name": a.name,
            "icon": a.agent_icon or "",
            "description": a.agent_description or a.description or "",
            "type": "external" if a.id in ext_ws_ids else "native",
            "orchestrator_mode": getattr(a, "orchestrator_mode", False) or False,
        }
        for a in agents
    ]

    # Edges
    links = db.query(AgentLink).filter(AgentLink.tenant_id == api_key.tenant_id).all()

    pair_counts = {}
    pair_durations = {}
    try:
        rows = db.query(
            AgentCommunication.parent_agent_id,
            AgentCommunication.child_agent_id,
            func.count(AgentCommunication.id).label("cnt"),
            func.avg(AgentCommunication.duration_ms).label("avg_ms"),
        ).filter(
            AgentCommunication.tenant_id == api_key.tenant_id,
        ).group_by(
            AgentCommunication.parent_agent_id,
            AgentCommunication.child_agent_id,
        ).all()
        for row in rows:
            key = (row.parent_agent_id, row.child_agent_id)
            pair_counts[key] = row.cnt
            pair_durations[key] = int(row.avg_ms or 0)
    except Exception:
        pass

    edges = [
        {
            "id": link.id,
            "source": link.parent_workspace_id,
            "target": link.child_workspace_id,
            "tool_name": link.tool_name,
            "comm_count": pair_counts.get((link.parent_workspace_id, link.child_workspace_id), 0),
            "avg_duration_ms": pair_durations.get((link.parent_workspace_id, link.child_workspace_id), 0),
        }
        for link in links
    ]

    # Auto-discovered edges from communication logs
    linked_pairs = {(l.parent_workspace_id, l.child_workspace_id) for l in links}
    for (parent_id, child_id), cnt in pair_counts.items():
        if (parent_id, child_id) not in linked_pairs:
            edges.append({
                "id": f"auto_{parent_id}_{child_id}"[:36],
                "source": parent_id,
                "target": child_id,
                "tool_name": "auto",
                "comm_count": cnt,
                "avg_duration_ms": pair_durations.get((parent_id, child_id), 0),
            })

    total_comms = sum(pair_counts.values())
    all_durations = [pair_durations[k] for k in pair_durations if pair_durations[k] > 0]
    avg_response_ms = int(sum(all_durations) / len(all_durations)) if all_durations else 0

    return {
        "nodes": nodes,
        "edges": edges,
        "stats": {
            "total_communications": total_comms,
            "avg_response_ms": avg_response_ms,
        },
    }


@router.post("/log")
async def v1_log_communication(
    request: Request,
    api_key: ApiKey = Depends(get_api_key_auth),
    db: Session = Depends(get_db),
):
    """Log an external agent communication for observability."""
    try:
        body = await request.json()
    except Exception:
        body = {}

    caller_id = (body.get("caller_id") or "").strip()
    callee_id = (body.get("callee_id") or "").strip()
    query = (body.get("query") or "").strip()
    response = (body.get("response") or "").strip()
    duration_ms = body.get("duration_ms", 0)
    status = body.get("status", "ok")

    if not caller_id or not callee_id:
        raise HTTPException(400, "caller_id and callee_id are required")

    comm = AgentCommunication(
        id=str(uuid.uuid4()),
        tenant_id=api_key.tenant_id,
        parent_agent_id=caller_id,
        child_agent_id=callee_id,
        query_sent=query[:2000],
        response_received=response[:2000],
        duration_ms=duration_ms,
        status=status,
    )
    db.add(comm)
    db.commit()

    return {"logged": True, "id": comm.id}


def _plain_claude_call(system: str, user_msg: str = "", messages: list = None) -> str:
    """Plain Claude API call without tools."""
    try:
        from services.claude import call
        return call(user_msg, system=system, messages=messages)
    except Exception as e:
        raise HTTPException(502, f"AI service error: {str(e)}")