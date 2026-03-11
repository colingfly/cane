"""
app.py — Cane API Server.

Multi-tenant document search API with auth.
All route logic lives in routes/. Shared services live in services/.

Usage:
    python app.py
    → API at http://localhost:8000
    → Frontend at http://localhost:5173 (Vite dev server)
"""
import sys
import os
import pathlib
from pathlib import Path

# Ensure backend dir is on the path
_root = str(Path(__file__).resolve().parent)
if _root not in sys.path:
    sys.path.insert(0, _root)

from config import BASE_DIR, DB_PATH, EXTRACTED_DIR, IS_PRODUCTION, ensure_dirs
from database import init_db

# ── Boot sequence ──
ensure_dirs()
init_db()

# Run migrations
import migrations
try:
    migrations.run_all()
except Exception as e:
    print(f"  [DB] Migrations skipped: {e}")

# Auto-seed admin on first deploy
from auto_seed import auto_seed
auto_seed()

# Seed agent packs into marketplace
try:
    from database import SessionLocal
    from db_models import User as _User
    _db = SessionLocal()
    _admin = _db.query(_User).filter(_User.role == "admin").first()
    if _admin:
        from pack_seeder import seed_packs
        seed_packs(_db, _admin.tenant_id, _admin.id)
    _db.close()
except Exception as e:
    print(f"  [Packs] Seed skipped: {e}")

print(f"""
{'='*60}
  Cane — Document Intelligence API
{'='*60}
  BASE:      {BASE_DIR}
  DB:        {DB_PATH}
  EXTRACTED: {EXTRACTED_DIR}
  [Email] GMAIL_CLIENT_ID={'SET' if os.getenv('GMAIL_CLIENT_ID') else 'MISSING'}
  [Email] GMAIL_CLIENT_SECRET={'SET' if os.getenv('GMAIL_CLIENT_SECRET') else 'MISSING'}
  [Email] GMAIL_REFRESH_TOKEN={'SET' if os.getenv('GMAIL_REFRESH_TOKEN') else 'MISSING'}
  [Email] GMAIL_FROM_EMAIL={os.getenv('GMAIL_FROM_EMAIL', '(not set)')}
  [GDrive] GOOGLE_OAUTH_CLIENT_ID={'SET' if os.getenv('GOOGLE_OAUTH_CLIENT_ID') else 'MISSING'}
  [GDrive] GOOGLE_OAUTH_CLIENT_SECRET={'SET' if os.getenv('GOOGLE_OAUTH_CLIENT_SECRET') else 'MISSING'}
""")

# Initialize ChromaDB (must happen after dirs/db are ready)
from services.chroma import text_col, image_col  # noqa: F401 — triggers init + prints

print(f"\n  → http://localhost:8000\n{'='*60}\n")

# ── FastAPI app ──
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from security import SecurityHeadersMiddleware, RequestIDMiddleware

app = FastAPI(title="Cane", version="1.0.0", docs_url=None if IS_PRODUCTION else "/docs")

# Middleware
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RequestIDMiddleware)


@app.middleware("http")
async def add_cache_headers(request, call_next):
    response = await call_next(request)
    path = request.url.path
    content_type = response.headers.get("content-type", "")
    # Never cache API responses or HTML pages
    if path.startswith("/api/") or "text/html" in content_type or path == "/":
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Mount routers ──
from routes.auth import router as auth_router
from routes.documents import router as documents_router
from routes.search import router as search_router
from routes.ask import router as ask_router
from routes.agents import router as agents_router
from routes.admin import router as admin_router
from routes.team import router as team_router
from routes.api_keys import router as api_keys_router
from routes.api_v1 import router as api_v1_router
from eval_routes import router as eval_router
from marketplace_routes import router as marketplace_router
from tool_routes import router as tool_router
from mcp_routes import router as mcp_router
from pack_routes import router as pack_router
from analytics_routes import router as analytics_router
from email_routes import router as email_router
from calendar_routes import router as calendar_router
from sheets_routes import router as sheets_router
from prospect_routes import router as prospect_router
from connector_routes import router as connector_router
from routes.demo import router as demo_router
from schedule_routes import router as schedule_router

app.include_router(auth_router)
app.include_router(documents_router)
app.include_router(search_router)
app.include_router(ask_router)
app.include_router(agents_router)
app.include_router(admin_router)
app.include_router(team_router)
app.include_router(api_keys_router)
app.include_router(api_v1_router)
app.include_router(eval_router)
app.include_router(marketplace_router)
app.include_router(tool_router)
app.include_router(mcp_router)
app.include_router(pack_router)
app.include_router(analytics_router)
app.include_router(email_router)
app.include_router(calendar_router)
app.include_router(sheets_router)
app.include_router(prospect_router)
app.include_router(connector_router)
app.include_router(demo_router)
app.include_router(schedule_router)


# ── Background sync loop for Live Connectors ──
@app.on_event("startup")
async def start_connector_sync():
    import asyncio
    from services.connector_sync import start_sync_loop
    asyncio.create_task(start_sync_loop())


# ── Background schedule loop for Scheduled Agent Runs ──
@app.on_event("startup")
async def start_schedule_runner():
    import asyncio
    from services.schedule_runner import start_schedule_loop
    asyncio.create_task(start_schedule_loop())


# ── Health check ──
@app.get("/api/health")
def health_check():
    return {"status": "ok", "service": "cane"}


# ── Embeddable Widget ──
@app.get("/widget.js")
def serve_widget():
    widget_path = pathlib.Path(__file__).parent / "widget.js"
    if widget_path.exists():
        return FileResponse(
            str(widget_path), media_type="application/javascript",
            headers={"Cache-Control": "public, max-age=3600", "Access-Control-Allow-Origin": "*"},
        )
    raise HTTPException(404, "Widget not found")


# ── Serve React SPA (production) ──
_static = pathlib.Path(__file__).parent / "static"
if _static.is_dir():
    app.mount("/assets", StaticFiles(directory=str(_static / "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        file = _static / full_path
        if file.is_file():
            return FileResponse(str(file))
        resp = FileResponse(str(_static / "index.html"))
        resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        resp.headers["Pragma"] = "no-cache"
        return resp


# ── Run ──
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)