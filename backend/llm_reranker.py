"""
llm_reranker.py

Two-tier reranking for Cane search results:

Tier 1 - Cross-Encoder (fast, local, no API key needed):
    Uses a lightweight cross-encoder model to rescore query-chunk pairs.
    ~50ms for 20 chunks. Great for filtering out false positives from embedding search.

Tier 2 - LLM Reranker (optional, higher quality):
    Uses Claude API to deeply evaluate relevance + quality.
    ~2-3s for 10 chunks. Best for final presentation to user.

NOTE: app.py has its own inline cross-encoder implementation that's used in production.
      This module is a standalone alternative with the full pipeline (CE + LLM).

Usage:
    from llm_reranker import CrossEncoderReranker, LLMReranker

    # Fast local reranking
    reranker = CrossEncoderReranker()
    reranked = reranker.rerank(query, results, top_k=10)

    # Deep LLM reranking (needs ANTHROPIC_API_KEY)
    llm_reranker = LLMReranker(api_key="sk-ant-...")
    reranked = llm_reranker.rerank(query, results, top_k=5)

Install:
    pip install sentence-transformers anthropic
"""

import os
import json
import time
from typing import List, Dict, Optional
from dataclasses import dataclass


@dataclass
class RankedResult:
    """A search result with reranking metadata."""
    chunk_id: str
    original_rank: int
    original_score: float
    rerank_score: float
    final_score: float
    text: str
    metadata: dict
    quality_note: str = ""


# ============================================================
# TIER 1: Cross-Encoder Reranker (fast, local)
# ============================================================

class CrossEncoderReranker:
    """
    Uses a cross-encoder to rescore (query, chunk) pairs.

    Cross-encoders are much more accurate than bi-encoders (embedding similarity)
    because they see both query and document together. The tradeoff is speed,
    but for reranking 10-20 candidates it's very fast (~50ms).

    Model: cross-encoder/ms-marco-MiniLM-L-6-v2 (~80MB, runs on CPU fine)
    """

    def __init__(self, model_name: str = "cross-encoder/ms-marco-MiniLM-L-6-v2"):
        self.model_name = model_name
        self.model = None
        self._load_model()

    def _load_model(self):
        try:
            from sentence_transformers import CrossEncoder
            print(f"[Reranker] Loading cross-encoder: {self.model_name}")
            self.model = CrossEncoder(self.model_name)
            print(f"[Reranker] Ready")
        except ImportError:
            print("[Reranker] sentence-transformers not installed. Run: pip install sentence-transformers")
            self.model = None
        except Exception as e:
            print(f"[Reranker] Failed to load cross-encoder: {e}")
            self.model = None

    @property
    def is_available(self) -> bool:
        return self.model is not None

    def rerank(
        self,
        query: str,
        results: List[Dict],
        top_k: int = 10,
        text_key: str = "text",
        score_key: str = "score",
        blend_weight: float = 0.6,
    ) -> List[Dict]:
        """Rerank search results using cross-encoder scores."""
        if not self.is_available or not results:
            return results[:top_k]

        t0 = time.time()

        pairs = []
        for r in results:
            text = r.get(text_key, "")[:512]
            pairs.append([query, text])

        scores = self.model.predict(pairs)

        # Normalize to [0, 1]
        min_s = min(scores) if len(scores) > 0 else 0
        max_s = max(scores) if len(scores) > 0 else 1
        range_s = max_s - min_s if max_s != min_s else 1.0
        normalized = [(s - min_s) / range_s for s in scores]

        for i, r in enumerate(results):
            r["rerank_score"] = round(float(normalized[i]), 4)
            original = r.get(score_key, 0.0)
            r["final_score"] = round(
                blend_weight * normalized[i] + (1 - blend_weight) * original, 4
            )
            r["original_rank"] = i + 1

        reranked = sorted(results, key=lambda r: r["final_score"], reverse=True)

        elapsed = time.time() - t0
        print(f"[Reranker] Rescored {len(results)} chunks in {elapsed:.0f}ms")

        for i, r in enumerate(reranked[:top_k]):
            r["rank"] = i + 1

        return reranked[:top_k]


# ============================================================
# TIER 2: LLM Reranker (deep, API-based)
# ============================================================

class LLMReranker:
    """
    Uses Claude to deeply evaluate relevance and quality.

    Best for final top-5 presentation on complex/ambiguous queries.
    Requires: ANTHROPIC_API_KEY environment variable or passed directly.
    """

    def __init__(self, api_key: Optional[str] = None, model: str = "claude-sonnet-4-20250514"):
        self.api_key = api_key or os.environ.get("ANTHROPIC_API_KEY")
        self.model = model
        self.client = None

        if self.api_key:
            try:
                import anthropic
                self.client = anthropic.Anthropic(api_key=self.api_key)
                print(f"[LLM Reranker] Connected ({self.model})")
            except ImportError:
                print("[LLM Reranker] anthropic not installed. Run: pip install anthropic")
            except Exception as e:
                print(f"[LLM Reranker] Failed to connect: {e}")
        else:
            print("[LLM Reranker] No API key. Set ANTHROPIC_API_KEY to enable.")

    @property
    def is_available(self) -> bool:
        return self.client is not None

    def rerank(
        self,
        query: str,
        results: List[Dict],
        top_k: int = 5,
        text_key: str = "text",
        context: str = "",
    ) -> List[Dict]:
        """Rerank using Claude for deep relevance scoring."""
        if not self.is_available or not results:
            return results[:top_k]

        t0 = time.time()

        # Build prompt
        chunks_text = ""
        for i, r in enumerate(results):
            text = r.get(text_key, "")[:300]
            chunks_text += f"\n[Chunk {i}]: {text}\n"

        system = "You are a search relevance judge. Score each chunk's relevance to the query on a scale of 0-10."
        prompt = f"""Query: "{query}"
{f'Context: {context}' if context else ''}

Chunks to evaluate:
{chunks_text}

Return ONLY a JSON array, one object per chunk:
[{{"chunk_index": 0, "relevance": 8, "quality_note": "directly answers the query"}}]

Score meaning: 0=irrelevant, 5=tangential, 8=relevant, 10=perfect answer."""

        try:
            response = self.client.messages.create(
                model=self.model,
                max_tokens=1000,
                system=system,
                messages=[{"role": "user", "content": prompt}],
            )

            response_text = response.content[0].text.strip()
            # Strip markdown fences if present
            if response_text.startswith("```"):
                response_text = response_text.split("\n", 1)[1]
                if response_text.endswith("```"):
                    response_text = response_text[:-3]

            scores = json.loads(response_text)
            score_map = {s["chunk_index"]: s for s in scores}

            for i, r in enumerate(results):
                if i in score_map:
                    llm_score = score_map[i]["relevance"] / 10.0
                    r["llm_relevance"] = round(llm_score, 3)
                    r["quality_note"] = score_map[i].get("quality_note", "")

                    original = r.get("score", 0.5)
                    rerank = r.get("rerank_score", original)
                    r["final_score"] = round(
                        0.50 * llm_score + 0.30 * original + 0.20 * rerank, 4
                    )
                else:
                    r["llm_relevance"] = r.get("score", 0.5)
                    r["final_score"] = r.get("score", 0.5)

                r["original_rank"] = i + 1

            reranked = sorted(results, key=lambda r: r["final_score"], reverse=True)
            reranked = [r for r in reranked if r.get("llm_relevance", 0.5) > 0.1]

            elapsed = time.time() - t0
            print(f"[LLM Reranker] Scored {len(results)} chunks in {elapsed:.1f}s")

            for i, r in enumerate(reranked[:top_k]):
                r["rank"] = i + 1

            return reranked[:top_k]

        except json.JSONDecodeError as e:
            print(f"[LLM Reranker] Failed to parse response: {e}")
            return results[:top_k]
        except Exception as e:
            print(f"[LLM Reranker] API error: {e}")
            return results[:top_k]


# ============================================================
# Combined Pipeline
# ============================================================

class RerankerPipeline:
    """
    Combines quality filtering + cross-encoder + optional LLM reranking.

    Pipeline:
    1. Filter junk chunks (chunk_quality)
    2. Cross-encoder rescore top candidates
    3. (Optional) LLM deep-score top results
    """

    def __init__(
        self,
        use_cross_encoder: bool = True,
        use_llm: bool = False,
        anthropic_api_key: Optional[str] = None,
        cross_encoder_model: str = "cross-encoder/ms-marco-MiniLM-L-6-v2",
        llm_model: str = "claude-sonnet-4-20250514",
    ):
        from chunk_quality import is_quality_chunk, chunk_quality_score
        self.is_quality_chunk = is_quality_chunk
        self.chunk_quality_score = chunk_quality_score

        self.cross_encoder = None
        self.llm_reranker = None

        if use_cross_encoder:
            self.cross_encoder = CrossEncoderReranker(cross_encoder_model)
            if not self.cross_encoder.is_available:
                self.cross_encoder = None

        if use_llm:
            self.llm_reranker = LLMReranker(api_key=anthropic_api_key, model=llm_model)
            if not self.llm_reranker.is_available:
                self.llm_reranker = None

        active = []
        if self.cross_encoder:
            active.append("cross-encoder")
        if self.llm_reranker:
            active.append("llm")
        print(f"[RerankerPipeline] Active: quality_filter + {' + '.join(active) if active else 'none'}")

    def process(
        self,
        query: str,
        results: List[Dict],
        top_k: int = 10,
        text_key: str = "text",
        score_key: str = "score",
        class_context: str = "",
    ) -> List[Dict]:
        """Full reranking pipeline."""
        if not results:
            return []

        t0 = time.time()
        initial_count = len(results)

        # Step 1: Quality filter
        filtered = []
        for r in results:
            text = r.get(text_key, "")
            q_score = self.chunk_quality_score(text)
            r["quality_score"] = round(q_score, 3)
            if self.is_quality_chunk(text):
                filtered.append(r)

        removed = initial_count - len(filtered)
        if removed > 0:
            print(f"[Pipeline] Quality filter removed {removed}/{initial_count} chunks")

        # Step 2: Cross-encoder reranking
        if self.cross_encoder and self.cross_encoder.is_available:
            filtered = self.cross_encoder.rerank(
                query, filtered,
                top_k=min(top_k * 2, len(filtered)),
                text_key=text_key,
                score_key=score_key,
            )

        # Step 3: LLM reranking (on top candidates only)
        if self.llm_reranker and self.llm_reranker.is_available:
            llm_candidates = filtered[:min(top_k + 5, len(filtered))]
            filtered = self.llm_reranker.rerank(
                query, llm_candidates,
                top_k=top_k,
                text_key=text_key,
                context=class_context,
            )

        elapsed = time.time() - t0
        print(f"[Pipeline] {initial_count} -> {len(filtered[:top_k])} results in {elapsed:.1f}s")

        return filtered[:top_k]