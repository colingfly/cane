import os

code = '''

# ── Health check ──────────────────────────────────────────
@app.get("/api/health")
def health_check():
    return {"status": "ok", "service": "cane"}

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
'''

with open('backend/app.py', 'a', encoding='utf-8') as f:
    f.write(code)

print("Added health + static serving to app.py")
