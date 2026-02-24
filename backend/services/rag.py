"""
services/rag.py — Shared RAG context building and Claude API calls.

Extracts the duplicated context-building logic from /api/ask, /api/ask/stream,
and /v1/ask into a single reusable function.
"""
from collections import Counter
from dataclasses import dataclass, field

from config import RAG_BASE_RULES
from services.search import search_text, search_visual, clean_transcript, build_tenant_where


@dataclass
class RAGContext:
    """Result of building RAG context for a query."""
    context: str
    sources: list[str]
    images: list[dict]
    visual_context_count: int
    text_context_count: int

    @property
    def chunks_used(self) -> int:
        return self.visual_context_count + self.text_context_count

    @property
    def has_content(self) -> bool:
        return self.visual_context_count > 0 or self.text_context_count > 0


def build_context(
    query: str,
    tenant_id: str,
    workspace_id: str = "",
    n: int = 5,
) -> RAGContext:
    """
    Build RAG context for a query: visual search → text search → small corpus fallback.

    Returns a RAGContext with the combined context string, sources, and images.
    """
    from services.chroma import text_col

    where = build_tenant_where(tenant_id, workspace_id)

    visual_context, visual_sources = [], []
    text_context, text_sources = [], []
    seen_texts = set()

    def _add(bucket, src_bucket, text, source_label):
        text = clean_transcript(text.strip())
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
        visual_results = search_visual(query, 6, where)
        visual_hits = visual_results.get("results", [])
        if visual_hits and text_col.count() > 0:
            source_files = {vr.get("source_file", "") for vr in visual_hits if vr.get("source_file")}
            for src_file in source_files:
                src_where_parts = [{"tenant_id": tenant_id}, {"source_file": src_file}]
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
    text_results = search_text(query, n, where)
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

    # Assemble context string
    context_parts = []
    sources = []
    if visual_context:
        context_parts.append(
            "=== HIGHLY RELEVANT (matched by visual/slide analysis) ===\n\n"
            + "\n\n---\n\n".join(visual_context)
        )
        sources.extend(visual_sources)
    if text_context:
        context_parts.append(
            "=== ADDITIONAL DOCUMENT EXCERPTS ===\n\n"
            + "\n\n---\n\n".join(text_context)
        )
        sources.extend(text_sources)

    # Deduplicate sources preserving order
    sources = list(dict.fromkeys(sources))

    # Build images list from visual hits
    images = _extract_images(visual_hits)

    return RAGContext(
        context="\n\n\n".join(context_parts),
        sources=sources,
        images=images,
        visual_context_count=len(visual_context),
        text_context_count=len(text_context),
    )


def _extract_images(visual_hits: list) -> list[dict]:
    """Deduplicate and filter visual hit images."""
    img_seen = {}
    for vr in visual_hits:
        if vr.get("frame_url") and vr.get("score", 0) > 0.20:
            src = vr.get("source_file", "")
            page = vr.get("page", 0)
            key = f"{src}:{page}" if page else f"{src}:{vr.get('timestamp_sec', 0)}"
            if key not in img_seen or vr["score"] > img_seen[key]["score"]:
                img_seen[key] = {
                    "url": vr["frame_url"],
                    "source_file": src,
                    "timestamp_sec": vr.get("timestamp_sec", 0),
                    "page": page,
                    "score": vr.get("score", 0),
                }

    # Template detection: same page from 3+ files = boilerplate
    pg_count = Counter(v["page"] for v in img_seen.values() if v["page"] > 0)
    tpl_pages = {p for p, c in pg_count.items() if c >= 3}
    filtered = {k: v for k, v in img_seen.items() if v["page"] not in tpl_pages}

    return sorted(filtered.values(), key=lambda x: x["score"], reverse=True)[:4]


def build_system_prompt(agent_prompt: str = "") -> str:
    """Build the system prompt with RAG base rules."""
    if agent_prompt:
        return agent_prompt + "\n\nAdditional retrieval rules:" + RAG_BASE_RULES
    return "You are a helpful assistant. Answer the question using ONLY the provided document excerpts." + RAG_BASE_RULES


def call_claude(user_prompt: str, system: str = "") -> str:
    """Call Claude API for RAG summarization."""
    from services.claude import call
    return call(user_prompt, system=system)
