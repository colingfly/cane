"""
services/search.py — Search helpers.

Cross-encoder reranking, deduplication, transcript cleanup,
and the three search modes (text, visual, fusion).
"""
import re
from cane.core.config import EXTRACTED_DIR, CLIP_MODEL
from cane.rag.quality import is_quality_chunk

# ── Score thresholds ──
TEXT_SCORE_THRESHOLD = 0.70
FUSION_SCORE_THRESHOLD = 0.30

# ── Transcript cleanup patterns ──
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


def clean_transcript(text: str) -> str:
    if not text:
        return text
    for pattern, replacement in _TRANSCRIPT_FIXES:
        text = re.sub(pattern, replacement, text)
    return text


# ── ChromaDB where-clause builder ──

def build_tenant_where(tenant_id: str, workspace_id: str = "") -> dict:
    """Build a ChromaDB where clause scoped to tenant + optional workspace."""
    conditions = [{"tenant_id": tenant_id}]
    if workspace_id:
        conditions.append({"workspace_id": workspace_id})
    if len(conditions) > 1:
        return {"$and": conditions}
    return conditions[0]


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


def rerank_results(query: str, results: list, blend: float = 0.6) -> list:
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


def dedup_results(results: list, sim_threshold: float = 0.85) -> list:
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


def frame_path_to_url(frame_path: str) -> str:
    """Convert absolute frame path to API URL."""
    if not frame_path:
        return ""
    extracted = str(EXTRACTED_DIR)
    if frame_path.startswith(extracted):
        relative = frame_path[len(extracted):].lstrip("/")
        return f"/api/images/{relative}"
    return ""


# ── Search modes ──

def search_text(q: str, n: int, where: dict) -> dict:
    from cane.rag.chroma import text_col

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
        if not display or not is_quality_chunk(display):
            continue
        score = max(0, 1 - dist)
        rank += 1
        results.append({
            "rank": rank,
            "text": clean_transcript(display[:500]),
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

    results = dedup_results(results)
    results = rerank_results(q, results)
    results = [r for r in results if r["score"] >= TEXT_SCORE_THRESHOLD]

    return {"results": results[:n], "mode": "text", "total": text_col.count()}


def search_visual(q: str, n: int, where: dict) -> dict:
    from cane.rag.chroma import image_col as _img_col, chroma_client
    from cane.core.config import IMAGE_COLLECTION
    import cane.rag.chroma as _chroma_mod

    img_col = _img_col
    if img_col is None:
        try:
            img_col = chroma_client.get_collection(IMAGE_COLLECTION)
            _chroma_mod.image_col = img_col
        except Exception:
            return {"results": [], "mode": "visual", "total": 0}

    if img_col.count() == 0:
        return {"results": [], "mode": "visual", "total": 0}

    import torch
    from transformers import CLIPModel, CLIPProcessor

    if not hasattr(search_visual, "_model"):
        device = "cuda" if torch.cuda.is_available() else "cpu"
        search_visual._model = CLIPModel.from_pretrained(CLIP_MODEL).to(device)
        search_visual._proc = CLIPProcessor.from_pretrained(CLIP_MODEL)
        search_visual._device = device

    inputs = search_visual._proc(text=[q], return_tensors="pt")
    input_ids = inputs["input_ids"].to(search_visual._device)
    attention_mask = inputs["attention_mask"].to(search_visual._device)
    with torch.no_grad():
        text_out = search_visual._model.text_model(input_ids=input_ids, attention_mask=attention_mask)
        emb = search_visual._model.text_projection(text_out.pooler_output)
        emb = emb / emb.norm(dim=-1, keepdim=True)

    fetch_n = min(n * 3, img_col.count())
    kwargs = {
        "query_embeddings": [emb[0].cpu().tolist()],
        "n_results": fetch_n,
        "include": ["metadatas", "distances", "embeddings"],
    }
    if where:
        kwargs["where"] = where

    try:
        r = img_col.query(**kwargs)
    except Exception:
        return {"results": [], "mode": "visual", "total": 0}

    raw = []
    for i, (img_id, meta, dist, img_emb) in enumerate(zip(
        r["ids"][0], r["metadatas"][0], r["distances"][0], r["embeddings"][0]
    )):
        score = max(0, 1 - (dist ** 2 / 2))
        raw.append({
            "rank": i + 1,
            "image_id": img_id,
            "score": round(score, 4),
            "frame_url": frame_path_to_url(meta.get("frame_path", "")),
            "source_file": meta.get("source_file", ""),
            "source_type": meta.get("source_type", ""),
            "workspace_id": meta.get("workspace_id", ""),
            "timestamp_sec": meta.get("timestamp_sec", 0),
            "page": meta.get("page", 0),
            "_emb": img_emb,
        })

    # Embedding-based dedup
    results = []
    dup_counts = []
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

    # Remove templates: images that had 2+ near-duplicates
    filtered = [r for r, dc in zip(results, dup_counts) if dc < 2]
    if not filtered and results:
        filtered = [r for r, dc in zip(results, dup_counts) if dc < 5]
    results = filtered[:n]

    for r in results:
        r.pop("_emb", None)

    return {"results": results, "mode": "visual", "total": img_col.count()}


def search_fusion(q: str, n: int, where: dict) -> dict:
    text_r = search_text(q, n * 2, where)
    visual_r = search_visual(q, n * 2, where)

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
                "text": f"[Visual match — p.{page}]" if page else f"[Visual match at {ts:.0f}s]",
            }

    ranked = sorted(rrf_scores.items(), key=lambda x: x[1], reverse=True)[:n * 2]
    results = []
    for i, (key, score) in enumerate(ranked):
        data = rrf_data.get(key, {})
        data["rank"] = i + 1
        data["score"] = round(score, 4)
        results.append(data)

    results = dedup_results(results)
    results = rerank_results(q, results)
    results = [r for r in results if r["score"] >= FUSION_SCORE_THRESHOLD]

    return {"results": results[:n], "mode": "fusion"}
