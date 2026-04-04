"""
routes/search.py — Search endpoint, image serving, and dashboard stats.
"""
from pathlib import Path

from fastapi import APIRouter, Query, HTTPException, Depends, Request
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy.orm import Session

from cane.core.config import EXTRACTED_DIR
from cane.core.database import get_db
from cane.core.models import Tenant, User, Workspace, Document, SearchLog
from cane.auth.jwt import get_current_user, get_optional_user
from cane.core.security import sanitize_query
from cane.core.config import GUEST_TENANT_ID
from cane.core.limits import check_search_limit
from cane.rag.search import search_text, search_visual, search_fusion, build_tenant_where

router = APIRouter(prefix="/api", tags=["search"])


@router.get("/search")
def search(
    request: Request,
    q: str = Query(...),
    mode: str = Query("text"),
    n: int = Query(10, ge=1, le=50),
    workspace_id: str = Query(""),
    user: User = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """Search documents (works for anonymous users with guest session)."""
    q = sanitize_query(q)
    if not q:
        return {"results": [], "mode": mode, "query": ""}

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

    if mode not in ("text", "visual", "fusion"):
        mode = "text"

    where = build_tenant_where(tenant_id, workspace_id)

    if mode == "text":
        result = search_text(q, n, where)
    elif mode == "visual":
        result = search_visual(q, n, where)
    elif mode == "fusion":
        result = search_fusion(q, n, where)
    else:
        result = {"results": [], "mode": mode}

    log = SearchLog(
        tenant_id=tenant_id, user_id=user.id if user else None, query=q, mode=mode,
        workspace_id=workspace_id or None,
        result_count=len(result.get("results", [])),
        top_score=str(result["results"][0]["score"]) if result.get("results") else "",
    )
    db.add(log)
    db.commit()

    return result


@router.get("/images/{file_path:path}")
def serve_image(
    file_path: str,
    token: str = Query(""),
    db: Session = Depends(get_db),
):
    """Serve extracted images with token auth."""
    if not token:
        raise HTTPException(401, "Token required")
    from cane.auth.jwt import decode_token
    payload = decode_token(token)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(401, "Invalid token")
    user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    if not user:
        raise HTTPException(401, "Unauthorized")

    safe = Path(str(EXTRACTED_DIR)) / file_path
    try:
        safe = safe.resolve()
        if not str(safe).startswith(str(Path(str(EXTRACTED_DIR)).resolve())):
            raise HTTPException(403, "Access denied")
    except Exception:
        raise HTTPException(403, "Invalid path")

    if not safe.is_file():
        raise HTTPException(404, "Image not found")

    return FileResponse(str(safe), media_type="image/jpeg")


@router.get("/stats")
def stats(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Dashboard stats for the current tenant."""
    ready_docs = db.query(Document).filter(
        Document.tenant_id == user.tenant_id, Document.status == "ready"
    ).all()

    doc_count = len(ready_docs)
    total_chunks = sum(d.chunk_count for d in ready_docs)
    total_images = sum(d.image_count for d in ready_docs)

    workspaces = db.query(Workspace).filter(Workspace.tenant_id == user.tenant_id).all()
    ws_stats = []
    for w in workspaces:
        ws_docs = db.query(Document).filter(Document.workspace_id == w.id, Document.status == "ready").count()
        ws_stats.append({"id": w.id, "name": w.name, "document_count": ws_docs})

    recent_searches = db.query(SearchLog).filter(
        SearchLog.tenant_id == user.tenant_id
    ).order_by(SearchLog.created_at.desc()).limit(20).all()

    return {
        "documents": doc_count,
        "chunks": total_chunks,
        "images": total_images,
        "workspaces": ws_stats,
        "recent_searches": [
            {"query": s.query, "mode": s.mode, "results": s.result_count, "time": s.created_at.isoformat()}
            for s in recent_searches
        ],
    }
