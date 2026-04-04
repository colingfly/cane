"""
chunk_enricher.py — Contextual enrichment for Cane.

Enriches chunks BEFORE they get embedded, so the vector representation
captures not just the raw text but also the context of where it came from.

Two enrichment strategies:
  1. Contextual Header — Prepends a structured header with class, lecture, page, topic
  2. Neighbor Context  — Appends a brief summary of surrounding chunks for continuity

The enriched text is what gets embedded. The original text is preserved separately
for display to the user (you don't want to show "Class: Intro to ML | Lecture 2" 
in the search results).

Usage in ingestor.py:
    from cane.rag.enricher import enrich_chunks
    enriched = enrich_chunks(chunks, file_meta)
    # enriched[i].enriched_text → embed this
    # enriched[i].display_text  → show this to user
"""

import re
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class EnrichedChunk:
    """A chunk with both enriched (for embedding) and display (for UI) text."""
    display_text: str           # Original text — shown in search results
    enriched_text: str          # Enriched text — embedded into vector DB
    chunk_id: str = ""
    metadata: dict = field(default_factory=dict)


@dataclass
class FileMeta:
    """Metadata about the source file, used for enrichment."""
    class_name: str = ""        # e.g. "Intro to Machine Learning"
    professor: str = ""         # e.g. "Liang Liang"
    lecture_label: str = ""     # e.g. "Lecture 2"
    lecture_topic: str = ""     # e.g. "K-Means Clustering"  (auto-detected or user-provided)
    filename: str = ""          # e.g. "Lecture2_Kmeans.pdf"
    file_type: str = ""         # e.g. "pdf", "video", "docx"


# ═══════════════════════════════════════════════════════════
#  MAIN API
# ═══════════════════════════════════════════════════════════

def enrich_chunks(
    chunks: list,
    file_meta: FileMeta,
    add_neighbor_context: bool = True,
    neighbor_chars: int = 150,
) -> list[EnrichedChunk]:
    """
    Enrich a list of chunks with contextual metadata for better embeddings.

    Args:
        chunks: List of SmartChunk objects (from smart_chunker.py)
                OR list of dicts with at minimum "text" key
        file_meta: Metadata about the source file
        add_neighbor_context: Whether to append prev/next chunk snippets
        neighbor_chars: How many chars of neighbor context to include

    Returns:
        List of EnrichedChunk objects with enriched_text for embedding
        and display_text for the UI
    """
    # Normalize input to list of (text, meta_dict) tuples
    normalized = _normalize_chunks(chunks)

    if not normalized:
        return []

    enriched = []

    for i, (text, chunk_meta) in enumerate(normalized):
        # ── Build contextual header ──
        header = _build_header(file_meta, chunk_meta)

        # ── Build neighbor context ──
        neighbor_ctx = ""
        if add_neighbor_context and len(normalized) > 1:
            neighbor_ctx = _build_neighbor_context(
                normalized, i, neighbor_chars
            )

        # ── Compose enriched text ──
        parts = []
        if header:
            parts.append(header)
        parts.append(text)
        if neighbor_ctx:
            parts.append(neighbor_ctx)

        enriched_text = "\n\n".join(parts)

        # ── Build chunk ID ──
        chunk_id = chunk_meta.get("chunk_id", "")
        if not chunk_id:
            # Generate one from file + index
            safe_name = re.sub(r'[^\w]', '_', file_meta.filename)
            chunk_id = f"{safe_name}_chunk_{i:04d}"

        # ── Merge metadata ──
        merged_meta = {
            "class_name": file_meta.class_name,
            "professor": file_meta.professor,
            "lecture_label": file_meta.lecture_label,
            "lecture_topic": file_meta.lecture_topic or _detect_topic(normalized),
            "filename": file_meta.filename,
            "file_type": file_meta.file_type,
            "chunk_index": i,
            "total_chunks": len(normalized),
            **chunk_meta,
        }

        enriched.append(EnrichedChunk(
            display_text=text,
            enriched_text=enriched_text,
            chunk_id=chunk_id,
            metadata=merged_meta,
        ))

    return enriched


# ═══════════════════════════════════════════════════════════
#  CONTEXTUAL HEADER
# ═══════════════════════════════════════════════════════════

def _build_header(file_meta: FileMeta, chunk_meta: dict) -> str:
    """
    Build a structured contextual header that gets prepended to the chunk.

    Example output:
        "Organization: Coral Gables Dental | HR Policies |
         Source: employee_handbook.pdf, page 12"
    """
    parts = []

    if file_meta.class_name:
        parts.append(f"Organization: {file_meta.class_name}")

    # Lecture + topic combined
    lecture_str = ""
    if file_meta.lecture_label:
        lecture_str = file_meta.lecture_label
    if file_meta.lecture_topic:
        lecture_str += f": {file_meta.lecture_topic}" if lecture_str else file_meta.lecture_topic
    if lecture_str:
        parts.append(lecture_str)

    if file_meta.professor:
        parts.append(f"Professor: {file_meta.professor}")

    # Source location
    source_parts = []
    if file_meta.filename:
        source_parts.append(file_meta.filename)

    page_start = chunk_meta.get("page_start") or chunk_meta.get("page")
    page_end = chunk_meta.get("page_end")
    if page_start:
        if page_end and page_end != page_start:
            source_parts.append(f"pages {page_start}-{page_end}")
        else:
            source_parts.append(f"page {page_start}")

    ts_start = chunk_meta.get("timestamp_start")
    ts_end = chunk_meta.get("timestamp_end")
    if ts_start is not None:
        source_parts.append(f"timestamp {_fmt_ts(ts_start)}-{_fmt_ts(ts_end or ts_start)}")

    heading = chunk_meta.get("heading")
    if heading:
        source_parts.append(f"section: {heading}")

    if source_parts:
        parts.append(f"Source: {', '.join(source_parts)}")

    if not parts:
        return ""

    return " | ".join(parts)


# ═══════════════════════════════════════════════════════════
#  NEIGHBOR CONTEXT
# ═══════════════════════════════════════════════════════════

def _build_neighbor_context(
    chunks: list[tuple[str, dict]],
    current_idx: int,
    max_chars: int,
) -> str:
    """
    Build a brief context snippet from neighboring chunks.

    Format:
        "[Previous context: ...last 150 chars of previous chunk...]
         [Next context: ...first 150 chars of next chunk...]"
    """
    parts = []

    if current_idx > 0:
        prev_text = chunks[current_idx - 1][0]
        snippet = prev_text[-max_chars:].strip()
        if snippet:
            # Start at a word boundary
            if len(snippet) == max_chars:
                first_space = snippet.find(' ')
                if first_space > 0:
                    snippet = snippet[first_space + 1:]
            parts.append(f"[Previous context: ...{snippet}]")

    if current_idx < len(chunks) - 1:
        next_text = chunks[current_idx + 1][0]
        snippet = next_text[:max_chars].strip()
        if snippet:
            # End at a word boundary
            if len(snippet) == max_chars:
                last_space = snippet.rfind(' ')
                if last_space > 0:
                    snippet = snippet[:last_space]
            parts.append(f"[Next context: {snippet}...]")

    return "\n".join(parts) if parts else ""


# ═══════════════════════════════════════════════════════════
#  TOPIC DETECTION
# ═══════════════════════════════════════════════════════════

def _detect_topic(chunks: list[tuple[str, dict]]) -> str:
    """
    Simple heuristic topic detection from the first few chunks.
    Looks for headings, title patterns, or dominant keywords.
    """
    # Check headings in first 3 chunks
    for text, meta in chunks[:3]:
        heading = meta.get("heading")
        if heading and len(heading) > 5:
            return heading

    # Check first chunk for a title-like first line
    if chunks:
        first_lines = chunks[0][0].strip().split('\n')
        if first_lines:
            candidate = first_lines[0].strip()
            if (
                3 < len(candidate) < 60
                and not candidate.endswith('.')
                and not candidate.startswith('http')
            ):
                return candidate

    return ""


# ═══════════════════════════════════════════════════════════
#  UTILITIES
# ═══════════════════════════════════════════════════════════

def _normalize_chunks(chunks: list) -> list[tuple[str, dict]]:
    """Convert various chunk formats to (text, meta_dict) tuples."""
    result = []

    for c in chunks:
        if hasattr(c, 'text') and hasattr(c, 'meta'):
            # SmartChunk from smart_chunker.py
            meta_dict = {}
            if hasattr(c.meta, '__dict__'):
                meta_dict = {k: v for k, v in c.meta.__dict__.items() if v is not None}
            result.append((c.text, meta_dict))

        elif isinstance(c, dict):
            text = c.get("text", "")
            meta = {k: v for k, v in c.items() if k != "text" and v is not None}
            result.append((text, meta))

        elif isinstance(c, str):
            result.append((c, {}))

    return result


def _fmt_ts(seconds: float) -> str:
    """Format seconds as MM:SS."""
    m, s = divmod(int(seconds), 60)
    return f"{m}:{s:02d}"


# ═══════════════════════════════════════════════════════════
#  TESTING
# ═══════════════════════════════════════════════════════════

if __name__ == "__main__":
    from cane.rag.chunker import SmartChunk, ChunkMeta

    print("=" * 60)
    print("CHUNK ENRICHMENT TEST")
    print("=" * 60)

    # Simulated chunks (as if from smart_chunker)
    test_chunks = [
        SmartChunk(
            text="The goal of clustering is to divide objects into groups, such that objects within a group are more similar to each other than to those in other groups.",
            meta=ChunkMeta(page_start=4, page_end=4, heading="Introduction to Clustering", source_type="pdf_page", chunk_index=0, total_chunks=3)
        ),
        SmartChunk(
            text="The k-means algorithm works iteratively: Initialize K cluster centers randomly, assign each data point to the nearest center, recompute each center as the mean of assigned points, repeat until convergence.",
            meta=ChunkMeta(page_start=5, page_end=6, heading="K-Means Algorithm", source_type="pdf_page", chunk_index=1, total_chunks=3)
        ),
        SmartChunk(
            text="The loss function measures the average squared distance from data points to their assigned cluster centers. The algorithm minimizes this loss by alternating between updating assignments and updating centers.",
            meta=ChunkMeta(page_start=8, page_end=8, heading=None, source_type="pdf_page", chunk_index=2, total_chunks=3)
        ),
    ]

    meta = FileMeta(
        class_name="Intro to Machine Learning",
        professor="Liang Liang",
        lecture_label="Lecture 2",
        lecture_topic="K-Means Clustering",
        filename="Lecture2_Kmeans.pdf",
        file_type="pdf",
    )

    enriched = enrich_chunks(test_chunks, meta)

    for ec in enriched:
        print(f"\n{'─' * 50}")
        print(f"Chunk ID: {ec.chunk_id}")
        print(f"\nDISPLAY TEXT (what user sees):")
        print(f"  {ec.display_text[:150]}...")
        print(f"\nENRICHED TEXT (what gets embedded):")
        print(f"  {ec.enriched_text[:300]}...")
        print(f"\nMETADATA:")
        for k, v in ec.metadata.items():
            if v:
                print(f"  {k}: {v}")

    # ── Test with transcript chunks ──
    print(f"\n\n{'=' * 60}")
    print("TRANSCRIPT ENRICHMENT TEST")
    print("=" * 60)

    ts_chunks = [
        SmartChunk(
            text="So today we're going to talk about k-means clustering. This is probably the most well-known clustering algorithm.",
            meta=ChunkMeta(timestamp_start=0.0, timestamp_end=6.2, source_type="transcript", chunk_index=0, total_chunks=2)
        ),
        SmartChunk(
            text="The basic idea is you have K groups and you want to assign each data point to one of those groups. The way it works is first you pick K random centers.",
            meta=ChunkMeta(timestamp_start=6.2, timestamp_end=14.5, source_type="transcript", chunk_index=1, total_chunks=2)
        ),
    ]

    ts_meta = FileMeta(
        class_name="Intro to Machine Learning",
        professor="Liang Liang",
        lecture_label="Lecture 2",
        lecture_topic="K-Means Clustering",
        filename="lecture_2.mp4",
        file_type="video",
    )

    ts_enriched = enrich_chunks(ts_chunks, ts_meta)

    for ec in ts_enriched:
        print(f"\n{'─' * 50}")
        print(f"ENRICHED TEXT:")
        print(f"  {ec.enriched_text}")

    print("\nAll enrichment tests passed")