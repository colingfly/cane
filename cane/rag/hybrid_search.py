"""
hybrid_search.py — BM25 keyword search + Reciprocal Rank Fusion.

Vector search is great for semantic similarity but misses exact terms
like "VoltAIc" or "COOLERCHIPS". BM25 finds these instantly.

This module:
1. Maintains an in-memory BM25 index per tenant/workspace
2. Provides keyword search that complements vector search
3. Merges results using Reciprocal Rank Fusion (RRF)

The index rebuilds lazily from ChromaDB on first query per scope.
"""

import math
import re
from collections import defaultdict
from typing import Optional

# ── Tokenizer ──

_STOP_WORDS = {
    "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "is", "was", "are", "were", "be", "been",
    "being", "have", "has", "had", "do", "does", "did", "will", "would",
    "could", "should", "may", "might", "shall", "can", "this", "that",
    "these", "those", "it", "its", "not", "no", "as", "if", "so", "than",
    "into", "about", "up", "out", "what", "which", "who", "whom", "how",
    "when", "where", "why", "all", "each", "every", "both", "few", "more",
    "most", "other", "some", "such", "only", "same", "also", "just", "very",
}


def _tokenize(text: str) -> list[str]:
    """Simple whitespace + punctuation tokenizer with stop word removal."""
    text = text.lower()
    tokens = re.findall(r'[a-z0-9]+(?:[-_][a-z0-9]+)*', text)
    return [t for t in tokens if t not in _STOP_WORDS and len(t) > 1]


# ── BM25 Index ──

class BM25Index:
    """
    In-memory BM25 (Okapi BM25) index.
    Optimized for small-to-medium corpora (< 10k docs).
    """

    def __init__(self, k1: float = 1.5, b: float = 0.75):
        self.k1 = k1
        self.b = b
        self.docs = []           # list of {id, text, meta}
        self.doc_tokens = []     # list of token lists
        self.doc_lengths = []    # list of doc lengths
        self.avg_dl = 0.0
        self.df = defaultdict(int)   # document frequency per term
        self.N = 0

    def add_documents(self, docs: list[dict]):
        """
        Add documents to the index.
        Each doc: {id: str, text: str, meta: dict}
        """
        for doc in docs:
            tokens = _tokenize(doc.get("text", ""))
            self.docs.append(doc)
            self.doc_tokens.append(tokens)
            self.doc_lengths.append(len(tokens))

            # Update document frequency
            seen = set()
            for t in tokens:
                if t not in seen:
                    self.df[t] += 1
                    seen.add(t)

        self.N = len(self.docs)
        self.avg_dl = sum(self.doc_lengths) / self.N if self.N > 0 else 0

    def search(self, query: str, n: int = 10) -> list[dict]:
        """
        Search the index. Returns list of {doc, score} sorted by score desc.
        """
        if self.N == 0:
            return []

        query_tokens = _tokenize(query)
        if not query_tokens:
            return []

        scores = []
        for idx in range(self.N):
            score = self._score_doc(idx, query_tokens)
            if score > 0:
                scores.append((idx, score))

        scores.sort(key=lambda x: x[1], reverse=True)

        results = []
        for idx, score in scores[:n]:
            doc = self.docs[idx]
            results.append({
                **doc,
                "bm25_score": round(score, 4),
            })

        return results

    def _score_doc(self, doc_idx: int, query_tokens: list[str]) -> float:
        """Compute BM25 score for a single document."""
        doc_tokens = self.doc_tokens[doc_idx]
        dl = self.doc_lengths[doc_idx]

        # Term frequencies in this doc
        tf = defaultdict(int)
        for t in doc_tokens:
            tf[t] += 1

        score = 0.0
        for qt in query_tokens:
            if qt not in tf:
                continue

            # IDF with smoothing
            n_qt = self.df.get(qt, 0)
            idf = math.log((self.N - n_qt + 0.5) / (n_qt + 0.5) + 1.0)

            # TF normalization
            freq = tf[qt]
            tf_norm = (freq * (self.k1 + 1)) / (freq + self.k1 * (1 - self.b + self.b * dl / self.avg_dl))

            score += idf * tf_norm

        return score


# ── Index Cache ──

_index_cache: dict[str, BM25Index] = {}


def _cache_key(tenant_id: str, workspace_id: str = "") -> str:
    return f"{tenant_id}:{workspace_id}"


def invalidate_index(tenant_id: str, workspace_id: str = ""):
    """Call after document upload/delete to force rebuild."""
    key = _cache_key(tenant_id, workspace_id)
    _index_cache.pop(key, None)
    # Also invalidate the tenant-wide index
    _index_cache.pop(f"{tenant_id}:", None)


def _build_index(tenant_id: str, workspace_id: str = "") -> BM25Index:
    """Build BM25 index from ChromaDB chunks for a given scope."""
    from app import text_col, _build_tenant_where

    where = _build_tenant_where(tenant_id, workspace_id)
    try:
        result = text_col.get(where=where, include=["documents", "metadatas"])
    except Exception:
        return BM25Index()

    docs = result.get("documents", [])
    metas = result.get("metadatas", [])
    ids = result.get("ids", [])

    index = BM25Index()
    bm25_docs = []
    for doc_id, doc, meta in zip(ids, docs, metas):
        meta = meta or {}
        display = meta.get("display_text", doc) or doc
        if not display or len(display.strip()) < 20:
            continue
        bm25_docs.append({
            "id": doc_id,
            "text": display,
            "source_file": meta.get("source_file", ""),
            "source_type": meta.get("source_type", ""),
            "workspace_id": meta.get("workspace_id", ""),
            "document_id": meta.get("document_id", ""),
            "page": meta.get("page", 0),
            "start_sec": meta.get("start_sec", 0),
            "end_sec": meta.get("end_sec", 0),
            "location": meta.get("location", ""),
        })

    index.add_documents(bm25_docs)
    print(f"  [BM25] Built index: {len(bm25_docs)} docs for tenant={tenant_id[:8]} workspace={workspace_id[:8] if workspace_id else 'all'}")
    return index


def get_index(tenant_id: str, workspace_id: str = "") -> BM25Index:
    """Get or build BM25 index for scope."""
    key = _cache_key(tenant_id, workspace_id)
    if key not in _index_cache:
        _index_cache[key] = _build_index(tenant_id, workspace_id)
    return _index_cache[key]


# ── Keyword Search ──

def keyword_search(query: str, n: int, tenant_id: str, workspace_id: str = "") -> list[dict]:
    """
    BM25 keyword search. Returns results in same format as _search_text.
    """
    index = get_index(tenant_id, workspace_id)
    hits = index.search(query, n=n * 2)  # fetch extra for filtering

    results = []
    for rank, hit in enumerate(hits[:n], 1):
        results.append({
            "rank": rank,
            "text": hit.get("text", "")[:500],
            "score": min(1.0, hit["bm25_score"] / 10.0),  # normalize to 0-1 range
            "source_file": hit.get("source_file", ""),
            "source_type": hit.get("source_type", ""),
            "workspace_id": hit.get("workspace_id", ""),
            "document_id": hit.get("document_id", ""),
            "location": hit.get("location", ""),
            "page": hit.get("page", 0),
            "start_sec": hit.get("start_sec", 0),
            "end_sec": hit.get("end_sec", 0),
        })

    return results


# ── Reciprocal Rank Fusion ──

def hybrid_merge(vector_results: list[dict], keyword_results: list[dict], k: int = 60) -> list[dict]:
    """
    Merge vector and keyword results using Reciprocal Rank Fusion (RRF).

    RRF score = sum(1 / (k + rank)) across all result lists.
    k=60 is the standard default from the original paper.

    Returns merged, deduplicated results sorted by RRF score.
    """
    scores = defaultdict(float)
    docs = {}

    # Score from vector results
    for r in vector_results:
        key = _result_key(r)
        scores[key] += 1.0 / (k + r.get("rank", 999))
        if key not in docs:
            docs[key] = r

    # Score from keyword results
    for r in keyword_results:
        key = _result_key(r)
        scores[key] += 1.0 / (k + r.get("rank", 999))
        if key not in docs:
            docs[key] = r

    # Sort by RRF score
    ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)

    merged = []
    for i, (key, rrf_score) in enumerate(ranked):
        doc = docs[key]
        doc["rank"] = i + 1
        doc["rrf_score"] = round(rrf_score, 6)
        merged.append(doc)

    return merged


def _result_key(r: dict) -> str:
    """Unique key for deduplication. Uses text prefix + source."""
    text = r.get("text", "")[:100]
    src = r.get("source_file", "")
    page = r.get("page", 0)
    return f"{src}:{page}:{text[:60]}"
