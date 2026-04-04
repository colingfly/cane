"""
services/chroma.py — ChromaDB singleton.

Initializes the Chroma client and collections once at startup.
All modules import from here instead of managing their own references.
"""
import chromadb
from pathlib import Path
from cane.core.config import DB_PATH, TEXT_COLLECTION, IMAGE_COLLECTION, get_embedding_function, get_active_embed_id

# ── Initialize Chroma client ──
chroma_client = chromadb.PersistentClient(path=DB_PATH)

# ── Embedding function ──
ef = get_embedding_function()

# ── Detect embedding model change ──
_embed_marker_path = Path(DB_PATH) / ".embed_model"
_active_embed = get_active_embed_id()
_prev_embed = _embed_marker_path.read_text().strip() if _embed_marker_path.exists() else None

if _prev_embed and _prev_embed != _active_embed:
    print(f"\n  [WARN] EMBEDDING MODEL CHANGED: {_prev_embed} → {_active_embed}")
    print(f"  Clearing old embeddings — documents must be re-uploaded.\n")
    try:
        chroma_client.delete_collection(TEXT_COLLECTION)
    except Exception:
        pass

_embed_marker_path.write_text(_active_embed)

# ── Collections ──
text_col = chroma_client.get_or_create_collection(TEXT_COLLECTION, embedding_function=ef)

try:
    image_col = chroma_client.get_collection(IMAGE_COLLECTION)
except Exception:
    image_col = None

print(f"  Chunks: {text_col.count()}")
print(f"  Images: {image_col.count() if image_col else 0}")
