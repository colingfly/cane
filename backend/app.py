# deploy-v5
"""
app.py â€” Cane API Server.

Multi-tenant document search API with auth.
Frontend is a separate React app.

Usage:
    python app.py
    â†’ API at http://localhost:8000
    â†’ Frontend at http://localhost:5173 (Vite dev server)
"""
import os
import sys
import shutil
import traceback
from pathlib import Path
from datetime import datetime
from typing import Optional

_root = str(Path(__file__).resolve().parent)
if _root not in sys.path:
    sys.path.insert(0, _root)

from fastapi import FastAPI, Query, UploadFile, File, Form, HTTPException, Depends, Request, BackgroundTasks
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import chromadb
from chromadb.utils import embedding_functions
from sqlalchemy.orm import Session

from config import (
    BASE_DIR, INPUT_DIR, DB_PATH, EXTRACTED_DIR, UPLOAD_DIR,
    TEXT_COLLECTION, IMAGE_COLLECTION,
    TEXT_EMBED_MODEL, CLIP_MODEL, EXT_MAP,
    ALLOWED_ORIGINS, IS_PRODUCTION,
    ensure_dirs,
)
from database import get_db, init_db
from db_models import Tenant, User, Workspace, Document, SearchLog
from auth import (
    get_current_user, require_owner, require_admin,
    hash_password, verify_password, create_token,
)
from agent_prompts import get_template, list_templates, auto_generate_prompt, AGENT_TEMPLATES
from security import (
    login_limiter, validate_password, validate_file_content,
    sanitize_query, sanitize_form_field, validate_email,
    SecurityHeadersMiddleware, RequestIDMiddleware,
    MAX_FILE_SIZE,
)

# -- Plan Limits --
PLAN_LIMITS = {
    "free":     {"max_agents": 1,  "max_documents": 3,  "max_searches_month": 50},
    "pro":      {"max_agents": 3,  "max_documents": -1, "max_searches_month": -1},   # -1 = unlimited
    "business": {"max_agents": -1, "max_documents": -1, "max_searches_month": -1},
}

def _get_plan_limits(plan: str) -> dict:
    return PLAN_LIMITS.get(plan, PLAN_LIMITS["free"])

def _check_agent_limit(tenant_id: str, plan: str, db: Session) -> str | None:
    limits = _get_plan_limits(plan)
    if limits["max_agents"] == -1:
        return None
    count = db.query(Workspace).filter(
        Workspace.tenant_id == tenant_id,
        Workspace.is_default == False,
    ).count()
    if count >= limits["max_agents"]:
        return f"Free plan allows {limits['max_agents']} agent. Delete an existing agent or upgrade to Pro."
    return None

def _check_document_limit(tenant_id: str, plan: str, db: Session) -> str | None:
    limits = _get_plan_limits(plan)
    if limits["max_documents"] == -1:
        return None
    count = db.query(Document).filter(Document.tenant_id == tenant_id).count()
    if count >= limits["max_documents"]:
        return f"Free plan allows {limits['max_documents']} documents. Delete existing documents or upgrade to Pro."
    return None

def _check_search_limit(tenant_id: str, plan: str, db: Session) -> str | None:
    limits = _get_plan_limits(plan)
    if limits["max_searches_month"] == -1:
        return None
    first_of_month = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    count = db.query(SearchLog).filter(
        SearchLog.tenant_id == tenant_id,
        SearchLog.created_at >= first_of_month,
    ).count()
    if count >= limits["max_searches_month"]:
        return f"Free plan allows {limits['max_searches_month']} searches per month. Upgrade to Pro for unlimited searches."
    return None

# â”€â”€ Boot â”€â”€
ensure_dirs()
init_db()

# Migrate: add agent columns to workspaces table if missing
def _migrate_agent_columns():
    from sqlalchemy import inspect, text
    from database import engine
    insp = inspect(engine)
    cols = {c["name"] for c in insp.get_columns("workspaces")}
    migrations = {
        "agent_type": "ALTER TABLE workspaces ADD COLUMN agent_type VARCHAR(50) NULL",
        "system_prompt": "ALTER TABLE workspaces ADD COLUMN system_prompt TEXT NULL",
        "agent_icon": "ALTER TABLE workspaces ADD COLUMN agent_icon VARCHAR(10) NULL",
        "agent_description": "ALTER TABLE workspaces ADD COLUMN agent_description TEXT NULL",
        "show_on_homepage": "ALTER TABLE workspaces ADD COLUMN show_on_homepage TINYINT(1) DEFAULT 0",
    }
    added = []
    for col_name, sql in migrations.items():
        if col_name not in cols:
            try:
                with engine.begin() as conn:
                    conn.execute(text(sql))
                added.append(col_name)
            except Exception as e:
                print(f"  [DB] Failed to add {col_name}: {e}")
    if added:
        print(f"  [DB] Agent columns added: {', '.join(added)}")
    else:
        print("  [DB] Agent columns already present")

try:
    _migrate_agent_columns()
except Exception as e:
    print(f"  [DB] Migration skipped: {e}")

# Migrate: create api_keys table if missing
def _migrate_api_keys_table():
    from sqlalchemy import inspect, text
    from database import engine
    insp = inspect(engine)
    if "api_keys" not in insp.get_table_names():
        with engine.begin() as conn:
            conn.execute(text("""
                CREATE TABLE api_keys (
                    id VARCHAR(36) PRIMARY KEY,
                    tenant_id VARCHAR(36) NOT NULL,
                    name VARCHAR(255) NOT NULL,
                    key_hash VARCHAR(255) NOT NULL,
                    key_prefix VARCHAR(12) NOT NULL,
                    workspace_id VARCHAR(36) NULL,
                    is_active TINYINT(1) DEFAULT 1,
                    requests_today INT DEFAULT 0,
                    rate_limit INT DEFAULT 1000,
                    last_used_at DATETIME NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
                )
            """))
        print("  [DB] api_keys table created")
    else:
        print("  [DB] api_keys table already exists")

try:
    _migrate_api_keys_table()
except Exception as e:
    print(f"  [DB] api_keys migration skipped: {e}")

# Auto-seed admin on first deploy
from auto_seed import auto_seed
auto_seed()

print(f"""
{'='*60}
  Cane â€” Document Intelligence API
{'='*60}
  BASE:      {BASE_DIR}
  DB:        {DB_PATH}
  EXTRACTED: {EXTRACTED_DIR}
""")

chroma_client = chromadb.PersistentClient(path=DB_PATH)

# Embedding model — uses OpenAI if key is set, otherwise local BGE
from config import get_embedding_function, get_active_embed_id
ef = get_embedding_function()

# Detect embedding model change — incompatible vectors need re-ingestion
_embed_marker_path = Path(DB_PATH) / ".embed_model"
_active_embed = get_active_embed_id()
_prev_embed = _embed_marker_path.read_text().strip() if _embed_marker_path.exists() else None

if _prev_embed and _prev_embed != _active_embed:
    print(f"\n  ⚠️  EMBEDDING MODEL CHANGED: {_prev_embed} → {_active_embed}")
    print(f"  Clearing old embeddings — documents must be re-uploaded.\n")
    try:
        chroma_client.delete_collection(TEXT_COLLECTION)
    except Exception:
        pass

_embed_marker_path.write_text(_active_embed)

text_col = chroma_client.get_or_create_collection(TEXT_COLLECTION, embedding_function=ef)

try:
    image_col = chroma_client.get_collection(IMAGE_COLLECTION)
except Exception:
    image_col = None

print(f"  Chunks: {text_col.count()}")
print(f"  Images: {image_col.count() if image_col else 0}")
print(f"\n  â†’ http://localhost:8000\n{'='*60}\n")

# â”€â”€ App â”€â”€
app = FastAPI(title="Cane", version="1.0.0", docs_url=None if IS_PRODUCTION else "/docs")
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RequestIDMiddleware)
# Prevent Cloudflare from caching API responses
@app.middleware("http")
async def add_cache_headers(request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
    return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# â”€â”€ Score thresholds â”€â”€
TEXT_SCORE_THRESHOLD = 0.70

# -- Eval Routes (Environments) --
from eval_routes import router as eval_router
app.include_router(eval_router)

# -- Marketplace Routes --
from marketplace_routes import router as marketplace_router
app.include_router(marketplace_router)

FUSION_SCORE_THRESHOLD = 0.30

# â”€â”€ Quality filter â”€â”€
import re as _re
from chunk_quality import is_quality_chunk as _is_quality_chunk


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#  AUTH ENDPOINTS
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

@app.post("/api/auth/login")
def login(request: Request, email: str = Form(...), password: str = Form(...), db: Session = Depends(get_db)):
    """Authenticate and return a JWT."""
    # Rate limiting by IP
    client_ip = request.client.host if request.client else "unknown"
    if login_limiter.is_locked(client_ip):
        remaining = login_limiter.remaining_lockout(client_ip)
        raise HTTPException(429, f"Too many failed attempts. Try again in {remaining} seconds.")

    # Sanitize inputs
    email = sanitize_form_field(email).lower()
    email_err = validate_email(email)
    if email_err:
        raise HTTPException(400, email_err)

    user = db.query(User).filter(User.email == email, User.is_active == True).first()
    if not user or not verify_password(password, user.password_hash):
        login_limiter.record_failure(client_ip)
        raise HTTPException(401, "Invalid email or password")

    login_limiter.record_success(client_ip)
    user.last_login = datetime.utcnow()
    db.commit()

    tenant = db.query(Tenant).filter(Tenant.id == user.tenant_id).first()

    return {
        "token": create_token(user.id, user.tenant_id, user.role),
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "role": user.role,
        },
        "tenant": {
            "id": tenant.id,
            "name": tenant.name,
            "slug": tenant.slug,
            "plan": tenant.plan or "free",
        },
    }


@app.get("/api/auth/me")
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Return current user + tenant info."""
    tenant = db.query(Tenant).filter(Tenant.id == user.tenant_id).first()
    workspaces = db.query(Workspace).filter(Workspace.tenant_id == user.tenant_id).all()

    return {
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "role": user.role,
        },
        "tenant": {
            "id": tenant.id,
            "name": tenant.name,
            "slug": tenant.slug,
            "plan": tenant.plan or "free",
        },
        "workspaces": [
            {
                "id": w.id, "name": w.name, "is_default": w.is_default,
                "agent_type": getattr(w, "agent_type", None),
                "agent_icon": getattr(w, "agent_icon", "") or "",
                "show_on_homepage": getattr(w, "show_on_homepage", False) or False,
            }
            for w in workspaces
        ],
    }



@app.post("/api/auth/register")
def register(
    request: Request,
    email: str = Form(...),
    password: str = Form(...),
    name: str = Form(""),
    company_name: str = Form(""),
    db: Session = Depends(get_db),
):
    """Self-service signup: creates tenant + owner + default workspace + returns JWT."""
    import re as _re

    # Rate limit by IP (reuse login limiter)
    client_ip = request.client.host if request.client else "unknown"
    if login_limiter.is_locked(client_ip):
        remaining = login_limiter.remaining_lockout(client_ip)
        raise HTTPException(429, f"Too many attempts. Try again in {remaining} seconds.")

    # Sanitize + validate
    email = sanitize_form_field(email).lower()
    name = sanitize_form_field(name)
    company_name = sanitize_form_field(company_name)

    email_err = validate_email(email)
    if email_err:
        raise HTTPException(400, email_err)
    pwd_err = validate_password(password)
    if pwd_err:
        raise HTTPException(400, pwd_err)

    # Check if email already exists
    existing = db.query(User).filter(User.email == email).first()
    if existing:
        login_limiter.record_failure(client_ip)
        raise HTTPException(400, "An account with this email already exists")

    # Generate slug from company name or email domain
    if company_name:
        slug = _re.sub(r'[^a-z0-9]+', '-', company_name.lower()).strip('-')[:50]
    else:
        slug = email.split('@')[0]
        slug = _re.sub(r'[^a-z0-9]+', '-', slug.lower()).strip('-')[:50]

    # Ensure slug is unique
    base_slug = slug
    counter = 1
    while db.query(Tenant).filter(Tenant.slug == slug).first():
        slug = f"{base_slug}-{counter}"
        counter += 1

    # Create tenant
    tenant = Tenant(
        name=company_name or name or email.split('@')[0],
        slug=slug,
    )
    db.add(tenant)
    db.flush()

    # Create default workspace
    ws = Workspace(
        tenant_id=tenant.id,
        name="Documents",
        description="Default workspace",
        is_default=True,
    )
    db.add(ws)

    # Create owner user
    user = User(
        tenant_id=tenant.id,
        email=email,
        password_hash=hash_password(password),
        name=name,
        role="owner",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    login_limiter.record_success(client_ip)

    return {
        "token": create_token(user.id, user.tenant_id, user.role),
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "role": user.role,
        },
        "tenant": {
            "id": tenant.id,
            "name": tenant.name,
            "slug": tenant.slug,
            "plan": tenant.plan or "free",
        },
    }


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#  WORKSPACE ENDPOINTS
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

@app.get("/api/workspaces")
def list_workspaces(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """List all workspaces for the current tenant."""
    workspaces = db.query(Workspace).filter(Workspace.tenant_id == user.tenant_id).all()
    result = []
    for w in workspaces:
        doc_count = db.query(Document).filter(
            Document.workspace_id == w.id, Document.status == "ready"
        ).count()
        result.append({
            "id": w.id,
            "name": w.name,
            "description": w.description,
            "is_default": w.is_default,
            "document_count": doc_count,
            "created_at": w.created_at.isoformat(),
        })
    return {"workspaces": result}


@app.post("/api/workspaces")
def create_workspace(
    name: str = Form(...),
    description: str = Form(""),
    user: User = Depends(require_owner),
    db: Session = Depends(get_db),
):
    """Create a new workspace (owner only)."""
    ws = Workspace(
        tenant_id=user.tenant_id,
        name=name,
        description=description,
    )
    db.add(ws)
    db.commit()
    db.refresh(ws)
    return {"id": ws.id, "name": ws.name}



@app.put("/api/workspaces/{workspace_id}")
def rename_workspace(
    workspace_id: str,
    name: str = Form(...),
    description: str = Form(""),
    user: User = Depends(require_owner),
    db: Session = Depends(get_db),
):
    """Rename a workspace (owner only)."""
    ws = db.query(Workspace).filter(
        Workspace.id == workspace_id,
        Workspace.tenant_id == user.tenant_id,
    ).first()
    if not ws:
        raise HTTPException(404, "Workspace not found")

    existing = db.query(Workspace).filter(
        Workspace.tenant_id == user.tenant_id,
        Workspace.name == name,
        Workspace.id != workspace_id,
    ).first()
    if existing:
        raise HTTPException(400, f"Workspace '{name}' already exists")

    ws.name = name
    if description:
        ws.description = description
    db.commit()

    return {"id": ws.id, "name": ws.name, "description": ws.description}


@app.delete("/api/workspaces/{workspace_id}")
def delete_workspace(
    workspace_id: str,
    user: User = Depends(require_owner),
    db: Session = Depends(get_db),
):
    """Delete a workspace (owner only). Cannot delete the default workspace."""
    ws = db.query(Workspace).filter(
        Workspace.id == workspace_id,
        Workspace.tenant_id == user.tenant_id,
    ).first()
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


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#  DOCUMENT ENDPOINTS
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

@app.get("/api/documents")
def list_documents(
    workspace_id: str = Query(""),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List documents for the current tenant, optionally filtered by workspace."""
    q = db.query(Document).filter(Document.tenant_id == user.tenant_id)
    if workspace_id:
        q = q.filter(Document.workspace_id == workspace_id)
    docs = q.order_by(Document.created_at.desc()).all()

    return {
        "documents": [
            {
                "id": d.id,
                "filename": d.filename,
                "file_type": d.file_type,
                "file_size_bytes": d.file_size_bytes,
                "status": d.status,
                "chunk_count": d.chunk_count,
                "image_count": d.image_count,
                "workspace_id": d.workspace_id,
                "uploaded_by": d.uploaded_by,
                "created_at": d.created_at.isoformat(),
                "error_message": d.error_message,
            }
            for d in docs
        ]
    }


@app.post("/api/documents/upload", status_code=202)
async def upload_and_ingest(
    file: UploadFile = File(...),
    workspace_id: str = Form(...),
    background_tasks: BackgroundTasks = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Upload a file and start async ingestion. Returns 202 immediately."""
    # Validate workspace belongs to tenant
    ws = db.query(Workspace).filter(
        Workspace.id == workspace_id,
        Workspace.tenant_id == user.tenant_id,
    ).first()
    if not ws:
        raise HTTPException(400, "Invalid workspace")

    # Plan limit check
    tenant = db.query(Tenant).filter(Tenant.id == user.tenant_id).first()
    limit_err = _check_document_limit(user.tenant_id, tenant.plan if tenant else "free", db)
    if limit_err:
        raise HTTPException(403, limit_err)

    # Validate file type
    ext = Path(file.filename).suffix.lower()
    file_type = EXT_MAP.get(ext)
    if not file_type:
        raise HTTPException(400, f"Unsupported file type: {ext}")

    # Read and validate file content
    content = await file.read()

    if len(content) > MAX_FILE_SIZE:
        mb = MAX_FILE_SIZE // (1024 * 1024)
        raise HTTPException(400, f"File exceeds maximum size of {mb}MB")

    if len(content) == 0:
        raise HTTPException(400, "File is empty")

    # Validate magic bytes match claimed type
    content_err = validate_file_content(content, file_type)
    if content_err:
        raise HTTPException(400, content_err)

    # Sanitize filename
    safe_filename = Path(file.filename).name[:200]

    # Save file to tenant-specific upload dir
    tenant_dir = UPLOAD_DIR / user.tenant_id
    tenant_dir.mkdir(parents=True, exist_ok=True)
    dest = tenant_dir / safe_filename
    with open(dest, "wb") as f:
        f.write(content)

    # Create document record
    doc = Document(
        tenant_id=user.tenant_id,
        workspace_id=workspace_id,
        uploaded_by=user.id,
        filename=safe_filename,
        file_type=file_type,
        file_size_bytes=len(content),
        status="processing",
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    # Capture values for background task (can't use request-scoped db session)
    doc_id = doc.id
    tenant_id = user.tenant_id
    tenant_obj = db.query(Tenant).filter(Tenant.id == user.tenant_id).first()
    tenant_name = tenant_obj.name if tenant_obj else ""
    ws_name = ws.name
    filepath = str(dest)

    # Kick off ingestion in background — returns 202 immediately
    background_tasks.add_task(
        _run_ingestion_background,
        doc_id=doc_id,
        filepath=filepath,
        tenant_id=tenant_id,
        workspace_id=workspace_id,
        tenant_name=tenant_name,
        workspace_name=ws_name,
    )

    return {
        "document_id": doc.id,
        "status": "processing",
        "filename": doc.filename,
        "message": "Upload received. Ingestion running in background.",
    }


def _run_ingestion_background(
    doc_id: str,
    filepath: str,
    tenant_id: str,
    workspace_id: str,
    tenant_name: str,
    workspace_name: str,
):
    """Background task: run extraction + indexing with its own DB session."""
    from database import SessionLocal
    db = SessionLocal()
    try:
        doc = db.query(Document).filter(Document.id == doc_id).first()
        if not doc:
            print(f"  [BG] Document {doc_id} not found, aborting")
            return

        print(f"  [BG] Starting ingestion for {doc.filename}...")

        from ingestor import Ingestor
        ing = Ingestor()

        result = ing.ingest(
            filepath=filepath,
            tenant_id=tenant_id,
            workspace_id=workspace_id,
            document_id=doc_id,
            company_name=tenant_name,
            workspace_name=workspace_name,
            force=True,
        )

        if result.ok:
            doc.status = "ready"
            doc.chunk_count = len(result.chunks)
            doc.image_count = len(result.images)
            doc.processed_at = datetime.utcnow()
            print(f"  [BG] Done: {doc.filename} -> {doc.chunk_count} chunks, {doc.image_count} images")

            # Invalidate BM25 keyword index so it rebuilds with new content
            try:
                from hybrid_search import invalidate_index
                invalidate_index(tenant_id, workspace_id)
            except Exception:
                pass
        else:
            doc.status = "error"
            doc.error_message = result.error
            print(f"  [BG] Error: {doc.filename} -> {result.error}")

        db.commit()

    except Exception as e:
        print(f"  [BG] Ingestion failed for {doc_id}: {e}")
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


@app.get("/api/documents/{document_id}/status")
def document_status(
    document_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Poll document processing status."""
    doc = db.query(Document).filter(
        Document.id == document_id,
        Document.tenant_id == user.tenant_id,
    ).first()
    if not doc:
        raise HTTPException(404, "Document not found")

    return {
        "document_id": doc.id,
        "status": doc.status,
        "filename": doc.filename,
        "chunks": doc.chunk_count,
        "images": doc.image_count,
        "error": doc.error_message,
        "processed_at": doc.processed_at.isoformat() if doc.processed_at else None,
    }


@app.delete("/api/documents/{document_id}")
def delete_document(
    document_id: str,
    user: User = Depends(require_owner),
    db: Session = Depends(get_db),
):
    """Delete a document and its chunks from the vector store (owner only)."""
    doc = db.query(Document).filter(
        Document.id == document_id,
        Document.tenant_id == user.tenant_id,
    ).first()
    if not doc:
        raise HTTPException(404, "Document not found")

    # Remove chunks from ChromaDB by document_id
    try:
        text_col.delete(where={"document_id": document_id})
    except Exception:
        pass

    if image_col:
        try:
            image_col.delete(where={"document_id": document_id})
        except Exception:
            pass

    # Remove file from disk
    tenant_dir = UPLOAD_DIR / user.tenant_id
    filepath = tenant_dir / doc.filename
    if filepath.exists():
        filepath.unlink()

    db.delete(doc)
    db.commit()

    # Invalidate BM25 keyword index
    try:
        from hybrid_search import invalidate_index
        invalidate_index(user.tenant_id, doc.workspace_id or "")
    except Exception:
        pass

    return {"status": "deleted", "filename": doc.filename}


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#  SEARCH ENDPOINTS
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

# â”€â”€ Cross-Encoder (lazy-loaded) â”€â”€
_cross_encoder = None
_cross_encoder_failed = False

def _get_cross_encoder():
    global _cross_encoder, _cross_encoder_failed
    if _cross_encoder_failed:
        return None
    if _cross_encoder is not None:
        return _cross_encoder
    try:
        from sentence_transformers import CrossEncoder
        print("[Reranker] Loading cross-encoder...")
        _cross_encoder = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2")
        print("[Reranker] Ready")
        return _cross_encoder
    except Exception as e:
        print(f"[Reranker] Not available: {e}")
        _cross_encoder_failed = True
        return None


def _rerank_results(query: str, results: list, blend: float = 0.6) -> list:
    ce = _get_cross_encoder()
    if ce is None or not results:
        return results
    pairs = [[query, r.get("text", "")[:512]] for r in results]
    try:
        scores = ce.predict(pairs)
    except Exception:
        return results
    min_s, max_s = float(min(scores)), float(max(scores))
    rng = max_s - min_s if max_s != min_s else 1.0
    normed = [(float(s) - min_s) / rng for s in scores]
    for i, r in enumerate(results):
        r["rerank_score"] = round(float(normed[i]), 4)
        orig = r.get("score", 0.5)
        r["score"] = round(blend * normed[i] + (1 - blend) * orig, 4)
    results.sort(key=lambda r: r["score"], reverse=True)
    for i, r in enumerate(results):
        r["rank"] = i + 1
    return results


def _dedup_results(results: list, sim_threshold: float = 0.85) -> list:
    if not results:
        return results
    def _text_sim(a: str, b: str) -> float:
        if not a or not b:
            return 0.0
        wa, wb = set(a.lower().split()), set(b.lower().split())
        if not wa or not wb:
            return 0.0
        return len(wa & wb) / len(wa | wb)
    kept = []
    for r in results:
        is_dup = False
        for k in kept:
            if r.get("source_file") == k.get("source_file"):
                if _text_sim(r.get("text", ""), k.get("text", "")) >= sim_threshold:
                    is_dup = True
                    break
        if not is_dup:
            kept.append(r)
    for i, r in enumerate(kept):
        r["rank"] = i + 1
    return kept


def _build_tenant_where(tenant_id: str, workspace_id: str = "") -> dict:
    """Build a ChromaDB where clause scoped to tenant + optional workspace."""
    conditions = [{"tenant_id": tenant_id}]
    if workspace_id:
        conditions.append({"workspace_id": workspace_id})
    if len(conditions) > 1:
        return {"$and": conditions}
    return conditions[0]


# â”€â”€ Transcript cleanup â”€â”€
import re as _re_mod
_TRANSCRIPT_FIXES = [
    (r'(?i)\boutcall\s+chains?\b', 'alkyl chain'),
    (r'(?i)\boutcalls?\b', 'alkyl'),
    (r'(?i)\boutcains?\b', 'alkanes'),
    (r'(?i)\balcohol\s+halibut\b', 'alkyl halides'),
    (r'(?i)\balcohol\s+halides?\b', 'alkyl halide'),
    (r'(?i)\bnew\s+clear\s+files?\b', 'nucleophile'),
    (r'(?i)\belectro\s+files?\b', 'electrophile'),
    (r'(?i)\bcarbock\s+sealic\b', 'carboxylic'),
]

def _clean_transcript(text: str) -> str:
    if not text:
        return text
    for pattern, replacement in _TRANSCRIPT_FIXES:
        text = _re_mod.sub(pattern, replacement, text)
    return text


@app.get("/api/search")
def search(
    q: str = Query(...),
    mode: str = Query("text"),
    n: int = Query(10, ge=1, le=50),
    workspace_id: str = Query(""),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Search documents scoped to the authenticated user's tenant."""
    q = sanitize_query(q)
    if not q:
        return {"results": [], "mode": mode, "query": ""}

    # Plan limit check
    tenant = db.query(Tenant).filter(Tenant.id == user.tenant_id).first()
    limit_err = _check_search_limit(user.tenant_id, tenant.plan if tenant else "free", db)
    if limit_err:
        return JSONResponse({"error": limit_err}, status_code=403)

    if mode not in ("text", "visual", "fusion"):
        mode = "text"

    where = _build_tenant_where(user.tenant_id, workspace_id)

    if mode == "text":
        result = _search_text(q, n, where)
    elif mode == "visual":
        result = _search_visual(q, n, where)
    elif mode == "fusion":
        result = _search_fusion(q, n, where)
    else:
        result = {"results": [], "mode": mode}

    # Log the search
    log = SearchLog(
        tenant_id=user.tenant_id,
        user_id=user.id,
        query=q,
        mode=mode,
        workspace_id=workspace_id or None,
        result_count=len(result.get("results", [])),
        top_score=str(result["results"][0]["score"]) if result.get("results") else "",
    )
    db.add(log)
    db.commit()

    return result


def _search_text(q, n, where):
    if text_col.count() == 0:
        return {"results": [], "mode": "text", "total": 0}

    fetch_n = min(n * 3, text_col.count())
    kwargs = {"query_texts": [q], "n_results": fetch_n, "include": ["documents", "metadatas", "distances"]}
    if where:
        kwargs["where"] = where

    try:
        r = text_col.query(**kwargs)
    except Exception:
        return {"results": [], "mode": "text", "total": 0}

    results = []
    rank = 0
    for i, (doc, meta, dist) in enumerate(zip(r["documents"][0], r["metadatas"][0], r["distances"][0])):
        display = meta.get("display_text", doc) if meta else doc
        if not display or not _is_quality_chunk(display):
            continue
        score = max(0, 1 - dist)
        rank += 1
        results.append({
            "rank": rank,
            "text": _clean_transcript(display[:500]),
            "score": round(score, 4),
            "source_file": meta.get("source_file", ""),
            "source_type": meta.get("source_type", ""),
            "workspace_id": meta.get("workspace_id", ""),
            "document_id": meta.get("document_id", ""),
            "location": meta.get("location", ""),
            "page": meta.get("page", 0),
            "start_sec": meta.get("start_sec", 0),
            "end_sec": meta.get("end_sec", 0),
        })

    results = _dedup_results(results)
    results = _rerank_results(q, results)
    results = [r for r in results if r["score"] >= TEXT_SCORE_THRESHOLD]

    return {"results": results[:n], "mode": "text", "total": text_col.count()}


def _search_visual(q, n, where):
    global image_col
    if image_col is None:
        try:
            image_col = chroma_client.get_collection(IMAGE_COLLECTION)
        except Exception:
            return {"results": [], "mode": "visual", "total": 0}

    if image_col.count() == 0:
        return {"results": [], "mode": "visual", "total": 0}

    import torch
    from transformers import CLIPModel, CLIPProcessor

    if not hasattr(_search_visual, "_model"):
        device = "cuda" if torch.cuda.is_available() else "cpu"
        _search_visual._model = CLIPModel.from_pretrained(CLIP_MODEL).to(device)
        _search_visual._proc = CLIPProcessor.from_pretrained(CLIP_MODEL)
        _search_visual._device = device

    inputs = _search_visual._proc(text=[q], return_tensors="pt")
    input_ids = inputs["input_ids"].to(_search_visual._device)
    attention_mask = inputs["attention_mask"].to(_search_visual._device)
    with torch.no_grad():
        text_out = _search_visual._model.text_model(input_ids=input_ids, attention_mask=attention_mask)
        emb = _search_visual._model.text_projection(text_out.pooler_output)
        emb = emb / emb.norm(dim=-1, keepdim=True)

    # Fetch extra results for dedup headroom
    fetch_n = min(n * 3, image_col.count())
    kwargs = {
        "query_embeddings": [emb[0].cpu().tolist()],
        "n_results": fetch_n,
        "include": ["metadatas", "distances", "embeddings"],
    }
    if where:
        kwargs["where"] = where

    try:
        r = image_col.query(**kwargs)
    except Exception:
        return {"results": [], "mode": "visual", "total": 0}

    raw = []
    for i, (img_id, meta, dist, img_emb) in enumerate(zip(
        r["ids"][0], r["metadatas"][0], r["distances"][0], r["embeddings"][0]
    )):
        score = max(0, 1 - (dist ** 2 / 2))
        frame_url = _frame_path_to_url(meta.get("frame_path", ""))
        raw.append({
            "rank": i + 1,
            "image_id": img_id,
            "score": round(score, 4),
            "frame_url": frame_url,
            "source_file": meta.get("source_file", ""),
            "source_type": meta.get("source_type", ""),
            "workspace_id": meta.get("workspace_id", ""),
            "timestamp_sec": meta.get("timestamp_sec", 0),
            "page": meta.get("page", 0),
            "_emb": img_emb,
        })

    # Embedding-based dedup: if two images have cosine similarity > 0.95,
    # they're visually near-identical (templates, headers). Keep only the best.
    # Also track how many duplicates each accepted image suppressed —
    # if it suppressed 2+, it's a repeating template (headers, footers) and gets removed.
    results = []
    dup_counts = []  # parallel to results
    for candidate in raw:
        matched_idx = None
        c_emb = candidate["_emb"]
        for idx, accepted in enumerate(results):
            a_emb = accepted["_emb"]
            sim = sum(a * b for a, b in zip(c_emb, a_emb))
            if sim > 0.95:
                matched_idx = idx
                break
        if matched_idx is not None:
            dup_counts[matched_idx] += 1
        else:
            results.append(candidate)
            dup_counts.append(0)

    # Remove templates: images that had 2+ near-duplicates are repeating elements
    filtered = [r for r, dc in zip(results, dup_counts) if dc < 2]

    # If we filtered too aggressively and have nothing, fall back to non-templates
    if not filtered and results:
        filtered = [r for r, dc in zip(results, dup_counts) if dc < 5]

    results = filtered[:n]

    # Strip internal embedding data before returning
    for r in results:
        r.pop("_emb", None)

    return {"results": results, "mode": "visual", "total": image_col.count()}


def _frame_path_to_url(frame_path: str) -> str:
    """Convert absolute frame path to API URL."""
    if not frame_path:
        return ""
    # /data/cane/extracted/slug/images/frame_0001.jpg → slug/images/frame_0001.jpg
    extracted = str(EXTRACTED_DIR)
    if frame_path.startswith(extracted):
        relative = frame_path[len(extracted):].lstrip("/")
        return f"/api/images/{relative}"
    return ""


@app.get("/api/images/{file_path:path}")
def serve_image(
    file_path: str,
    token: str = Query(""),
    db: Session = Depends(get_db),
):
    """Serve extracted images (keyframes, PDF images) with token auth."""
    # Authenticate via query param token (img tags can't send headers)
    if not token:
        raise HTTPException(401, "Token required")
    from auth import decode_token
    payload = decode_token(token)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(401, "Invalid token")
    user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    if not user:
        raise HTTPException(401, "Unauthorized")

    # Sanitize: prevent path traversal
    from pathlib import Path
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


def _search_fusion(q, n, where):
    text_r = _search_text(q, n * 2, where)
    visual_r = _search_visual(q, n * 2, where)

    rrf_scores = {}
    rrf_data = {}
    k = 60

    for r in text_r.get("results", []):
        page = r.get("page", 0)
        start = r.get("start_sec", 0)
        key = f"{r['source_file']}|p{page}" if page else f"{r['source_file']}|t{int(start)}"
        rrf_scores[key] = rrf_scores.get(key, 0) + 1.0 / (k + r["rank"])
        if key not in rrf_data:
            rrf_data[key] = dict(r)

    for r in visual_r.get("results", []):
        page = r.get("page", 0)
        ts = r.get("timestamp_sec", 0)
        key = f"{r['source_file']}|p{page}" if page else f"{r['source_file']}|t{int(ts)}"
        rrf_scores[key] = rrf_scores.get(key, 0) + 1.0 / (k + r["rank"])
        if key not in rrf_data:
            rrf_data[key] = {
                "source_file": r.get("source_file", ""),
                "source_type": r.get("source_type", ""),
                "workspace_id": r.get("workspace_id", ""),
                "page": page,
                "location": f"p.{page}" if page else "",
                "start_sec": ts, "end_sec": ts,
                "timestamp_sec": ts,
                "score": r.get("score", 0),
                "frame_url": r.get("frame_url", ""),
                "text": f"[Visual match â€” p.{page}]" if page else f"[Visual match at {ts:.0f}s]",
            }

    ranked = sorted(rrf_scores.items(), key=lambda x: x[1], reverse=True)[:n * 2]
    results = []
    for i, (key, score) in enumerate(ranked):
        data = rrf_data.get(key, {})
        data["rank"] = i + 1
        data["score"] = round(score, 4)
        results.append(data)

    results = _dedup_results(results)
    results = _rerank_results(q, results)
    results = [r for r in results if r["score"] >= FUSION_SCORE_THRESHOLD]

    return {"results": results[:n], "mode": "fusion"}


# â”€â”€ Summarize (Ask mode) â”€â”€

# â”€â”€ LLM (Claude API) â”€â”€
from config import ANTHROPIC_API_KEY, CLAUDE_MODEL


def _call_claude(user_prompt: str, system: str = "") -> str:
    """Call Claude API for RAG summarization."""
    import urllib.request, json

    if not ANTHROPIC_API_KEY:
        return ""

    payload = {
        "model": CLAUDE_MODEL,
        "max_tokens": 1024,
        "temperature": 0.3,
        "system": system,
        "messages": [
            {"role": "user", "content": user_prompt}
        ],
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

    with urllib.request.urlopen(req, timeout=30) as resp:
        result = json.loads(resp.read())
        # Extract text from content blocks
        content = result.get("content", [])
        return "".join(
            block.get("text", "") for block in content if block.get("type") == "text"
        ).strip()



@app.get("/api/ask")
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

    # Plan limit check
    tenant = db.query(Tenant).filter(Tenant.id == user.tenant_id).first()
    limit_err = _check_search_limit(user.tenant_id, tenant.plan if tenant else "free", db)
    if limit_err:
        return JSONResponse({"error": limit_err}, status_code=403)

    if not ANTHROPIC_API_KEY:
        return {"status": "no_llm", "error": "Anthropic API key not configured. Set ANTHROPIC_API_KEY."}

    where = _build_tenant_where(user.tenant_id, workspace_id)

    # Separate buckets: visual-matched content gets priority placement
    visual_context = []  # High-relevance: CLIP-matched transcript text
    visual_sources = []
    text_context = []    # Standard: text-search results + supplementary
    text_sources = []
    seen_texts = set()

    def _add_to(bucket, src_bucket, text, source_label):
        text = _clean_transcript(text.strip())
        if not text or len(text) < 20:
            return
        sig = text[:100]
        if sig in seen_texts:
            return
        seen_texts.add(sig)
        bucket.append(text)
        src_bucket.append(source_label)

    # 1) Visual search FIRST — CLIP finds content text embeddings miss
    #    (e.g. phenol slides that Whisper mis-transcribed)
    visual_hits = []
    try:
        visual_results = _search_visual(q, 6, where)
        visual_hits = visual_results.get("results", [])
        print(f"  [Ask] Visual hits: {len(visual_hits)}")
        if visual_hits and text_col.count() > 0:
            # Group visual hits by source_file to do targeted fetches
            source_files = set()
            for vr in visual_hits:
                v_src = vr.get("source_file", "")
                if v_src:
                    source_files.add(v_src)

            # Fetch chunks only for matched source files (not ALL chunks)
            for src_file in source_files:
                src_where = {"$and": [{"tenant_id": user.tenant_id}, {"source_file": src_file}]}
                if workspace_id:
                    src_where = {"$and": [{"tenant_id": user.tenant_id}, {"workspace_id": workspace_id}, {"source_file": src_file}]}
                try:
                    src_chunks = text_col.get(where=src_where, include=["documents", "metadatas"])
                    src_docs = src_chunks.get("documents", [])
                    src_metas = src_chunks.get("metadatas", [])
                except Exception:
                    continue

                # Match visual hits for this source file
                for vr in visual_hits:
                    if vr.get("source_file", "") != src_file:
                        continue
                    ts = vr.get("timestamp_sec", 0)
                    v_page = vr.get("page", 0)

                    for doc, meta in zip(src_docs, src_metas):
                        if not meta:
                            continue
                        # For videos: match by timestamp window
                        s = float(meta.get("start_sec", 0) or 0)
                        e = float(meta.get("end_sec", 0) or 0)
                        if ts > 0 and s > 0 and s - 15 <= ts <= e + 15:
                            display = meta.get("display_text", doc) or doc
                            ocr_text = meta.get("ocr_slide_text", "")
                            if ocr_text:
                                display = f"[Slide text]: {ocr_text}\n\n[Spoken]: {display}"
                            _add_to(visual_context, visual_sources, display, src_file)
                            continue
                        # For PDFs: match by page
                        chunk_page = int(meta.get("page", 0) or 0)
                        if v_page > 0 and chunk_page == v_page:
                            display = meta.get("display_text", doc) or doc
                            _add_to(visual_context, visual_sources, display, src_file)
    except Exception as ex:
        print(f"  [Ask] Visual text lookup error: {ex}")
        import traceback; traceback.print_exc()

    # 2) Direct text search — ranked results
    text_results = _search_text(q, n, where)
    for r in text_results.get("results", []):
        text = r.get("text", "")
        src = r.get("source_file", "")
        page = r.get("page", 0)
        _add_to(text_context, text_sources, text, f"{src} p.{page}" if page else src)

    # 3) Small corpus fallback: if tenant has few chunks, include all for comprehensive answers
    try:
        get_kwargs = {"include": ["documents", "metadatas"]}
        if where:
            get_kwargs["where"] = where
        # Count only this tenant's chunks, not global
        tenant_chunks = text_col.get(**get_kwargs)
        tenant_doc_count = len(tenant_chunks.get("documents", []))
        print(f"  [Ask] Tenant chunk count={tenant_doc_count}")
        if 0 < tenant_doc_count <= 200:
            docs = tenant_chunks.get("documents", [])
            metas = tenant_chunks.get("metadatas", [])
            print(f"  [Ask] Small corpus: adding {len(docs)} chunks as supplementary")
            for doc, meta in zip(docs, metas):
                src = (meta or {}).get("source_file", "")
                display = (meta or {}).get("display_text", doc) or doc
                ocr_text = (meta or {}).get("ocr_slide_text", "")
                if ocr_text:
                    display = f"[Slide text]: {ocr_text}\n\n[Spoken]: {display}"
                _add_to(text_context, text_sources, display, src)
    except Exception as ex:
        print(f"  [Ask] Supplementary context error: {ex}")
        import traceback; traceback.print_exc()

    # Combine: visual-matched content FIRST (labeled), then text results
    context_parts = []
    sources = []
    if visual_context:
        context_parts.append("=== HIGHLY RELEVANT (matched by visual/slide analysis) ===\n\n" + "\n\n---\n\n".join(visual_context))
        sources.extend(visual_sources)
    if text_context:
        context_parts.append("=== ADDITIONAL DOCUMENT EXCERPTS ===\n\n" + "\n\n---\n\n".join(text_context))
        sources.extend(text_sources)

    # Deduplicate sources while preserving order
    seen_sources = set()
    unique_sources = []
    for s in sources:
        if s not in seen_sources:
            seen_sources.add(s)
            unique_sources.append(s)
    sources = unique_sources

    if not visual_context and not text_context:
        return {"status": "no_results", "error": "No text content to summarize."}

    # Debug: log what we're sending to Claude
    print(f"  [Ask] Sending {len(visual_context)} visual + {len(text_context)} text context parts to Claude")

    context = "\n\n\n".join(context_parts)

    # Load agent system prompt if workspace has one
    agent_prompt = ""
    if workspace_id:
        ws = db.query(Workspace).filter(
            Workspace.id == workspace_id,
            Workspace.tenant_id == user.tenant_id,
        ).first()
        if ws and ws.system_prompt:
            agent_prompt = ws.system_prompt

    from config import RAG_BASE_RULES
    base_rules = RAG_BASE_RULES

    if agent_prompt:
        system_prompt = agent_prompt + "\n\nAdditional retrieval rules:" + base_rules
    else:
        system_prompt = "You are a helpful assistant. Answer the question using ONLY the provided document excerpts." + base_rules

    user_prompt = f"Question: {q}\n\nDocument Excerpts:\n{context}\n\nProvide a clear answer based on the above."

    try:
        summary = _call_claude(user_prompt, system=system_prompt)

        # Also fetch relevant images to show alongside the answer
        # Reuse visual results from step 1 instead of calling CLIP again
        images = []
        seen_sources = {}  # best image per source file
        try:
            for vr in visual_hits:
                if vr.get("frame_url") and vr.get("score", 0) > 0.20:
                    src = vr.get("source_file", "")
                    page = vr.get("page", 0)
                    key = f"{src}:{page}" if page else f"{src}:{vr.get('timestamp_sec', 0)}"
                    # Keep highest-scoring image per source+page
                    if key not in seen_sources or vr["score"] > seen_sources[key]["score"]:
                        seen_sources[key] = {
                            "url": vr["frame_url"],
                            "source_file": src,
                            "timestamp_sec": vr.get("timestamp_sec", 0),
                            "page": page,
                            "score": vr.get("score", 0),
                        }

            # Template detection: if the same page number appears from 3+ different files,
            # it's likely a header/footer template — drop those images
            from collections import Counter
            page_file_count = Counter()
            for info in seen_sources.values():
                if info["page"] > 0:
                    page_file_count[info["page"]] += 1
            template_pages = {p for p, c in page_file_count.items() if c >= 3}

            filtered = {k: v for k, v in seen_sources.items()
                        if v["page"] not in template_pages}

            # Sort by score, cap at 4
            images = sorted(filtered.values(), key=lambda x: x["score"], reverse=True)[:4]
        except Exception:
            pass

        # Log as search
        log = SearchLog(
            tenant_id=user.tenant_id, user_id=user.id, query=q, mode="ask",
            workspace_id=workspace_id or None, result_count=len(visual_context) + len(text_context),
        )
        db.add(log)
        db.commit()

        return {
            "status": "ok",
            "summary": summary,
            "model": CLAUDE_MODEL,
            "sources": sources,
            "chunks_used": len(visual_context) + len(text_context),
            "images": images,
        }
    except Exception as e:
        return {"status": "error", "error": f"LLM call failed: {str(e)}"}



# ── Streaming Ask endpoint ──
from streaming import stream_claude, get_conversation_history, save_conversation_turn, _sse


@app.get("/api/ask/stream")
def ask_stream(
    q: str = Query(...),
    n: int = Query(5, ge=1, le=20),
    workspace_id: str = Query(""),
    session_id: str = Query(""),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """RAG: search + stream answer via SSE."""
    import json as _json

    q = sanitize_query(q)
    if not q:
        return JSONResponse({"status": "error", "error": "Query is required"})

    # Plan limit check
    tenant = db.query(Tenant).filter(Tenant.id == user.tenant_id).first()
    limit_err = _check_search_limit(user.tenant_id, tenant.plan if tenant else "free", db)
    if limit_err:
        return JSONResponse({"error": limit_err}, status_code=403)

    if not ANTHROPIC_API_KEY:
        return JSONResponse({"status": "no_llm", "error": "Anthropic API key not configured."})

    where = _build_tenant_where(user.tenant_id, workspace_id)

    # Build context (same logic as /api/ask)
    visual_context, visual_sources = [], []
    text_context, text_sources = [], []
    seen_texts = set()

    def _add(bucket, src_bucket, text, source_label):
        text = _clean_transcript(text.strip())
        if not text or len(text) < 20:
            return
        sig = text[:100]
        if sig in seen_texts:
            return
        seen_texts.add(sig)
        bucket.append(text)
        src_bucket.append(source_label)

    # 1) Visual search
    visual_hits = []
    try:
        visual_results = _search_visual(q, 6, where)
        visual_hits = visual_results.get("results", [])
        if visual_hits and text_col.count() > 0:
            source_files = {vr.get("source_file", "") for vr in visual_hits if vr.get("source_file")}
            for src_file in source_files:
                src_where_parts = [{"tenant_id": user.tenant_id}, {"source_file": src_file}]
                if workspace_id:
                    src_where_parts.append({"workspace_id": workspace_id})
                src_where = {"$and": src_where_parts}
                try:
                    src_chunks = text_col.get(where=src_where, include=["documents", "metadatas"])
                except Exception:
                    continue
                src_docs = src_chunks.get("documents", [])
                src_metas = src_chunks.get("metadatas", [])
                for vr in visual_hits:
                    if vr.get("source_file", "") != src_file:
                        continue
                    ts = vr.get("timestamp_sec", 0)
                    v_page = vr.get("page", 0)
                    for doc, meta in zip(src_docs, src_metas):
                        if not meta:
                            continue
                        s = float(meta.get("start_sec", 0) or 0)
                        e = float(meta.get("end_sec", 0) or 0)
                        if ts > 0 and s > 0 and s - 15 <= ts <= e + 15:
                            display = meta.get("display_text", doc) or doc
                            ocr_text = meta.get("ocr_slide_text", "")
                            if ocr_text:
                                display = f"[Slide text]: {ocr_text}\n\n[Spoken]: {display}"
                            _add(visual_context, visual_sources, display, src_file)
                            continue
                        chunk_page = int(meta.get("page", 0) or 0)
                        if v_page > 0 and chunk_page == v_page:
                            display = meta.get("display_text", doc) or doc
                            _add(visual_context, visual_sources, display, src_file)
    except Exception:
        pass

    # 2) Text search
    text_results = _search_text(q, n, where)
    for r in text_results.get("results", []):
        text = r.get("text", "")
        src = r.get("source_file", "")
        page = r.get("page", 0)
        _add(text_context, text_sources, text, f"{src} p.{page}" if page else src)

    # 3) Small corpus fallback
    try:
        get_kw = {"include": ["documents", "metadatas"]}
        if where:
            get_kw["where"] = where
        tenant_chunks = text_col.get(**get_kw)
        if 0 < len(tenant_chunks.get("documents", [])) <= 200:
            for doc, meta in zip(tenant_chunks["documents"], tenant_chunks["metadatas"]):
                src = (meta or {}).get("source_file", "")
                display = (meta or {}).get("display_text", doc) or doc
                ocr_text = (meta or {}).get("ocr_slide_text", "")
                if ocr_text:
                    display = f"[Slide text]: {ocr_text}\n\n[Spoken]: {display}"
                _add(text_context, text_sources, display, src)
    except Exception:
        pass

    # Assemble context
    context_parts = []
    sources = []
    if visual_context:
        context_parts.append("=== HIGHLY RELEVANT (matched by visual/slide analysis) ===\n\n" + "\n\n---\n\n".join(visual_context))
        sources.extend(visual_sources)
    if text_context:
        context_parts.append("=== ADDITIONAL DOCUMENT EXCERPTS ===\n\n" + "\n\n---\n\n".join(text_context))
        sources.extend(text_sources)

    sources = list(dict.fromkeys(sources))  # deduplicate preserving order

    if not visual_context and not text_context:
        return JSONResponse({"status": "no_results", "error": "No text content to summarize."})

    context = "\n\n\n".join(context_parts)

    # Load agent system prompt if workspace has one
    agent_prompt = ""
    if workspace_id:
        ws = db.query(Workspace).filter(
            Workspace.id == workspace_id,
            Workspace.tenant_id == user.tenant_id,
        ).first()
        if ws and ws.system_prompt:
            agent_prompt = ws.system_prompt

    from config import RAG_BASE_RULES
    base_rules = RAG_BASE_RULES

    if agent_prompt:
        system_prompt = agent_prompt + "\n\nAdditional retrieval rules:" + base_rules
    else:
        system_prompt = "You are a helpful assistant. Answer the question using ONLY the provided document excerpts." + base_rules

    # Build messages with conversation history
    messages = get_conversation_history(session_id)
    messages.append({
        "role": "user",
        "content": f"Question: {q}\n\nDocument Excerpts:\n{context}\n\nProvide a clear answer based on the above."
    })

    # Images — deduplicate by source+page, template detection, cap at 4
    _img_seen = {}
    for vr in visual_hits:
        if vr.get("frame_url") and vr.get("score", 0) > 0.20:
            src = vr.get("source_file", "")
            page = vr.get("page", 0)
            key = f"{src}:{page}" if page else f"{src}:{vr.get('timestamp_sec', 0)}"
            if key not in _img_seen or vr["score"] > _img_seen[key]["score"]:
                _img_seen[key] = {
                    "url": vr["frame_url"], "source_file": src,
                    "timestamp_sec": vr.get("timestamp_sec", 0),
                    "page": page, "score": vr.get("score", 0),
                }
    # Template detection: same page from 3+ files = boilerplate
    from collections import Counter
    _pg_count = Counter(v["page"] for v in _img_seen.values() if v["page"] > 0)
    _tpl_pages = {p for p, c in _pg_count.items() if c >= 3}
    _img_filtered = {k: v for k, v in _img_seen.items() if v["page"] not in _tpl_pages}
    images = sorted(_img_filtered.values(), key=lambda x: x["score"], reverse=True)[:4]

    def generate():
        # Send metadata first
        yield _sse({"type": "meta", "sources": sources, "images": images,
                     "chunks_used": len(visual_context) + len(text_context)})

        # Stream text
        full_text = []
        for chunk in stream_claude("", system=system_prompt, messages=messages):
            yield chunk
            if chunk.startswith("data: "):
                try:
                    d = _json.loads(chunk[6:].strip())
                    if d.get("type") == "text":
                        full_text.append(d["text"])
                except Exception:
                    pass

        # Save conversation history
        save_conversation_turn(session_id, q, "".join(full_text))

        yield _sse({"type": "done"})

    # Log
    log = SearchLog(
        tenant_id=user.tenant_id, user_id=user.id, query=q, mode="ask_stream",
        workspace_id=workspace_id or None, result_count=len(visual_context) + len(text_context),
    )
    db.add(log)
    db.commit()

    return StreamingResponse(generate(), media_type="text/event-stream")


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#  TEAM MANAGEMENT (owner only)
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

@app.get("/api/team")
def list_team(user: User = Depends(require_owner), db: Session = Depends(get_db)):
    """List all users in the tenant."""
    users = db.query(User).filter(User.tenant_id == user.tenant_id).all()
    return {
        "members": [
            {
                "id": u.id,
                "email": u.email,
                "name": u.name,
                "role": u.role,
                "is_active": u.is_active,
                "last_login": u.last_login.isoformat() if u.last_login else None,
                "created_at": u.created_at.isoformat(),
            }
            for u in users
        ]
    }


@app.post("/api/team/invite")
def invite_member(
    email: str = Form(...),
    name: str = Form(""),
    password: str = Form(...),
    role: str = Form("member"),
    user: User = Depends(require_owner),
    db: Session = Depends(get_db),
):
    """Invite a new team member (owner only)."""
    if role not in ("member", "owner"):
        raise HTTPException(400, "Role must be 'member' or 'owner'")

    email = sanitize_form_field(email).lower()
    name = sanitize_form_field(name)
    email_err = validate_email(email)
    if email_err:
        raise HTTPException(400, email_err)
    pwd_err = validate_password(password)
    if pwd_err:
        raise HTTPException(400, pwd_err)

    existing = db.query(User).filter(User.email == email).first()
    if existing:
        raise HTTPException(400, "Email already registered")

    new_user = User(
        tenant_id=user.tenant_id,
        email=email,
        password_hash=hash_password(password),
        name=name,
        role=role,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return {"id": new_user.id, "email": new_user.email, "role": new_user.role}


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#  STATS
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

@app.get("/api/stats")
def stats(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Dashboard stats for the current tenant."""
    doc_count = db.query(Document).filter(
        Document.tenant_id == user.tenant_id, Document.status == "ready"
    ).count()

    total_chunks = sum(
        d.chunk_count for d in db.query(Document).filter(
            Document.tenant_id == user.tenant_id, Document.status == "ready"
        ).all()
    )

    total_images = sum(
        d.image_count for d in db.query(Document).filter(
            Document.tenant_id == user.tenant_id, Document.status == "ready"
        ).all()
    )

    workspaces = db.query(Workspace).filter(Workspace.tenant_id == user.tenant_id).all()
    ws_stats = []
    for w in workspaces:
        ws_docs = db.query(Document).filter(
            Document.workspace_id == w.id, Document.status == "ready"
        ).count()
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




# ===============================================================
#  AGENT ENDPOINTS (beta)
# ===============================================================

@app.get("/api/agents/templates")
def get_agent_templates(user: User = Depends(get_current_user)):
    """List available pre-built agent templates."""
    return {"templates": list_templates()}


@app.get("/api/agents")
def list_agents(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all agent workspaces for the current tenant."""
    agents = db.query(Workspace).filter(
        Workspace.tenant_id == user.tenant_id,
        Workspace.agent_type.isnot(None),
    ).order_by(Workspace.created_at.desc()).all()

    result = []
    for a in agents:
        doc_count = db.query(Document).filter(Document.workspace_id == a.id).count()
        result.append({
            "id": a.id,
            "name": a.name,
            "agent_type": a.agent_type,
            "agent_icon": a.agent_icon or "",
            "agent_description": a.agent_description or "",
            "system_prompt": a.system_prompt or "",
            "show_on_homepage": getattr(a, "show_on_homepage", False) or False,
            "document_count": doc_count,
            "created_at": a.created_at.isoformat() if a.created_at else "",
        })

    return {"agents": result}


@app.post("/api/agents")
def create_agent(
    agent_type: str = Form("custom"),
    name: str = Form(""),
    description: str = Form(""),
    icon: str = Form(""),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new agent workspace from a template or custom."""
    # Plan limit check
    tenant = db.query(Tenant).filter(Tenant.id == user.tenant_id).first()
    limit_err = _check_agent_limit(user.tenant_id, tenant.plan if tenant else "free", db)
    if limit_err:
        return JSONResponse({"error": limit_err}, status_code=403)

    template = get_template(agent_type)
    if template:
        name = name or template["name"]
        icon = icon or template.get("icon", "")
        description = description or template.get("description", "")
        system_prompt = template.get("system_prompt", "")
    else:
        agent_type = "custom"
        icon = icon or "CA"
        system_prompt = ""

    if not name:
        return JSONResponse({"error": "Agent name is required"}, status_code=400)

    workspace = Workspace(
        tenant_id=user.tenant_id,
        name=name,
        description=description,
        agent_type=agent_type,
        agent_icon=icon,
        agent_description=description,
        system_prompt=system_prompt,
        show_on_homepage=False,
        is_default=False,
    )
    db.add(workspace)
    db.commit()
    db.refresh(workspace)

    return {
        "id": workspace.id,
        "name": workspace.name,
        "agent_type": workspace.agent_type,
        "agent_icon": workspace.agent_icon or "",
        "agent_description": workspace.agent_description or "",
        "system_prompt": workspace.system_prompt or "",
        "show_on_homepage": getattr(workspace, "show_on_homepage", False) or False,
    }


@app.get("/api/agents/{agent_id}")
def get_agent(
    agent_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get a single agent's details."""
    ws = db.query(Workspace).filter(
        Workspace.id == agent_id,
        Workspace.tenant_id == user.tenant_id,
        Workspace.agent_type.isnot(None),
    ).first()

    if not ws:
        return JSONResponse({"error": "Agent not found"}, status_code=404)

    doc_count = db.query(Document).filter(Document.workspace_id == ws.id).count()

    return {
        "id": ws.id,
        "name": ws.name,
        "agent_type": ws.agent_type,
        "agent_icon": ws.agent_icon or "",
        "agent_description": ws.agent_description or "",
        "system_prompt": ws.system_prompt or "",
        "show_on_homepage": getattr(ws, "show_on_homepage", False) or False,
        "document_count": doc_count,
        "created_at": ws.created_at.isoformat() if ws.created_at else "",
    }


@app.put("/api/agents/{agent_id}")
def update_agent(
    agent_id: str,
    name: str = Form(None),
    system_prompt: str = Form(None),
    agent_description: str = Form(None),
    agent_icon: str = Form(None),
    show_on_homepage: str = Form(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update agent settings."""
    ws = db.query(Workspace).filter(
        Workspace.id == agent_id,
        Workspace.tenant_id == user.tenant_id,
        Workspace.agent_type.isnot(None),
    ).first()

    if not ws:
        return JSONResponse({"error": "Agent not found"}, status_code=404)

    if name is not None:
        ws.name = sanitize_form_field(name)
    if system_prompt is not None:
        ws.system_prompt = system_prompt
    if agent_description is not None:
        ws.agent_description = sanitize_form_field(agent_description)
    if agent_icon is not None:
        ws.agent_icon = agent_icon
    if show_on_homepage is not None:
        ws.show_on_homepage = show_on_homepage.lower() in ("true", "1", "yes")

    db.commit()
    db.refresh(ws)

    return {
        "id": ws.id,
        "name": ws.name,
        "agent_type": ws.agent_type,
        "agent_icon": ws.agent_icon or "",
        "agent_description": ws.agent_description or "",
        "system_prompt": ws.system_prompt or "",
        "show_on_homepage": getattr(ws, "show_on_homepage", False) or False,
    }


@app.delete("/api/agents/{agent_id}")
def delete_agent(
    agent_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete an agent, its documents, and vector store chunks."""
    ws = db.query(Workspace).filter(
        Workspace.id == agent_id,
        Workspace.tenant_id == user.tenant_id,
        Workspace.agent_type.isnot(None),
    ).first()

    if not ws:
        return JSONResponse({"error": "Agent not found"}, status_code=404)

    # Delete documents from DB
    docs = db.query(Document).filter(Document.workspace_id == agent_id).all()
    for doc in docs:
        # Remove chunks from ChromaDB
        try:
            text_col.delete(where={"document_id": doc.id})
        except Exception:
            pass
        try:
            if image_col:
                image_col.delete(where={"document_id": doc.id})
        except Exception:
            pass
        db.delete(doc)

    db.delete(ws)
    db.commit()
    return {"status": "deleted"}


@app.post("/api/agents/{agent_id}/generate-prompt")
def generate_agent_prompt(
    agent_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Auto-generate a system prompt from the agent's documents (beta)."""
    ws = db.query(Workspace).filter(
        Workspace.id == agent_id,
        Workspace.tenant_id == user.tenant_id,
        Workspace.agent_type.isnot(None),
    ).first()

    if not ws:
        return JSONResponse({"error": "Agent not found"}, status_code=404)

    try:
        where = {"$and": [{"tenant_id": user.tenant_id}, {"workspace_id": agent_id}]}
        chunks = text_col.get(where=where, include=["documents", "metadatas"])
        docs = chunks.get("documents", [])
        metas = chunks.get("metadatas", [])
    except Exception:
        docs, metas = [], []

    if not docs:
        return JSONResponse(
            {"error": "Upload documents to this agent first, then generate a prompt."},
            status_code=400,
        )

    file_previews = {}
    for doc, meta in zip(docs, metas):
        src = (meta or {}).get("source_file", "unknown")
        if src not in file_previews:
            display = (meta or {}).get("display_text", doc) or doc
            file_previews[src] = {"filename": src, "preview": display[:2000]}

    prompt = auto_generate_prompt(list(file_previews.values()))

    if not prompt:
        return JSONResponse(
            {"error": "Failed to generate prompt. Try again or write one manually."},
            status_code=500,
        )

    ws.system_prompt = prompt
    db.commit()

    return {
        "system_prompt": prompt,
        "documents_analyzed": len(file_previews),
    }

# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#  ADMIN ENDPOINTS (your consulting dashboard)
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

@app.get("/api/admin/tenants")
def admin_list_tenants(user: User = Depends(require_admin), db: Session = Depends(get_db)):
    """List all tenants with usage stats."""
    tenants = db.query(Tenant).filter(Tenant.plan != "admin").all()
    result = []
    for t in tenants:
        doc_count = db.query(Document).filter(Document.tenant_id == t.id, Document.status == "ready").count()
        user_count = db.query(User).filter(User.tenant_id == t.id).count()
        search_count = db.query(SearchLog).filter(SearchLog.tenant_id == t.id).count()

        result.append({
            "id": t.id,
            "name": t.name,
            "slug": t.slug,
            "is_active": t.is_active,
            "created_at": t.created_at.isoformat(),
            "users": user_count,
            "documents": doc_count,
            "searches": search_count,
        })
    return {"tenants": result}


@app.get("/api/admin/tenants/{tenant_id}")
def admin_tenant_detail(
    tenant_id: str,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Deep dive on a single tenant â€” your consulting prep tool."""
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(404, "Tenant not found")

    documents = db.query(Document).filter(Document.tenant_id == tenant_id).all()
    users = db.query(User).filter(User.tenant_id == tenant_id).all()
    searches = db.query(SearchLog).filter(
        SearchLog.tenant_id == tenant_id
    ).order_by(SearchLog.created_at.desc()).limit(100).all()

    # Zero-result queries â€” goldmine
    zero_results = [s for s in searches if s.result_count == 0]

    # Most common queries
    from collections import Counter
    query_counts = Counter(s.query.lower().strip() for s in searches)
    top_queries = query_counts.most_common(20)

    return {
        "tenant": {"id": tenant.id, "name": tenant.name, "slug": tenant.slug, "created_at": tenant.created_at.isoformat()},
        "users": [{"id": u.id, "email": u.email, "name": u.name, "role": u.role, "last_login": u.last_login.isoformat() if u.last_login else None} for u in users],
        "documents": [{"filename": d.filename, "status": d.status, "chunks": d.chunk_count, "created_at": d.created_at.isoformat()} for d in documents],
        "search_volume": len(searches),
        "zero_result_queries": [{"query": s.query, "time": s.created_at.isoformat()} for s in zero_results],
        "top_queries": [{"query": q, "count": c} for q, c in top_queries],
        "recent_searches": [{"query": s.query, "mode": s.mode, "results": s.result_count, "time": s.created_at.isoformat()} for s in searches[:20]],
    }


@app.post("/api/admin/tenants")
def admin_create_tenant(
    name: str = Form(...),
    slug: str = Form(...),
    owner_email: str = Form(...),
    owner_password: str = Form(...),
    owner_name: str = Form(""),
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Onboard a new SMB client."""
    # Sanitize and validate all inputs
    name = sanitize_form_field(name)
    slug = sanitize_form_field(slug).lower()
    owner_email = sanitize_form_field(owner_email).lower()
    owner_name = sanitize_form_field(owner_name)

    email_err = validate_email(owner_email)
    if email_err:
        raise HTTPException(400, email_err)
    pwd_err = validate_password(owner_password)
    if pwd_err:
        raise HTTPException(400, pwd_err)
    if not name:
        raise HTTPException(400, "Company name is required")
    if not slug:
        raise HTTPException(400, "Slug is required")

    existing = db.query(Tenant).filter(Tenant.slug == slug).first()
    if existing:
        raise HTTPException(400, f"Tenant slug '{slug}' already exists")

    existing_user = db.query(User).filter(User.email == owner_email).first()
    if existing_user:
        raise HTTPException(400, f"Email '{owner_email}' already registered")

    tenant = Tenant(name=name, slug=slug)
    db.add(tenant)
    db.flush()

    # Default workspace
    ws = Workspace(tenant_id=tenant.id, name=f"{name} Docs", description=f"Default workspace for {name}", is_default=True)
    db.add(ws)

    # Owner account
    owner = User(
        tenant_id=tenant.id, email=owner_email,
        password_hash=hash_password(owner_password),
        name=owner_name, role="owner",
    )
    db.add(owner)
    db.commit()

    return {"tenant_id": tenant.id, "owner_id": owner.id, "workspace_id": ws.id}


@app.put("/api/admin/tenants/{tenant_id}")
def admin_update_tenant(
    tenant_id: str,
    name: str = Form(...),
    slug: str = Form(""),
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Rename a tenant (admin only)."""
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(404, "Tenant not found")
    tenant.name = name
    if slug:
        tenant.slug = slug
    db.commit()
    return {"id": tenant.id, "name": tenant.name, "slug": tenant.slug}


@app.delete("/api/admin/tenants/{tenant_id}")
def admin_delete_tenant(
    tenant_id: str,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Delete a tenant and all associated data (admin only)."""
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(404, "Tenant not found")

    # Delete in order: search logs, documents, workspaces, users, tenant
    db.query(SearchLog).filter(SearchLog.tenant_id == tenant_id).delete()
    db.query(Document).filter(Document.tenant_id == tenant_id).delete()
    db.query(Workspace).filter(Workspace.tenant_id == tenant_id).delete()
    db.query(User).filter(User.tenant_id == tenant_id).delete()
    db.delete(tenant)
    db.commit()

    return {"status": "deleted", "name": tenant.name}


@app.put("/api/admin/tenants/{tenant_id}/users/{user_id}")
def admin_update_user(
    tenant_id: str,
    user_id: str,
    email: str = Form(...),
    name: str = Form(""),
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Edit a user's email or name (admin only)."""
    target = db.query(User).filter(User.id == user_id, User.tenant_id == tenant_id).first()
    if not target:
        raise HTTPException(404, "User not found")

    # Check for duplicate email
    if email != target.email:
        existing = db.query(User).filter(User.email == email).first()
        if existing:
            raise HTTPException(400, f"Email '{email}' is already in use")

    target.email = email
    target.name = name
    db.commit()

    return {"id": target.id, "email": target.email, "name": target.name}


@app.delete("/api/admin/tenants/{tenant_id}/users/{user_id}")
def admin_delete_user(
    tenant_id: str,
    user_id: str,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Delete a user (admin only). Cannot delete owners."""
    target = db.query(User).filter(User.id == user_id, User.tenant_id == tenant_id).first()
    if not target:
        raise HTTPException(404, "User not found")
    if target.role == "owner":
        raise HTTPException(400, "Cannot delete the tenant owner")

    db.delete(target)
    db.commit()

    return {"status": "deleted", "email": target.email}




@app.post("/api/auth/password")
def change_password(
    current_password: str = Form(...),
    new_password: str = Form(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Change the current user's password."""
    if not verify_password(current_password, user.password_hash):
        raise HTTPException(400, "Current password is incorrect")
    pwd_err = validate_password(new_password)
    if pwd_err:
        raise HTTPException(400, pwd_err)
    user.password_hash = hash_password(new_password)
    db.commit()
    return {"status": "ok", "message": "Password updated"}

# ── Health check ──────────────────────────────────────────
@app.get("/api/health")
def health_check():
    return {"status": "ok", "service": "cane"}


# ══════════════════════════════════════════
#  API Key Management (web-authenticated)
# ══════════════════════════════════════════
from auth import generate_api_key, hash_api_key, get_api_key_auth
from db_models import ApiKey


@app.get("/api/api-keys")
def list_api_keys(user: User = Depends(require_owner), db: Session = Depends(get_db)):
    """List all API keys for the tenant."""
    keys = db.query(ApiKey).filter(
        ApiKey.tenant_id == user.tenant_id
    ).order_by(ApiKey.created_at.desc()).all()

    return {
        "keys": [
            {
                "id": k.id,
                "name": k.name,
                "key_prefix": k.key_prefix,
                "workspace_id": k.workspace_id,
                "is_active": k.is_active,
                "rate_limit": k.rate_limit,
                "requests_today": k.requests_today,
                "last_used_at": k.last_used_at.isoformat() if k.last_used_at else None,
                "created_at": k.created_at.isoformat() if k.created_at else None,
            }
            for k in keys
        ]
    }


@app.post("/api/api-keys")
async def create_api_key_endpoint(
    request: Request,
    user: User = Depends(require_owner),
    db: Session = Depends(get_db),
):
    """Generate a new API key. Returns the full key ONCE — it cannot be retrieved again."""
    # Plan check — free users cannot create API keys
    tenant = db.query(Tenant).filter(Tenant.id == user.tenant_id).first()
    if tenant and tenant.plan == "free":
        raise HTTPException(403, "API access requires a Pro plan. Upgrade to generate API keys.")

    try:
        body = await request.json()
    except Exception:
        body = {}

    name = body.get("name", "API Key")
    workspace_id = body.get("workspace_id", None)

    raw_key = generate_api_key()
    key_prefix = raw_key[:12]
    key_hashed = hash_api_key(raw_key)

    api_key = ApiKey(
        tenant_id=user.tenant_id,
        name=name,
        key_hash=key_hashed,
        key_prefix=key_prefix,
        workspace_id=workspace_id if workspace_id else None,
        rate_limit=1000,
    )
    db.add(api_key)
    db.commit()
    db.refresh(api_key)

    return {
        "id": api_key.id,
        "name": api_key.name,
        "key": raw_key,  # Only time the full key is returned
        "key_prefix": key_prefix,
        "workspace_id": api_key.workspace_id,
        "rate_limit": api_key.rate_limit,
        "created_at": api_key.created_at.isoformat() if api_key.created_at else None,
    }


@app.delete("/api/api-keys/{key_id}")
def revoke_api_key(
    key_id: str,
    user: User = Depends(require_owner),
    db: Session = Depends(get_db),
):
    """Revoke an API key."""
    api_key = db.query(ApiKey).filter(
        ApiKey.id == key_id,
        ApiKey.tenant_id == user.tenant_id,
    ).first()
    if not api_key:
        raise HTTPException(404, "API key not found")
    db.delete(api_key)
    db.commit()
    return {"status": "deleted"}


# ══════════════════════════════════════════
#  Public API v1 (API-key authenticated)
# ══════════════════════════════════════════

@app.post("/v1/ask")
async def v1_ask(
    request: Request,
    api_key: ApiKey = Depends(get_api_key_auth),
    db: Session = Depends(get_db),
):
    """
    Public API: Ask a question against your documents.

    Request body (JSON):
        query: str (required) — the question
        workspace_id: str (optional) — scope to a workspace/agent
        max_chunks: int (optional, default 5) — number of chunks to retrieve

    Response:
        answer: str — AI-generated answer
        sources: list[str] — source document names
        chunks_used: int — number of chunks used
        model: str — Claude model used
    """
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

    where = _build_tenant_where(api_key.tenant_id, workspace_id)

    # Gather context (text search)
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
            dists = r.get("distances", [[]])[0]

            for txt, meta, dist in zip(docs, metas, dists):
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
        return {
            "answer": "No relevant documents found for your query.",
            "sources": [],
            "chunks_used": 0,
            "model": CLAUDE_MODEL,
        }

    # Build prompt
    agent_prompt = ""
    if workspace_id:
        ws = db.query(Workspace).filter(Workspace.id == workspace_id).first()
        if ws and ws.system_prompt:
            agent_prompt = ws.system_prompt

    from config import RAG_BASE_RULES
    base_rules = RAG_BASE_RULES
    rules = f"{agent_prompt}\n\nAdditional retrieval rules: {base_rules}" if agent_prompt else base_rules

    numbered = "\n\n".join(f"[{i+1}] {c}" for i, c in enumerate(context_chunks))
    user_msg = f"DOCUMENT EXCERPTS:\n{numbered}\n\nQUESTION: {query}"

    # Call Claude
    import json, urllib.request
    payload = {
        "model": CLAUDE_MODEL,
        "max_tokens": 1024,
        "system": rules,
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
        answer = result.get("content", [{}])[0].get("text", "").strip()
    except Exception as e:
        raise HTTPException(502, f"AI service error: {str(e)}")

    # Log
    log = SearchLog(
        tenant_id=api_key.tenant_id, user_id=None, query=query, mode="api_ask",
        workspace_id=workspace_id or None, result_count=len(context_chunks),
    )
    db.add(log)
    db.commit()

    return {
        "answer": answer,
        "sources": sources,
        "chunks_used": len(context_chunks),
        "model": CLAUDE_MODEL,
    }


@app.post("/v1/search")
async def v1_search(
    request: Request,
    api_key: ApiKey = Depends(get_api_key_auth),
    db: Session = Depends(get_db),
):
    """
    Public API: Search documents and return raw chunks.

    Request body (JSON):
        query: str (required) — search query
        workspace_id: str (optional) — scope to a workspace/agent
        max_results: int (optional, default 10) — number of results

    Response:
        results: list of {text, source_file, score, metadata}
        query: str
        total: int
    """
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
    where = _build_tenant_where(api_key.tenant_id, workspace_id)

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
                    "text": txt.strip(),
                    "source_file": meta.get("source_file", ""),
                    "score": score,
                    "metadata": {
                        "page": meta.get("page", 0),
                        "chunk_index": meta.get("chunk_index", 0),
                        "workspace_id": meta.get("workspace_id", ""),
                    },
                })
                if len(results) >= max_results:
                    break
        except Exception:
            pass

    # Log
    log = SearchLog(
        tenant_id=api_key.tenant_id, user_id=None, query=query, mode="api_search",
        workspace_id=workspace_id or None, result_count=len(results),
    )
    db.add(log)
    db.commit()

    return {
        "results": results,
        "query": query,
        "total": len(results),
    }


@app.get("/v1/health")
def v1_health():
    """Public API health check — no auth required."""
    return {"status": "ok", "service": "cane", "api_version": "v1"}


# ── Serve React SPA ──────────────────────────────────────
from fastapi.staticfiles import StaticFiles
import pathlib

_static = pathlib.Path(__file__).parent / "static"
if _static.is_dir():
    app.mount("/assets", StaticFiles(directory=str(_static / "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        file = _static / full_path
        if file.is_file():
            return FileResponse(str(file))
        return FileResponse(str(_static / "index.html"))