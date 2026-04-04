"""
prospect_routes.py — Internal endpoint for prospect lookups.

The outbound sales agent's webhook tool hits this endpoint to search
the knowledge base for prospect profiles before writing emails.

This is essentially an internal RAG search — it queries the agent's
workspace documents and returns formatted prospect context.

Endpoint: POST /api/prospect/lookup
Body: {"query": "Anatomy Fitness", "workspace_id": "...", "tenant_id": "..."}
"""
import json
from fastapi import APIRouter, HTTPException, Request

from cane.rag.search import search_text, build_tenant_where

router = APIRouter(prefix="/api/prospect", tags=["prospect"])


@router.post("/lookup")
async def lookup_prospect(request: Request):
    """
    Search the knowledge base for prospect information.

    Called by the outbound sales agent's lookup_prospect webhook tool.
    Returns formatted prospect context from uploaded prospect docs.

    Body:
      {
        "query": "Anatomy Fitness",
        "workspace_id": "optional — scope to specific agent workspace",
        "tenant_id": "optional — scope to tenant",
        "n": 5  (number of results, default 5)
      }
    """
    try:
        data = await request.json()
    except Exception:
        raise HTTPException(400, "Invalid JSON body")

    query = data.get("query", "").strip()
    if not query:
        raise HTTPException(400, "Missing required field: query")

    workspace_id = data.get("workspace_id", "")
    tenant_id = data.get("tenant_id", "")
    n = int(data.get("n", 5))

    # Build where filter for tenant/workspace scoping
    where = build_tenant_where(tenant_id, workspace_id) if tenant_id else None

    # Search the text collection
    try:
        results = search_text(query, n, where)
        hits = results.get("results", [])
    except Exception as e:
        print(f"  [Prospect] Search error: {e}")
        hits = []

    if not hits:
        return {
            "status": "no_results",
            "query": query,
            "message": f"No prospect data found for '{query}'. The prospect may not be in the knowledge base. Ask the user for details.",
            "results": [],
        }

    # Format results for the agent — clean, structured context
    formatted = []
    for r in hits:
        text = r.get("text", "").strip()
        source = r.get("source_file", "")
        score = r.get("score", 0)

        if text and len(text) > 20:
            formatted.append({
                "text": text,
                "source": source,
                "relevance": round(score, 3) if score else None,
            })

    # Build a combined context string for the agent
    context_parts = []
    for i, f in enumerate(formatted, 1):
        context_parts.append(f"--- Result {i} (from: {f['source']}) ---\n{f['text']}")

    context = "\n\n".join(context_parts)

    return {
        "status": "found",
        "query": query,
        "result_count": len(formatted),
        "context": context,
        "results": formatted,
    }


@router.get("/status")
def prospect_status():
    """Health check for prospect lookup."""
    return {"status": "ok", "service": "prospect-lookup"}
