"""
routes/demo.py — Ephemeral demo sessions.

Each visitor to /demo gets their own isolated workspace.
Uploads and queries are scoped to that workspace only.
Old demo workspaces are cleaned up automatically.
"""
import uuid
import traceback
from pathlib import Path
from datetime import datetime, timedelta

from fastapi import APIRouter, UploadFile, File, Form, HTTPException, BackgroundTasks, Request
from sqlalchemy.orm import Session

from config import UPLOAD_DIR, EXT_MAP
from database import get_db, SessionLocal
from db_models import Tenant, Workspace, Document
from security import validate_file_content, MAX_FILE_SIZE
from services.chroma import text_col, image_col

router = APIRouter(prefix="/api/demo", tags=["demo"])

# Demo constraints
DEMO_TENANT_SLUG = "cane-demo-public"
DEMO_MAX_FILES = 3
DEMO_MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB
DEMO_WORKSPACE_TTL_HOURS = 24
DEMO_ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt", ".csv"}

# Simple in-memory rate limit: max 20 sessions per IP per hour
_session_log: dict[str, list[float]] = {}
DEMO_SESSION_RATE_LIMIT = 20


def _get_or_create_demo_tenant(db: Session) -> Tenant:
    """Get or create the shared demo tenant."""
    tenant = db.query(Tenant).filter(Tenant.slug == DEMO_TENANT_SLUG).first()
    if not tenant:
        tenant = Tenant(
            name="Cane Demo",
            slug=DEMO_TENANT_SLUG,
            plan="free",
            is_active=True,
        )
        db.add(tenant)
        db.commit()
        db.refresh(tenant)
        print(f"[Demo] Created demo tenant: {tenant.id}")
    return tenant


def _cleanup_old_workspaces(db: Session, tenant_id: str):
    """Delete demo workspaces older than TTL."""
    cutoff = datetime.utcnow() - timedelta(hours=DEMO_WORKSPACE_TTL_HOURS)
    old_workspaces = db.query(Workspace).filter(
        Workspace.tenant_id == tenant_id,
        Workspace.created_at < cutoff,
    ).all()

    for ws in old_workspaces:
        # Delete chunks from ChromaDB
        try:
            text_col.delete(where={"workspace_id": ws.id})
        except Exception:
            pass
        if image_col:
            try:
                image_col.delete(where={"workspace_id": ws.id})
            except Exception:
                pass

        # Delete uploaded files
        tenant_dir = UPLOAD_DIR / tenant_id
        docs = db.query(Document).filter(Document.workspace_id == ws.id).all()
        for doc in docs:
            filepath = tenant_dir / doc.filename
            if filepath.exists():
                try:
                    filepath.unlink()
                except Exception:
                    pass
            db.delete(doc)

        db.delete(ws)

    if old_workspaces:
        db.commit()
        print(f"[Demo] Cleaned up {len(old_workspaces)} expired demo workspaces")


def _check_rate_limit(ip: str) -> bool:
    """Return True if rate-limited."""
    import time
    now = time.time()
    hour_ago = now - 3600

    if ip not in _session_log:
        _session_log[ip] = []

    # Prune old entries
    _session_log[ip] = [t for t in _session_log[ip] if t > hour_ago]

    if len(_session_log[ip]) >= DEMO_SESSION_RATE_LIMIT:
        return True

    _session_log[ip].append(now)
    return False


@router.post("/session")
def create_demo_session(request: Request, db: Session = next(get_db())):
    """Create an ephemeral demo workspace. Returns workspace_id and api_key."""
    db = SessionLocal()
    try:
        client_ip = request.client.host if request.client else "unknown"
        if _check_rate_limit(client_ip):
            raise HTTPException(429, "Too many demo sessions. Try again later.")

        tenant = _get_or_create_demo_tenant(db)

        # Cleanup old workspaces opportunistically
        _cleanup_old_workspaces(db, tenant.id)

        # Create a fresh workspace for this session
        session_id = str(uuid.uuid4())[:8]
        ws = Workspace(
            tenant_id=tenant.id,
            name=f"Demo Session {session_id}",
            description="Ephemeral demo workspace",
            is_default=False,
        )
        db.add(ws)
        db.commit()
        db.refresh(ws)

        # Find or create an API key for the demo tenant
        from db_models import ApiKey
        from auth import hash_password
        import secrets

        # Use a non-scoped API key for the demo tenant (queries need workspace_id param)
        api_key_record = db.query(ApiKey).filter(
            ApiKey.tenant_id == tenant.id,
            ApiKey.is_active == True,
            ApiKey.workspace_id == None,
        ).first()

        if api_key_record:
            # We can't retrieve the raw key from the hash, so check if we have one stored
            # For demo, we'll create a new key each time the tenant is fresh
            raw_key = None
        else:
            raw_key = None

        # Always provide the key — generate a fresh one if needed
        if not api_key_record:
            raw_key = f"cane_{secrets.token_hex(24)}"
            api_key_record = ApiKey(
                tenant_id=tenant.id,
                name="Demo API Key",
                key_hash=hash_password(raw_key),
                key_prefix=raw_key[:12],
                workspace_id=None,  # Not scoped — workspace comes from request body
                is_active=True,
                rate_limit=100,
            )
            db.add(api_key_record)
            db.commit()
            db.refresh(api_key_record)

            # Store the raw key in an env-like way for this session
            # We'll store it on the tenant description (hacky but works for demo)
            tenant.name = "Cane Demo"  # ensure name stays clean
            db.commit()

        # For returning the key: if we just created it, return raw_key
        # Otherwise we need a mechanism to retrieve it — store it as a known demo key
        # Simplest: use a fixed demo key prefix that we can always verify
        if not raw_key:
            # Generate a new one and replace the old
            raw_key = f"cane_{secrets.token_hex(24)}"
            api_key_record.key_hash = hash_password(raw_key)
            api_key_record.key_prefix = raw_key[:12]
            db.commit()

        return {
            "workspace_id": ws.id,
            "api_key": raw_key,
            "tenant_id": tenant.id,
            "expires_in_hours": DEMO_WORKSPACE_TTL_HOURS,
        }
    finally:
        db.close()


@router.post("/upload", status_code=202)
async def demo_upload(
    file: UploadFile = File(...),
    workspace_id: str = Form(...),
    background_tasks: BackgroundTasks = None,
):
    """Upload a file to a demo workspace. No auth required."""
    db = SessionLocal()
    try:
        tenant = db.query(Tenant).filter(Tenant.slug == DEMO_TENANT_SLUG).first()
        if not tenant:
            raise HTTPException(400, "Demo not available")

        ws = db.query(Workspace).filter(
            Workspace.id == workspace_id,
            Workspace.tenant_id == tenant.id,
        ).first()
        if not ws:
            raise HTTPException(400, "Invalid demo session")

        # Check file count limit
        doc_count = db.query(Document).filter(Document.workspace_id == workspace_id).count()
        if doc_count >= DEMO_MAX_FILES:
            raise HTTPException(400, f"Demo limit: max {DEMO_MAX_FILES} files")

        # Validate extension
        ext = Path(file.filename).suffix.lower()
        if ext not in DEMO_ALLOWED_EXTENSIONS:
            raise HTTPException(400, f"Unsupported file type: {ext}. Allowed: PDF, DOCX, TXT, CSV")

        file_type = EXT_MAP.get(ext)
        if not file_type:
            raise HTTPException(400, f"Unsupported file type: {ext}")

        # Read and validate content
        content = await file.read()
        if len(content) > DEMO_MAX_FILE_SIZE:
            raise HTTPException(400, f"File exceeds {DEMO_MAX_FILE_SIZE // (1024 * 1024)}MB demo limit")
        if len(content) == 0:
            raise HTTPException(400, "File is empty")

        content_err = validate_file_content(content, file_type)
        if content_err:
            raise HTTPException(400, content_err)

        # Save file
        safe_filename = Path(file.filename).name[:200]
        tenant_dir = UPLOAD_DIR / tenant.id
        tenant_dir.mkdir(parents=True, exist_ok=True)
        dest = tenant_dir / safe_filename
        with open(dest, "wb") as f:
            f.write(content)

        # Create document record
        doc = Document(
            tenant_id=tenant.id,
            workspace_id=workspace_id,
            uploaded_by=None,  # No user in demo
            filename=safe_filename,
            file_type=file_type,
            file_size_bytes=len(content),
            status="processing",
        )
        db.add(doc)
        db.commit()
        db.refresh(doc)

        doc_id = doc.id
        tenant_id = tenant.id

        # Run ingestion in background
        background_tasks.add_task(
            _run_demo_ingestion,
            doc_id=doc_id,
            filepath=str(dest),
            tenant_id=tenant_id,
            workspace_id=workspace_id,
        )

        return {
            "document_id": doc.id,
            "status": "processing",
            "filename": doc.filename,
            "message": "Upload received. Processing...",
        }
    finally:
        db.close()


@router.get("/documents/{workspace_id}")
def demo_documents(workspace_id: str):
    """List documents in a demo workspace."""
    db = SessionLocal()
    try:
        tenant = db.query(Tenant).filter(Tenant.slug == DEMO_TENANT_SLUG).first()
        if not tenant:
            return {"documents": []}

        ws = db.query(Workspace).filter(
            Workspace.id == workspace_id,
            Workspace.tenant_id == tenant.id,
        ).first()
        if not ws:
            return {"documents": []}

        docs = db.query(Document).filter(
            Document.workspace_id == workspace_id,
        ).order_by(Document.created_at.desc()).all()

        return {
            "documents": [
                {
                    "id": d.id,
                    "filename": d.filename,
                    "status": d.status,
                    "chunk_count": d.chunk_count,
                    "error_message": d.error_message,
                }
                for d in docs
            ]
        }
    finally:
        db.close()


def _run_demo_ingestion(doc_id: str, filepath: str, tenant_id: str, workspace_id: str):
    """Background task: ingest a demo file."""
    db = SessionLocal()
    try:
        doc = db.query(Document).filter(Document.id == doc_id).first()
        if not doc:
            return

        from ingestor import Ingestor
        ing = Ingestor()
        result = ing.ingest(
            filepath=filepath,
            tenant_id=tenant_id,
            workspace_id=workspace_id,
            document_id=doc_id,
            company_name="Demo",
            workspace_name="Demo Session",
            force=True,
        )

        if result.ok:
            doc.status = "ready"
            doc.chunk_count = len(result.chunks)
            doc.image_count = len(result.images)
            doc.processed_at = datetime.utcnow()
        else:
            doc.status = "error"
            doc.error_message = result.error

        db.commit()
        print(f"[Demo] Ingested {doc.filename}: {doc.status} ({doc.chunk_count} chunks)")
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
