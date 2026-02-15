"""
chunk_quality.py — Quality filtering for text chunks.

Extracted from the inline checks that used to live in ingestor._index_chunks.
Used by both ingestor.py (at ingest time) and app.py (at search time).

Two functions:
  is_quality_chunk(text) → bool   — gate: should this chunk be indexed/shown?
  chunk_quality_score(text) → float — 0.0–1.0 score stored in metadata for debugging
"""

import re

# ── Boilerplate patterns to reject ──
_SKIP_PATTERNS = [
    re.compile(r'^run\s+\w+\.(ipynb|py|sh)', re.IGNORECASE),
    re.compile(r'^watch\s+video', re.IGNORECASE),
    re.compile(r'^page\s*\d+\s*$', re.IGNORECASE),
    re.compile(r'^\d+\s*$'),
    re.compile(r'^https?://'),
    re.compile(r'^(lecture|chapter|section|slide)\s*\d+\s*$', re.IGNORECASE),
    re.compile(r'^\[source\]', re.IGNORECASE),
    re.compile(r'^(thank you|thanks for watching|see you next)', re.IGNORECASE),
    re.compile(r'^(music|applause|\[music\]|\[applause\])\s*$', re.IGNORECASE),
]

# ── Stopwords for substantive-word counting ──
_STOPWORDS = frozenset({
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
    'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from',
    'as', 'and', 'or', 'but', 'not', 'so', 'if', 'that', 'this',
    'it', 'its', 'i', 'we', 'you', 'he', 'she', 'they', 'them',
    'my', 'your', 'our', 'his', 'her', 'their', 'what', 'which',
    'who', 'when', 'where', 'how', 'do', 'does', 'did', 'have',
    'has', 'had', 'will', 'would', 'can', 'could', 'should',
    'may', 'might', 'shall', 'must', 'just', 'also', 'then',
    'than', 'very', 'too', 'here', 'there', 'now', 'about',
    'up', 'out', 'all', 'no', 'yes', 'ok', 'okay', 'um', 'uh',
    'like', 'know', 'right', 'going', 'gonna', 'get', 'got',
    'one', 'two', 'three', 'four', 'five',
})

# ── Thresholds ──
MIN_CHARS = 30
MIN_WORDS = 5
MIN_SUBSTANTIVE_WORDS = 3


def _count_substantive(text: str) -> int:
    """Count words that aren't stopwords, digits, or single chars."""
    return sum(
        1 for w in text.lower().split()
        if w not in _STOPWORDS and len(w) > 1 and not w.isdigit()
    )


def is_quality_chunk(text: str) -> bool:
    """
    Return True if this chunk is worth indexing/showing.

    Rejects:
      - Empty or very short text (< 30 chars)
      - Fewer than 5 words
      - Boilerplate patterns (page numbers, URLs, metadata lines)
      - Fewer than 3 substantive (non-stopword) words
    """
    if not text:
        return False

    text = text.strip()

    # Length gate
    if len(text) < MIN_CHARS:
        return False

    # Word count gate
    words = text.split()
    if len(words) < MIN_WORDS:
        return False

    # Boilerplate pattern gate
    for pattern in _SKIP_PATTERNS:
        if pattern.match(text):
            return False

    # Substantive word gate
    if _count_substantive(text) < MIN_SUBSTANTIVE_WORDS:
        return False

    return True


def chunk_quality_score(text: str) -> float:
    """
    Return a 0.0–1.0 quality score for a chunk.

    Scoring factors:
      - Length (longer = better, up to ~500 chars)
      - Substantive word density
      - Sentence structure (periods, commas indicate real prose)

    This score is stored in metadata for debugging and optional
    search-time filtering (e.g. boost high-quality chunks).
    """
    if not text or not text.strip():
        return 0.0

    text = text.strip()

    # Base: did it pass the quality gate?
    if not is_quality_chunk(text):
        return 0.0

    score = 0.0

    # ── Length score (0.0–0.35) ──
    char_len = len(text)
    if char_len >= 500:
        score += 0.35
    elif char_len >= 200:
        score += 0.25
    elif char_len >= 100:
        score += 0.15
    else:
        score += 0.05

    # ── Substantive word density (0.0–0.35) ──
    words = text.split()
    n_words = len(words)
    n_substantive = _count_substantive(text)
    density = n_substantive / n_words if n_words > 0 else 0
    score += min(0.35, density * 0.7)

    # ── Sentence structure (0.0–0.30) ──
    # Real content has periods, commas, and mixed case
    periods = text.count('.')
    commas = text.count(',')
    has_mixed_case = text != text.lower() and text != text.upper()

    struct_score = 0.0
    if periods >= 2:
        struct_score += 0.12
    elif periods >= 1:
        struct_score += 0.06
    if commas >= 2:
        struct_score += 0.08
    elif commas >= 1:
        struct_score += 0.04
    if has_mixed_case:
        struct_score += 0.10
    score += min(0.30, struct_score)

    return round(min(1.0, score), 3)