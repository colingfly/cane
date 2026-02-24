"""
routes/api_v1.py — Public API v1 (API-key authenticated).
"""
import json
import urllib.request

from fastapi import APIRouter, HTTPException, Depends, Request
from sqlalchemy.orm import Session

from config import ANTHROPIC_API_KEY, CLAUDE_MODEL
from database import get_db
from db_models import Workspace, SearchLog, ApiKey
from auth import get_api_key_auth
from security import sanitize_query
from services.chroma import text_col
from services.search import build_tenant_where
from services.rag import build_system_prompt

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

    if not context_chunks:
        return {"answer": "No relevant documents found for your query.", "sources": [], "chunks_used": 0, "model": CLAUDE_MODEL}

    # Build prompt
    agent_prompt = ""
    if workspace_id:
        ws = db.query(Workspace).filter(Workspace.id == workspace_id).first()
        if ws and ws.system_prompt:
            agent_prompt = ws.system_prompt

    system = build_system_prompt(agent_prompt)
    numbered = "\n\n".join(f"[{i+1}] {c}" for i, c in enumerate(context_chunks))
    user_msg = f"DOCUMENT EXCERPTS:\n{numbered}\n\nQUESTION: {query}"

    # Call Claude (with tools if configured)
    from tool_models import AgentTool
    from tool_executor import build_claude_tools, call_claude_with_tools

    workspace_tools = db.query(AgentTool).filter(
        AgentTool.workspace_id == workspace_id,
        AgentTool.tenant_id == api_key.tenant_id,
        AgentTool.is_enabled == True,
    ).all() if workspace_id else []

    answer = ""
    if workspace_tools:
        claude_tools = build_claude_tools(workspace_tools)
        tool_lookup = {t.name.replace(" ", "_").lower()[:64]: t for t in workspace_tools}
        try:
            answer = call_claude_with_tools(
                messages=[{"role": "user", "content": user_msg}],
                system=system, tools=claude_tools, tool_lookup=tool_lookup, db_session=db,
            )
        except Exception:
            answer = ""

    # Fallback or standard call
    if not answer or not answer.strip():
        answer = _plain_claude_call(system, user_msg)

    # Log
    log = SearchLog(
        tenant_id=api_key.tenant_id, user_id=None, query=query, mode="api_ask",
        workspace_id=workspace_id or None, result_count=len(context_chunks),
    )
    db.add(log)
    db.commit()

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


def _plain_claude_call(system: str, user_msg: str) -> str:
    """Plain Claude API call without tools."""
    payload = {
        "model": CLAUDE_MODEL, "max_tokens": 1024, "system": system,
        "messages": [{"role": "user", "content": user_msg}],
    }
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=data,
        headers={
            "Content-Type": "application/json",
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
        },
        method="POST",
    )
    try:
        resp = urllib.request.urlopen(req, timeout=30)
        result = json.loads(resp.read().decode())
        return result.get("content", [{}])[0].get("text", "").strip()
    except Exception as e:
        raise HTTPException(502, f"AI service error: {str(e)}")
