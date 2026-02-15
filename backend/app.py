"""
app.py — Cane API Server.

Multi-tenant document search API with auth.
Frontend is a separate React app.

Usage:
    python app.py
    → API at http://localhost:8000
    → Frontend at http://localhost:5173 (Vite dev server)
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

from fastapi import FastAPI, Query, UploadFile, File, Form, HTTPException, Depends, Request
from fastapi.responses import FileResponse, JSONResponse
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
from security import (
    login_limiter, validate_password, validate_file_content,
    sanitize_query, sanitize_form_field, validate_email,
    SecurityHeadersMiddleware, RequestIDMiddleware,
    MAX_FILE_SIZE,
)

# ── Boot ──
ensure_dirs()
init_db()

# Auto-seed admin on first deploy
from auto_seed import auto_seed
auto_seed()

print(f"""
{'='*60}
  Cane — Document Intelligence API
{'='*60}
  BASE:      {BASE_DIR}
  DB:        {DB_PATH}
  EXTRACTED: {EXTRACTED_DIR}
""")

chroma_client = chromadb.PersistentClient(path=DB_PATH)
ef = embedding_functions.SentenceTransformerEmbeddingFunction(model_name=TEXT_EMBED_MODEL)
text_col = chroma_client.get_or_create_collection(TEXT_COLLECTION, embedding_function=ef)

try:
    image_col = chroma_client.get_collection(IMAGE_COLLECTION)
except Exception:
    image_col = None

print(f"  Chunks: {text_col.count()}")
print(f"  Images: {image_col.count() if image_col else 0}")
print(f"\n  → http://localhost:8000\n{'='*60}\n")

# ── App ──
app = FastAPI(title="Cane", version="1.0.0", docs_url=None if IS_PRODUCTION else "/docs")
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RequestIDMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Score thresholds ──
TEXT_SCORE_THRESHOLD = 0.70
FUSION_SCORE_THRESHOLD = 0.30

# ── Quality filter ──
import re as _re
from chunk_quality import is_quality_chunk as _is_quality_chunk


# ═══════════════════════════════════════════════════════════
#  AUTH ENDPOINTS
# ═══════════════════════════════════════════════════════════

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
        },
        "workspaces": [
            {"id": w.id, "name": w.name, "is_default": w.is_default}
            for w in workspaces
        ],
    }


# ═══════════════════════════════════════════════════════════
#  WORKSPACE ENDPOINTS
# ═══════════════════════════════════════════════════════════

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


# ═══════════════════════════════════════════════════════════
#  DOCUMENT ENDPOINTS
# ═══════════════════════════════════════════════════════════

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


@app.post("/api/documents/upload")
async def upload_and_ingest(
    file: UploadFile = File(...),
    workspace_id: str = Form(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Upload a file, ingest it, and index chunks scoped to the tenant."""
    # Validate workspace belongs to tenant
    ws = db.query(Workspace).filter(
        Workspace.id == workspace_id,
        Workspace.tenant_id == user.tenant_id,
    ).first()
    if not ws:
        raise HTTPException(400, "Invalid workspace")

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

    # Sanitize filename — strip path components, limit length
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

    # Run extraction + indexing
    try:
        from ingestor import Ingestor
        ing = Ingestor()

        tenant = db.query(Tenant).filter(Tenant.id == user.tenant_id).first()

        result = ing.ingest(
            filepath=str(dest),
            tenant_id=user.tenant_id,
            workspace_id=workspace_id,
            document_id=doc.id,
            company_name=tenant.name if tenant else "",
            workspace_name=ws.name,
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

        return {
            "document_id": doc.id,
            "status": doc.status,
            "filename": doc.filename,
            "chunks": doc.chunk_count,
            "images": doc.image_count,
            "error": doc.error_message,
        }

    except Exception as e:
        doc.status = "error"
        doc.error_message = str(e)
        db.commit()
        raise HTTPException(500, f"Ingestion failed: {str(e)}")


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

    return {"status": "deleted", "filename": doc.filename}


# ═══════════════════════════════════════════════════════════
#  SEARCH ENDPOINTS
# ═══════════════════════════════════════════════════════════

# ── Cross-Encoder (lazy-loaded) ──
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


# ── Transcript cleanup ──
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
        # If where filter fails (empty collection for tenant), return empty
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

    inputs = _search_visual._proc(text=[q], return_tensors="pt").to(_search_visual._device)
    with torch.no_grad():
        emb = _search_visual._model.get_text_features(**inputs)
        emb = emb / emb.norm(dim=-1, keepdim=True)

    kwargs = {
        "query_embeddings": [emb[0].cpu().tolist()],
        "n_results": min(n, image_col.count()),
        "include": ["metadatas", "distances"],
    }
    if where:
        kwargs["where"] = where

    try:
        r = image_col.query(**kwargs)
    except Exception:
        return {"results": [], "mode": "visual", "total": 0}

    results = []
    for i, (img_id, meta, dist) in enumerate(zip(r["ids"][0], r["metadatas"][0], r["distances"][0])):
        score = max(0, 1 - (dist ** 2 / 2))
        frame_url = _frame_path_to_url(meta.get("frame_path", ""))
        results.append({
            "rank": i + 1,
            "image_id": img_id,
            "score": round(score, 4),
            "frame_url": frame_url,
            "source_file": meta.get("source_file", ""),
            "source_type": meta.get("source_type", ""),
            "workspace_id": meta.get("workspace_id", ""),
            "timestamp_sec": meta.get("timestamp_sec", 0),
            "page": meta.get("page", 0),
        })

    return {"results": results, "mode": "visual", "total": image_col.count()}


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
                "start_sec": 0, "end_sec": 0,
                "score": r.get("score", 0),
                "text": f"[Visual match — p.{page}]" if page else f"[Visual match at {ts:.0f}s]",
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


# ── Summarize (Ask mode) ──

# ── LLM (Claude API) ──
from config import ANTHROPIC_API_KEY, CLAUDE_MODEL


def _call_claude(user_prompt: str, system: str = "") -> str:
    """Call Claude API for RAG summarization."""
    import urllib.request, json

    if not ANTHROPIC_API_KEY:
        return ""

    payload = {
        "model": CLAUDE_MODEL,
        "max_tokens": 1024,
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

    if not ANTHROPIC_API_KEY:
        return {"status": "no_llm", "error": "Anthropic API key not configured. Set ANTHROPIC_API_KEY."}

    where = _build_tenant_where(user.tenant_id, workspace_id)
    search_results = _search_fusion(q, n, where)
    results = search_results.get("results", [])

    if not results:
        return {"status": "no_results", "error": "No results found for this query."}

    context_parts, sources = [], []
    for r in results[:n]:
        text = r.get("text", "").strip()
        if not text or text.startswith("[Visual match"):
            continue
        text = _clean_transcript(text)
        src = r.get("source_file", "")
        page = r.get("page", 0)
        source_label = f"{src} p.{page}" if page else src
        context_parts.append(text)
        sources.append(source_label)

    if not context_parts:
        return {"status": "no_results", "error": "No text content to summarize."}

    context = "\n\n---\n\n".join(context_parts)

    system_prompt = """You are a helpful assistant. Answer the question using ONLY the provided document excerpts.
Rules:
- Answer strictly based on the provided content.
- Give a clear, concise explanation.
- If the excerpts don't contain enough info, say what you can and note the gap."""

    user_prompt = f"Question: {q}\n\nDocument Excerpts:\n{context}\n\nProvide a clear answer based on the above."

    try:
        summary = _call_claude(user_prompt, system=system_prompt)

        # Log as search
        log = SearchLog(
            tenant_id=user.tenant_id, user_id=user.id, query=q, mode="ask",
            workspace_id=workspace_id or None, result_count=len(context_parts),
        )
        db.add(log)
        db.commit()

        return {
            "status": "ok",
            "summary": summary,
            "model": CLAUDE_MODEL,
            "sources": sources,
            "chunks_used": len(context_parts),
        }
    except Exception as e:
        return {"status": "error", "error": f"LLM call failed: {str(e)}"}


# ═══════════════════════════════════════════════════════════
#  TEAM MANAGEMENT (owner only)
# ═══════════════════════════════════════════════════════════

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


# ═══════════════════════════════════════════════════════════
#  STATS
# ═══════════════════════════════════════════════════════════

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


# ═══════════════════════════════════════════════════════════
#  ADMIN ENDPOINTS (your consulting dashboard)
# ═══════════════════════════════════════════════════════════

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
    """Deep dive on a single tenant — your consulting prep tool."""
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(404, "Tenant not found")

    documents = db.query(Document).filter(Document.tenant_id == tenant_id).all()
    users = db.query(User).filter(User.tenant_id == tenant_id).all()
    searches = db.query(SearchLog).filter(
        SearchLog.tenant_id == tenant_id
    ).order_by(SearchLog.created_at.desc()).limit(100).all()

    # Zero-result queries — goldmine
    zero_results = [s for s in searches if s.result_count == 0]

    # Most common queries
    from collections import Counter
    query_counts = Counter(s.query.lower().strip() for s in searches)
    top_queries = query_counts.most_common(20)

    return {
        "tenant": {"id": tenant.id, "name": tenant.name, "slug": tenant.slug, "created_at": tenant.created_at.isoformat()},
        "users": [{"email": u.email, "name": u.name, "role": u.role, "last_login": u.last_login.isoformat() if u.last_login else None} for u in users],
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
    ws = Workspace(tenant_id=tenant.id, name="General", description="Default workspace", is_default=True)
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


# ═══════════════════════════════════════════════════════════
#  FILE SERVING
# ═══════════════════════════════════════════════════════════

def _frame_path_to_url(fp: str) -> str:
    if not fp:
        return ""
    fp = fp.replace("\\", "/")
    if "extracted/" in fp:
        return "/files/" + fp[fp.index("extracted/"):]
    return ""


@app.get("/files/extracted/{path:path}")
def serve_extracted(path: str, user: User = Depends(get_current_user)):
    """Serve extracted files (frames, images). Auth-gated."""
    fp = EXTRACTED_DIR / path
    if fp.exists():
        return FileResponse(fp)
    raise HTTPException(404)


# ═══════════════════════════════════════════════════════════
#  HEALTH
# ═══════════════════════════════════════════════════════════

@app.get("/api/health")
def health():
    return {"status": "ok", "service": "cane"}


# ═══════════════════════════════════════════════════════════
#  STATIC FRONTEND (production only)
# ═══════════════════════════════════════════════════════════

from config import STATIC_DIR

if STATIC_DIR.exists() and (STATIC_DIR / "index.html").exists():
    from fastapi.staticfiles import StaticFiles

    # Serve static assets (JS, CSS, images)
    if (STATIC_DIR / "assets").exists():
        app.mount("/assets", StaticFiles(directory=str(STATIC_DIR / "assets")), name="assets")

    # Catch-all: serve index.html for any non-API route (SPA routing)
    @app.get("/{path:path}")
    def serve_frontend(path: str):
        # Don't serve frontend for API or file routes
        if path.startswith("api/") or path.startswith("files/"):
            raise HTTPException(404)
        # Try to serve the exact file first (favicon.ico, etc.)
        file_path = STATIC_DIR / path
        if path and file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        # Otherwise serve index.html (React handles routing)
        return FileResponse(STATIC_DIR / "index.html")

    print(f"  [Static] Serving frontend from {STATIC_DIR}")
else:
    print(f"  [Static] No frontend build found at {STATIC_DIR}")
    print(f"           Run 'npm run build' in frontend/ to create it")


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)
