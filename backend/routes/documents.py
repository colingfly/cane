"""
routes/documents.py — Document upload, listing, status, and deletion.
"""
import traceback
from pathlib import Path
from datetime import datetime

from fastapi import APIRouter, Query, UploadFile, File, Form, HTTPException, Depends, BackgroundTasks, Request
from sqlalchemy.orm import Session

from config import UPLOAD_DIR, EXT_MAP
from database import get_db
from db_models import Tenant, User, Workspace, Document
from auth import get_current_user, get_optional_user, require_owner
from security import validate_file_content, MAX_FILE_SIZE
from config import GUEST_TENANT_ID
from services.limits import check_document_limit, check_guest_document_limit
from services.chroma import text_col, image_col

router = APIRouter(prefix="/api", tags=["documents"])


# ── Workspace CRUD ──

@router.get("/workspaces")
def list_workspaces(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    workspaces = db.query(Workspace).filter(Workspace.tenant_id == user.tenant_id).all()
    result = []
    for w in workspaces:
        doc_count = db.query(Document).filter(
            Document.workspace_id == w.id, Document.status == "ready"
        ).count()
        result.append({
            "id": w.id, "name": w.name, "description": w.description,
            "is_default": w.is_default, "document_count": doc_count,
            "created_at": w.created_at.isoformat(),
        })
    return {"workspaces": result}


@router.post("/workspaces")
def create_workspace(
    name: str = Form(...), description: str = Form(""),
    user: User = Depends(require_owner), db: Session = Depends(get_db),
):
    ws = Workspace(tenant_id=user.tenant_id, name=name, description=description)
    db.add(ws)
    db.commit()
    db.refresh(ws)
    return {"id": ws.id, "name": ws.name}


@router.put("/workspaces/{workspace_id}")
def rename_workspace(
    workspace_id: str, name: str = Form(...), description: str = Form(""),
    user: User = Depends(require_owner), db: Session = Depends(get_db),
):
    ws = db.query(Workspace).filter(Workspace.id == workspace_id, Workspace.tenant_id == user.tenant_id).first()
    if not ws:
        raise HTTPException(404, "Workspace not found")
    existing = db.query(Workspace).filter(
        Workspace.tenant_id == user.tenant_id, Workspace.name == name, Workspace.id != workspace_id,
    ).first()
    if existing:
        raise HTTPException(400, f"Workspace '{name}' already exists")
    ws.name = name
    if description:
        ws.description = description
    db.commit()
    return {"id": ws.id, "name": ws.name, "description": ws.description}


@router.delete("/workspaces/{workspace_id}")
def delete_workspace(
    workspace_id: str, user: User = Depends(require_owner), db: Session = Depends(get_db),
):
    ws = db.query(Workspace).filter(Workspace.id == workspace_id, Workspace.tenant_id == user.tenant_id).first()
    if not ws:
        raise HTTPException(404, "Workspace not found")
    if ws.is_default:
        raise HTTPException(400, "Cannot delete the default workspace")
    doc_count = db.query(Document).filter(Document.workspace_id == workspace_id).count()
    if doc_count > 0:
        raise HTTPException(400, f"Workspace has {doc_count} documents. Delete them first.")
    db.delete(ws)
    db.commit()
    return {"status": "deleted", "name": ws.name}


# ── Document CRUD ──

@router.get("/documents")
def list_documents(
    workspace_id: str = Query(""),
    user: User = Depends(get_current_user), db: Session = Depends(get_db),
):
    q = db.query(Document).filter(Document.tenant_id == user.tenant_id)
    if workspace_id:
        q = q.filter(Document.workspace_id == workspace_id)
    docs = q.order_by(Document.created_at.desc()).all()

    return {
        "documents": [
            {
                "id": d.id, "filename": d.filename, "file_type": d.file_type,
                "file_size_bytes": d.file_size_bytes, "status": d.status,
                "chunk_count": d.chunk_count, "image_count": d.image_count,
                "workspace_id": d.workspace_id, "uploaded_by": d.uploaded_by,
                "created_at": d.created_at.isoformat(), "error_message": d.error_message,
            }
            for d in docs
        ]
    }


@router.post("/documents/upload", status_code=202)
async def upload_and_ingest(
    request: Request,
    file: UploadFile = File(...),
    workspace_id: str = Form(...),
    background_tasks: BackgroundTasks = None,
    user: User = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """Upload a file and start async ingestion (works for anonymous users)."""
    guest_session_id = request.headers.get("x-guest-session", "")

    if user:
        tenant_id = user.tenant_id
        ws = db.query(Workspace).filter(
            Workspace.id == workspace_id, Workspace.tenant_id == tenant_id,
        ).first()
        if not ws:
            raise HTTPException(400, "Invalid workspace")
        tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
        limit_err = check_document_limit(tenant_id, tenant.plan if tenant else "free", db)
    else:
        if not guest_session_id:
            raise HTTPException(400, "Guest session required")
        tenant_id = GUEST_TENANT_ID
        ws = db.query(Workspace).filter(Workspace.id == workspace_id).first()
        if not ws or ws.tenant_id != GUEST_TENANT_ID or ws.guest_session_id != guest_session_id:
            raise HTTPException(400, "Invalid workspace")
        limit_err = check_guest_document_limit(guest_session_id, db)

    if limit_err:
        raise HTTPException(403, limit_err)

    ext = Path(file.filename).suffix.lower()
    file_type = EXT_MAP.get(ext)
    if not file_type:
        raise HTTPException(400, f"Unsupported file type: {ext}")

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(400, f"File exceeds maximum size of {MAX_FILE_SIZE // (1024 * 1024)}MB")
    if len(content) == 0:
        raise HTTPException(400, "File is empty")
    content_err = validate_file_content(content, file_type)
    if content_err:
        raise HTTPException(400, content_err)

    safe_filename = Path(file.filename).name[:200]
    tenant_dir = UPLOAD_DIR / tenant_id
    tenant_dir.mkdir(parents=True, exist_ok=True)
    dest = tenant_dir / safe_filename
    with open(dest, "wb") as f:
        f.write(content)

    doc = Document(
        tenant_id=tenant_id, workspace_id=workspace_id,
        uploaded_by=user.id if user else None,
        filename=safe_filename, file_type=file_type, file_size_bytes=len(content), status="processing",
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    doc_id = doc.id
    tenant_name = ""
    if user:
        tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
        tenant_name = tenant.name if tenant else ""

    background_tasks.add_task(
        _run_ingestion_background,
        doc_id=doc_id, filepath=str(dest), tenant_id=tenant_id,
        workspace_id=workspace_id, tenant_name=tenant_name, workspace_name=ws.name,
    )

    return {
        "document_id": doc.id, "status": "processing",
        "filename": doc.filename, "message": "Upload received. Ingestion running in background.",
    }


def _run_ingestion_background(
    doc_id: str, filepath: str, tenant_id: str,
    workspace_id: str, tenant_name: str, workspace_name: str,
):
    """Background task: run extraction + indexing."""
    from database import SessionLocal
    db = SessionLocal()
    try:
        doc = db.query(Document).filter(Document.id == doc_id).first()
        if not doc:
            return

        from ingestor import Ingestor
        ing = Ingestor()
        result = ing.ingest(
            filepath=filepath, tenant_id=tenant_id, workspace_id=workspace_id,
            document_id=doc_id, company_name=tenant_name, workspace_name=workspace_name, force=True,
        )

        if result.ok:
            doc.status = "ready"
            doc.chunk_count = len(result.chunks)
            doc.image_count = len(result.images)
            doc.processed_at = datetime.utcnow()
            try:
                from hybrid_search import invalidate_index
                invalidate_index(tenant_id, workspace_id)
            except Exception:
                pass
        else:
            doc.status = "error"
            doc.error_message = result.error

        db.commit()
    except Exception as e:
        traceback.print_exc()
        try:
            doc = db.query(Document).filter(Document.id == doc_id).first()
            if doc:
                doc.status = "error"
                doc.error_message = str(e)[:500]
                db.commit()
        except Exception:
            pass
    finally:
        db.close()


@router.get("/documents/{document_id}/status")
def document_status(
    document_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db),
):
    doc = db.query(Document).filter(Document.id == document_id, Document.tenant_id == user.tenant_id).first()
    if not doc:
        raise HTTPException(404, "Document not found")
    return {
        "document_id": doc.id, "status": doc.status, "filename": doc.filename,
        "chunks": doc.chunk_count, "images": doc.image_count, "error": doc.error_message,
        "processed_at": doc.processed_at.isoformat() if doc.processed_at else None,
    }


@router.delete("/documents/{document_id}")
def delete_document(
    document_id: str, user: User = Depends(require_owner), db: Session = Depends(get_db),
):
    doc = db.query(Document).filter(Document.id == document_id, Document.tenant_id == user.tenant_id).first()
    if not doc:
        raise HTTPException(404, "Document not found")

    try:
        text_col.delete(where={"document_id": document_id})
    except Exception:
        pass
    if image_col:
        try:
            image_col.delete(where={"document_id": document_id})
        except Exception:
            pass

    tenant_dir = UPLOAD_DIR / user.tenant_id
    filepath = tenant_dir / doc.filename
    if filepath.exists():
        filepath.unlink()

    db.delete(doc)
    db.commit()

    try:
        from hybrid_search import invalidate_index
        invalidate_index(user.tenant_id, doc.workspace_id or "")
    except Exception:
        pass

    return {"status": "deleted", "filename": doc.filename}
