"""
cane/api/app.py -- FastAPI application factory.

Usage:
    from cane.api.app import create_fastapi_app
    app = create_fastapi_app()

    # Or for direct execution:
    python -m cane.api.app
"""
import os
import pathlib

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse


def create_fastapi_app(
    cors_origins: list = None,
    enable_game: bool = True,
    static_dir: str = None,
) -> FastAPI:
    """
    Create and configure the Cane FastAPI application.

    This is the factory function. It:
    1. Initializes the database and runs migrations
    2. Creates the FastAPI app with middleware
    3. Mounts all routers
    4. Registers background tasks
    5. Optionally serves the React SPA
    """
    from cane.core.config import BASE_DIR, DB_PATH, EXTRACTED_DIR, IS_PRODUCTION, ensure_dirs
    from cane.core.database import init_db

    # Import game models to register tables before init_db
    import cane.game.models  # noqa: F401

    # Boot sequence
    ensure_dirs()
    init_db()

    # Migrations
    from cane.core.migrations import run_all as run_migrations
    try:
        run_migrations()
    except Exception as e:
        print(f"  [DB] Migrations skipped: {e}")

    # Auto-seed
    from cane.core.seed import auto_seed
    auto_seed()

    # Init ChromaDB
    from cane.rag.chroma import text_col, image_col  # noqa: F401

    print(f"\n  Cane API ready | DB: {DB_PATH} | Base: {BASE_DIR}")

    # Create app
    app = FastAPI(
        title="Cane",
        version="1.0.0",
        docs_url=None if IS_PRODUCTION else "/docs",
    )

    # Middleware
    from cane.core.security import SecurityHeadersMiddleware, RequestIDMiddleware
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(RequestIDMiddleware)

    @app.middleware("http")
    async def add_cache_headers(request, call_next):
        response = await call_next(request)
        path = request.url.path
        content_type = response.headers.get("content-type", "")
        if path.startswith("/api/") or "text/html" in content_type or path == "/":
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
        return response

    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins or ["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Mount all routers
    _mount_routers(app, enable_game=enable_game)

    # Background tasks
    _register_background_tasks(app)

    # Health check
    @app.get("/api/health")
    def health_check():
        return {"status": "ok", "service": "cane"}

    # Widget
    @app.get("/widget.js")
    def serve_widget():
        widget_path = pathlib.Path(__file__).parent / "widget.js"
        if widget_path.exists():
            return FileResponse(
                str(widget_path), media_type="application/javascript",
                headers={"Cache-Control": "public, max-age=3600", "Access-Control-Allow-Origin": "*"},
            )
        raise HTTPException(404, "Widget not found")

    # Static SPA serving
    _static = pathlib.Path(static_dir) if static_dir else pathlib.Path(__file__).parent / "static"
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

    return app


def _mount_routers(app: FastAPI, enable_game: bool = True):
    """Mount all API routers."""
    from cane.api.routes.auth import router as auth_router
    from cane.api.routes.documents import router as documents_router
    from cane.api.routes.search import router as search_router
    from cane.api.routes.ask import router as ask_router
    from cane.api.routes.agents import router as agents_router
    from cane.api.routes.admin import router as admin_router
    from cane.api.routes.team import router as team_router
    from cane.api.routes.api_keys import router as api_keys_router
    from cane.api.routes.api_v1 import router as api_v1_router
    from cane.api.routes.eval import router as eval_router
    from cane.api.routes.marketplace import router as marketplace_router
    from cane.api.routes.tools import router as tool_router
    from cane.api.routes.mcp import router as mcp_router
    from cane.api.routes.analytics import router as analytics_router
    from cane.api.routes.email import router as email_router
    from cane.api.routes.calendar import router as calendar_router
    from cane.api.routes.sheets import router as sheets_router
    from cane.api.routes.prospects import router as prospect_router
    from cane.api.routes.connectors import router as connector_router
    from cane.api.routes.demo import router as demo_router
    from cane.api.routes.schedules import router as schedule_router
    from cane.api.routes.memory_routes import router as memory_router
    from cane.api.routes.conversations import router as conversation_router
    from cane.api.routes.collaboration import router as collaboration_router
    from cane.api.routes.web_tools import router as web_tools_router
    from cane.api.routes.eval_api import router as eval_api_router
    from cane.api.routes.badges import router as badges_router
    from cane.api.routes.eval_export import router as eval_export_router
    from cane.api.routes.mining_routes import router as mining_router
    from cane.api.routes.finetune import router as finetune_router
    from cane.api.routes.eval_analytics import router as eval_analytics_router
    from cane.api.routes.agent_versions import router as agent_versions_router
    from cane.api.routes.execution_tracing import router as execution_tracing_router
    from cane.api.routes.rca_routes import router as rca_router
    from cane.api.routes.osint_sources import router as osint_source_router
    from cane.api.routes.osint import router as osint_router

    for r in [
        auth_router, documents_router, search_router, ask_router,
        collaboration_router, agents_router, admin_router, team_router,
        api_keys_router, api_v1_router, eval_router, marketplace_router,
        tool_router, mcp_router, analytics_router, email_router,
        calendar_router, sheets_router, prospect_router, connector_router,
        demo_router, schedule_router, memory_router, conversation_router,
        web_tools_router, eval_api_router, badges_router, eval_export_router,
        mining_router, finetune_router, eval_analytics_router,
        agent_versions_router, execution_tracing_router, rca_router,
        osint_source_router, osint_router,
    ]:
        app.include_router(r)

    if enable_game:
        from cane.api.routes.game import router as game_router
        app.include_router(game_router)


def _register_background_tasks(app: FastAPI):
    """Register startup background tasks."""

    @app.on_event("startup")
    async def start_connector_sync():
        import asyncio
        from cane.integrations.connector_sync import start_sync_loop
        asyncio.create_task(start_sync_loop())

    @app.on_event("startup")
    async def start_schedule_runner():
        import asyncio
        from cane.agents.schedule_runner import start_schedule_loop
        asyncio.create_task(start_schedule_loop())

    @app.on_event("startup")
    async def start_eval_schedule_runner():
        import asyncio
        from cane.eval.schedule_runner import start_eval_schedule_loop
        asyncio.create_task(start_eval_schedule_loop())

    @app.on_event("startup")
    async def start_guest_cleanup():
        import asyncio
        from cane.core.guest_cleanup import start_guest_cleanup_loop
        asyncio.create_task(start_guest_cleanup_loop())


# Direct execution support
if __name__ == "__main__":
    import uvicorn
    app = create_fastapi_app()
    uvicorn.run(app, host="0.0.0.0", port=8000)
