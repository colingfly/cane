"""
config.py — Single source of truth for the Cane pipeline.
"""
import os
from pathlib import Path

# ── Paths ──
BASE_DIR = Path(os.getenv("CANE_BASE_DIR", "/data/cane"))
INPUT_DIR = BASE_DIR / "input"
DB_PATH = str(BASE_DIR / "chroma_db")
EXTRACTED_DIR = BASE_DIR / "extracted"
UPLOAD_DIR = BASE_DIR / "uploads"      # per-tenant uploads stored here

# ── Static frontend (built React app) ──
STATIC_DIR = Path(os.getenv("CANE_STATIC_DIR", str(Path(__file__).resolve().parent.parent / "frontend" / "dist")))

# ── MySQL ──
# Railway provides DATABASE_URL directly; fall back to individual vars for local dev
DATABASE_URL = os.getenv("DATABASE_URL", "")
if not DATABASE_URL:
    MYSQL_USER = os.getenv("CANE_DB_USER", "root")
    MYSQL_PASSWORD = os.getenv("CANE_DB_PASSWORD", "")
    MYSQL_HOST = os.getenv("CANE_DB_HOST", "localhost")
    MYSQL_PORT = os.getenv("CANE_DB_PORT", "3306")
    MYSQL_DATABASE = os.getenv("CANE_DB_NAME", "cane")
    DATABASE_URL = (
        f"mysql+pymysql://{MYSQL_USER}:{MYSQL_PASSWORD}"
        f"@{MYSQL_HOST}:{MYSQL_PORT}/{MYSQL_DATABASE}"
    )
else:
    # Railway gives mysql:// — SQLAlchemy needs mysql+pymysql://
    if DATABASE_URL.startswith("mysql://"):
        DATABASE_URL = DATABASE_URL.replace("mysql://", "mysql+pymysql://", 1)

# ── Auth ──
def _get_secret_key():
    key = os.getenv("CANE_SECRET_KEY", "")
    if not key:
        import warnings
        warnings.warn(
            "CANE_SECRET_KEY not set! Using random key (tokens won't survive restarts). "
            "Set it: export CANE_SECRET_KEY=$(python -c 'import secrets; print(secrets.token_hex(32))')",
            stacklevel=2,
        )
        import secrets
        return secrets.token_hex(32)
    return key

SECRET_KEY = _get_secret_key()
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = 24  # Tightened from 72h

# ── CORS ──
ALLOWED_ORIGINS = os.getenv("CANE_ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")

# ── Environment ──
IS_PRODUCTION = os.getenv("CANE_ENV", "development").lower() == "production"

# ── LLM (Claude API) ──
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
CLAUDE_MODEL = os.getenv("CANE_CLAUDE_MODEL", "claude-haiku-4-5-20251001")

# ── Embedding Model ──
# BGE-large is 3x better retrieval than BGE-base, still runs locally
TEXT_EMBED_MODEL = os.getenv("CANE_EMBED_MODEL", "BAAI/bge-base-en-v1.5")

def get_embedding_function():
    """Return the embedding function."""
    from chromadb.utils import embedding_functions
    print(f"  [Embeddings] Using local {TEXT_EMBED_MODEL}")
    return embedding_functions.SentenceTransformerEmbeddingFunction(
        model_name=TEXT_EMBED_MODEL
    )

def get_active_embed_id() -> str:
    """Return a string identifying the active embedding model (for change detection)."""
    return f"local:{TEXT_EMBED_MODEL}"

# ── Collections ──
TEXT_COLLECTION = "cane_chunks"
IMAGE_COLLECTION = "cane_images"

# ── Models ──
CLIP_MODEL = "openai/clip-vit-base-patch32"
WHISPER_MODEL = os.getenv("CANE_WHISPER_MODEL", "base")  # base=fast/light, medium=better accuracy

# ── Chunking ──
CHUNK_SIZE = 2000
CHUNK_OVERLAP = 400

# ── RAG Base Rules (applied to every agent query) ──
RAG_BASE_RULES = """
Rules:
- Excerpts marked "HIGHLY RELEVANT" were identified by visual/slide analysis as directly related to the question. Pay special attention to these.
- Some excerpts contain [Slide text] (OCR'd from slides — accurate terminology) and [Spoken] (audio transcript — may have spelling errors). Trust slide text for exact terms and names.
- Fix obvious transcription errors: audio transcripts may contain phonetic misspellings. Use context and slide text to correct these.
- Answer strictly based on the provided content. Never fabricate information not present in the excerpts.
- Give a clear, concise explanation. Lead with the direct answer.
- COMPLETENESS: Search through ALL provided excerpts carefully before answering. When listing items, combine information found across multiple excerpts into one complete answer. If you find a partial list in one excerpt, check others for additional items before responding.
- PARTIAL INFORMATION: If your answer may be incomplete because the excerpts don't cover everything, say "Based on the available excerpts..." rather than presenting a partial answer as definitive.
- BEFORE SAYING SOMETHING ISN'T COVERED: Check every excerpt carefully. Do not conclude information is missing after reading only a subset of the excerpts. Only say "this is not covered" if you have thoroughly reviewed all provided content.
- If the excerpts genuinely don't contain enough info, say what you can and clearly note the gap."""

# ── Video keyframes ──
SCENE_THRESHOLD = 30.0
MIN_FRAME_GAP_SEC = 8
MAX_FRAME_GAP_SEC = 30
PHASH_DEDUP_THRESHOLD = 8

# ── Supported extensions ──
EXT_MAP = {
    ".pdf": "pdf",
    ".docx": "docx",
    ".doc": "docx",
    ".xlsx": "xlsx",
    ".xls": "xlsx",
    ".csv": "csv",
    ".mp3": "audio",
    ".wav": "audio",
    ".m4a": "audio",
    ".flac": "audio",
    ".ogg": "audio",
    ".mp4": "video",
    ".mkv": "video",
    ".avi": "video",
    ".mov": "video",
    ".webm": "video",
    ".png": "image",
    ".jpg": "image",
    ".jpeg": "image",
    ".gif": "image",
    ".bmp": "image",
    ".tiff": "image",
    ".webp": "image",
}


def ensure_dirs():
    """Create all required directories."""
    for d in [INPUT_DIR, EXTRACTED_DIR, Path(DB_PATH), UPLOAD_DIR]:
        d.mkdir(parents=True, exist_ok=True)