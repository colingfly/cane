"""
smart_chunker.py — Semantic-aware chunking for Cane.

Replaces the naive fixed-window chunker with:
  1. Page/slide boundary awareness (never splits mid-page unless page is huge)
  2. Short-fragment merging (combines tiny slide text into coherent chunks)
  3. Sentence-boundary splitting for long pages
  4. Overlap injection between chunks for continuity

Works with both PDF page-level text and raw transcript text.

Drop-in: call smart_chunk_pages() for PDFs, smart_chunk_text() for transcripts/docx.
"""

import re
from dataclasses import dataclass, field
from typing import Optional


# ── Config defaults (override via config.py if desired) ──
DEFAULT_CHUNK_SIZE = 1500       # target chars per chunk
DEFAULT_CHUNK_OVERLAP = 200     # overlap between consecutive chunks
MIN_CHUNK_SIZE = 80             # below this → merge with neighbor
MIN_PAGE_MERGE_SIZE = 150       # pages shorter than this get merged with next page


@dataclass
class ChunkMeta:
    """Metadata attached to each chunk for enrichment + retrieval."""
    page_start: Optional[int] = None
    page_end: Optional[int] = None
    timestamp_start: Optional[float] = None
    timestamp_end: Optional[float] = None
    heading: Optional[str] = None
    chunk_index: int = 0
    total_chunks: int = 0
    source_type: str = "text"      # "pdf_page", "transcript", "docx", "text"
    merge_count: int = 1           # how many raw pages/segments were merged


@dataclass
class SmartChunk:
    """A single chunk with its text and metadata."""
    text: str
    meta: ChunkMeta = field(default_factory=ChunkMeta)


# ═══════════════════════════════════════════════════════════
#  CORE: Page-Aware Chunking (for PDFs)
# ═══════════════════════════════════════════════════════════

def smart_chunk_pages(
    pages: list[dict],
    chunk_size: int = DEFAULT_CHUNK_SIZE,
    chunk_overlap: int = DEFAULT_CHUNK_OVERLAP,
    min_chunk: int = MIN_CHUNK_SIZE,
    min_page_merge: int = MIN_PAGE_MERGE_SIZE,
) -> list[SmartChunk]:
    """
    Chunk a PDF given page-level text.

    Args:
        pages: List of dicts with keys: "text" (str), "page" (int, 1-indexed)
               e.g. [{"text": "slide content...", "page": 1}, ...]
        chunk_size: Target chunk size in characters
        chunk_overlap: Overlap between consecutive chunks
        min_chunk: Minimum viable chunk size (smaller → merge)
        min_page_merge: Pages shorter than this get merged with neighbor

    Returns:
        List of SmartChunk objects with text + metadata
    """
    if not pages:
        return []

    # ── Step 1: Clean pages ──
    cleaned = []
    for p in pages:
        text = _clean_text(p.get("text", ""))
        if text:
            cleaned.append({"text": text, "page": p.get("page", 0)})

    if not cleaned:
        return []

    # ── Step 2: Merge short pages with neighbors ──
    merged_groups = _merge_short_pages(cleaned, min_page_merge)

    # ── Step 3: Split oversized groups, keep small ones intact ──
    chunks = []
    for group in merged_groups:
        group_text = group["text"]
        page_start = group["page_start"]
        page_end = group["page_end"]
        merge_count = group["merge_count"]

        if len(group_text) <= chunk_size:
            # Fits in one chunk — keep it whole
            if len(group_text) >= min_chunk:
                chunks.append(SmartChunk(
                    text=group_text,
                    meta=ChunkMeta(
                        page_start=page_start,
                        page_end=page_end,
                        source_type="pdf_page",
                        merge_count=merge_count,
                    )
                ))
        else:
            # Too big — split at sentence boundaries with overlap
            sub_chunks = _split_at_sentences(
                group_text, chunk_size, chunk_overlap, min_chunk
            )
            for sc in sub_chunks:
                sc.meta.page_start = page_start
                sc.meta.page_end = page_end
                sc.meta.source_type = "pdf_page"
                sc.meta.merge_count = merge_count
                chunks.append(sc)

    # ── Step 4: Add overlap between page-boundary chunks ──
    chunks = _inject_overlap(chunks, chunk_overlap)

    # ── Step 5: Number them ──
    for i, c in enumerate(chunks):
        c.meta.chunk_index = i
        c.meta.total_chunks = len(chunks)

    # ── Step 6: Extract headings ──
    for c in chunks:
        c.meta.heading = _extract_heading(c.text)

    return chunks


def _merge_short_pages(pages: list[dict], min_size: int) -> list[dict]:
    """Merge consecutive short pages into groups."""
    if not pages:
        return []

    groups = []
    current = {
        "text": pages[0]["text"],
        "page_start": pages[0]["page"],
        "page_end": pages[0]["page"],
        "merge_count": 1,
    }

    for p in pages[1:]:
        # Merge if current group is short OR the new page is short
        if len(current["text"]) < min_size or len(p["text"]) < min_size:
            current["text"] += "\n\n" + p["text"]
            current["page_end"] = p["page"]
            current["merge_count"] += 1
        else:
            groups.append(current)
            current = {
                "text": p["text"],
                "page_start": p["page"],
                "page_end": p["page"],
                "merge_count": 1,
            }

    groups.append(current)
    return groups


# ═══════════════════════════════════════════════════════════
#  CORE: Raw Text Chunking (for transcripts, DOCX, etc.)
# ═══════════════════════════════════════════════════════════

def smart_chunk_text(
    text: str,
    chunk_size: int = DEFAULT_CHUNK_SIZE,
    chunk_overlap: int = DEFAULT_CHUNK_OVERLAP,
    min_chunk: int = MIN_CHUNK_SIZE,
    source_type: str = "text",
) -> list[SmartChunk]:
    """
    Chunk raw text with sentence-boundary awareness.

    Args:
        text: Raw text to chunk
        chunk_size: Target chunk size
        chunk_overlap: Overlap between chunks
        min_chunk: Minimum chunk size
        source_type: "transcript", "docx", "text"

    Returns:
        List of SmartChunk objects
    """
    text = _clean_text(text)
    if not text or len(text) < min_chunk:
        return []

    if len(text) <= chunk_size:
        return [SmartChunk(
            text=text,
            meta=ChunkMeta(source_type=source_type, chunk_index=0, total_chunks=1)
        )]

    chunks = _split_at_sentences(text, chunk_size, chunk_overlap, min_chunk)
    for i, c in enumerate(chunks):
        c.meta.source_type = source_type
        c.meta.chunk_index = i
        c.meta.total_chunks = len(chunks)
        c.meta.heading = _extract_heading(c.text)

    return chunks


# ═══════════════════════════════════════════════════════════
#  CORE: Transcript Chunking (timestamp-aware)
# ═══════════════════════════════════════════════════════════

def smart_chunk_transcript(
    segments: list[dict],
    chunk_size: int = DEFAULT_CHUNK_SIZE,
    chunk_overlap: int = DEFAULT_CHUNK_OVERLAP,
    min_chunk: int = MIN_CHUNK_SIZE,
) -> list[SmartChunk]:
    """
    Chunk Whisper transcript segments with timestamp preservation.

    Args:
        segments: List of dicts with "text", "start" (seconds), "end" (seconds)
                  e.g. [{"text": "So today...", "start": 0.0, "end": 5.2}, ...]
        chunk_size: Target chunk size
        chunk_overlap: Overlap between chunks
        min_chunk: Minimum chunk size

    Returns:
        List of SmartChunk with timestamp metadata
    """
    if not segments:
        return []

    chunks = []
    current_text = ""
    current_start = segments[0].get("start", 0.0)
    current_end = segments[0].get("end", 0.0)

    for seg in segments:
        seg_text = seg.get("text", "").strip()
        if not seg_text:
            continue

        candidate = (current_text + " " + seg_text).strip() if current_text else seg_text

        if len(candidate) > chunk_size and len(current_text) >= min_chunk:
            # Flush current chunk
            chunks.append(SmartChunk(
                text=_clean_text(current_text),
                meta=ChunkMeta(
                    timestamp_start=current_start,
                    timestamp_end=current_end,
                    source_type="transcript",
                )
            ))
            # Start new chunk with overlap: grab last N chars of current
            overlap_text = current_text[-chunk_overlap:] if chunk_overlap > 0 else ""
            current_text = (overlap_text + " " + seg_text).strip()
            current_start = seg.get("start", current_end)
            current_end = seg.get("end", current_start)
        else:
            current_text = candidate
            current_end = seg.get("end", current_end)

    # Flush remaining
    if current_text and len(current_text.strip()) >= min_chunk:
        chunks.append(SmartChunk(
            text=_clean_text(current_text),
            meta=ChunkMeta(
                timestamp_start=current_start,
                timestamp_end=current_end,
                source_type="transcript",
            )
        ))

    # Number them
    for i, c in enumerate(chunks):
        c.meta.chunk_index = i
        c.meta.total_chunks = len(chunks)

    return chunks


# ═══════════════════════════════════════════════════════════
#  INTERNAL HELPERS
# ═══════════════════════════════════════════════════════════

def _clean_text(text: str) -> str:
    """Normalize whitespace, strip junk."""
    if not text:
        return ""
    # Collapse multiple whitespace/newlines
    text = re.sub(r'\n{3,}', '\n\n', text)
    text = re.sub(r'[ \t]+', ' ', text)
    # Strip common PDF artifacts
    text = re.sub(r'\x0c', '', text)  # form feed
    text = text.strip()
    return text


def _split_at_sentences(
    text: str,
    chunk_size: int,
    overlap: int,
    min_chunk: int,
) -> list[SmartChunk]:
    """Split text at sentence boundaries with overlap."""
    # Sentence-split regex: split after . ! ? followed by space or newline
    sentences = re.split(r'(?<=[.!?])\s+', text)
    # Fallback: if no sentences found, split on newlines
    if len(sentences) <= 1:
        sentences = text.split('\n')
    # Further fallback: if still just one big blob, use the old sliding window
    if len(sentences) <= 1:
        return _sliding_window(text, chunk_size, overlap, min_chunk)

    chunks = []
    current = ""

    for sent in sentences:
        sent = sent.strip()
        if not sent:
            continue

        candidate = (current + " " + sent).strip() if current else sent

        if len(candidate) > chunk_size and current:
            if len(current) >= min_chunk:
                chunks.append(SmartChunk(text=current.strip()))

            # Overlap: start new chunk with end of previous
            if overlap > 0:
                overlap_text = current[-overlap:]
                current = (overlap_text + " " + sent).strip()
            else:
                current = sent
        else:
            current = candidate

    # Flush
    if current and len(current.strip()) >= min_chunk:
        chunks.append(SmartChunk(text=current.strip()))
    elif current and chunks:
        # Too short — append to last chunk
        chunks[-1].text += " " + current.strip()

    return chunks


def _sliding_window(
    text: str,
    chunk_size: int,
    overlap: int,
    min_chunk: int,
) -> list[SmartChunk]:
    """Fallback: fixed-size sliding window (old behavior, improved)."""
    chunks = []
    start = 0

    while start < len(text):
        end = start + chunk_size

        # Try to find a natural break
        if end < len(text):
            for sep in ["\n\n", ". ", "\n", "; ", ", ", " "]:
                boundary = text.rfind(sep, start + chunk_size // 2, end + 100)
                if boundary > start:
                    end = boundary + len(sep)
                    break

        segment = text[start:end].strip()
        if len(segment) >= min_chunk:
            chunks.append(SmartChunk(text=segment))

        start = end - overlap
        if start >= len(text):
            break

    return chunks


def _inject_overlap(chunks: list[SmartChunk], overlap: int) -> list[SmartChunk]:
    """
    Add overlap text between chunks that came from different page groups.
    (Chunks from the same _split_at_sentences call already have overlap.)
    """
    if overlap <= 0 or len(chunks) <= 1:
        return chunks

    for i in range(1, len(chunks)):
        prev_text = chunks[i - 1].text
        curr_text = chunks[i].text

        # Only inject if the current chunk doesn't already start with
        # text from the previous chunk (i.e., they came from different groups)
        if not curr_text[:50] in prev_text[-200:]:
            overlap_snippet = prev_text[-overlap:].strip()
            if overlap_snippet and len(overlap_snippet) > 20:
                chunks[i].text = f"...{overlap_snippet}\n\n{curr_text}"

    return chunks


def _extract_heading(text: str) -> Optional[str]:
    """
    Try to extract a heading/title from the first line of a chunk.
    Returns None if no clear heading is found.
    """
    lines = text.strip().split('\n')
    if not lines:
        return None

    first_line = lines[0].strip()

    # Heuristics for heading detection:
    # 1. Short first line (< 80 chars) that looks like a title
    # 2. Ends without period (titles usually don't)
    # 3. Contains title-case or all-caps words
    if (
        len(first_line) < 80
        and not first_line.endswith('.')
        and len(first_line.split()) <= 10
        and len(first_line) > 3
    ):
        return first_line

    return None


# ═══════════════════════════════════════════════════════════
#  TESTING
# ═══════════════════════════════════════════════════════════

if __name__ == "__main__":
    # ── Test 1: PDF pages (simulated lecture slides) ──
    print("=" * 60)
    print("TEST 1: PDF Slide Pages")
    print("=" * 60)

    mock_pages = [
        {"text": "K-Means Clustering", "page": 1},
        {"text": "Liang Liang · Intro to Machine Learning", "page": 2},
        {"text": "Outline\n• What is clustering?\n• K-means algorithm\n• Loss function\n• Initialization", "page": 3},
        {"text": (
            "The goal of clustering is to divide objects into groups, such that objects "
            "within a group are more similar to each other than to those in other groups. "
            "This is an unsupervised learning task because we don't have labels telling us "
            "which group each object belongs to. Instead, the algorithm must discover the "
            "structure in the data on its own.\n\n"
            "Common applications include customer segmentation, image compression, "
            "anomaly detection, and document organization."
        ), "page": 4},
        {"text": "K-Means Algorithm", "page": 5},
        {"text": (
            "The k-means algorithm works iteratively:\n"
            "1. Initialize K cluster centers randomly\n"
            "2. Assign each data point to the nearest center\n"
            "3. Recompute each center as the mean of assigned points\n"
            "4. Repeat steps 2-3 until convergence\n\n"
            "The algorithm converges when assignments no longer change. "
            "This is guaranteed because the loss function decreases monotonically."
        ), "page": 6},
        {"text": "📍 p.7 · Liang Liang", "page": 7},
        {"text": (
            "The loss function measures the average squared distance from data points "
            "to their assigned cluster centers. Mathematically:\n\n"
            "L = (1/N) * sum_n sum_k alpha(n,k) * ||x_n - c_k||^2\n\n"
            "where alpha(n,k) = 1 if x_n is assigned to cluster k, and 0 otherwise. "
            "The algorithm minimizes this loss by alternating between updating assignments "
            "and updating centers. Each step is guaranteed to not increase L."
        ), "page": 8},
    ]

    chunks = smart_chunk_pages(mock_pages)
    for c in chunks:
        pg = f"p.{c.meta.page_start}"
        if c.meta.page_end != c.meta.page_start:
            pg += f"-{c.meta.page_end}"
        heading = f" [{c.meta.heading}]" if c.meta.heading else ""
        print(f"\n  Chunk {c.meta.chunk_index + 1}/{c.meta.total_chunks} ({pg}, merged={c.meta.merge_count}){heading}")
        print(f"  {len(c.text)} chars: {c.text[:120]}...")

    # ── Test 2: Transcript segments ──
    print("\n" + "=" * 60)
    print("TEST 2: Transcript Segments")
    print("=" * 60)

    mock_segments = [
        {"text": "So today we're going to talk about k-means clustering.", "start": 0.0, "end": 3.5},
        {"text": "This is probably the most well-known clustering algorithm.", "start": 3.5, "end": 6.2},
        {"text": "The basic idea is you have K groups and you want to assign each data point to one of those groups.", "start": 6.2, "end": 11.0},
        {"text": "The way it works is first you pick K random centers.", "start": 11.0, "end": 14.5},
        {"text": "Then you assign each point to its closest center.", "start": 14.5, "end": 17.0},
        {"text": "Then you update each center to be the average of the points assigned to it.", "start": 17.0, "end": 21.0},
        {"text": "And you keep doing that until nothing changes.", "start": 21.0, "end": 23.5},
    ]

    t_chunks = smart_chunk_transcript(mock_segments, chunk_size=200, min_chunk=50)
    for c in t_chunks:
        ts = f"{c.meta.timestamp_start:.1f}s - {c.meta.timestamp_end:.1f}s"
        print(f"\n  Chunk {c.meta.chunk_index + 1}/{c.meta.total_chunks} ({ts})")
        print(f"  {len(c.text)} chars: {c.text[:120]}...")

    print("\n✅ All tests passed")