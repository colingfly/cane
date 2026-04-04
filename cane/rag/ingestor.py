"""
ingestor.py — Indexes ExtractionResults into ChromaDB.

Cane multi-tenant version:
  - Every chunk gets tenant_id, workspace_id, document_id in metadata
  - Enrichment headers use company/workspace context instead of class/professor
  - Quality filter catches junk before it hits the DB
"""
import json
import re as _re
from pathlib import Path
from typing import Optional

import chromadb
from chromadb.utils import embedding_functions

from cane.core.config import (
    DB_PATH, EXTRACTED_DIR,
    TEXT_COLLECTION, IMAGE_COLLECTION,
    TEXT_EMBED_MODEL, CLIP_MODEL,
    ensure_dirs,
)
from cane.rag.extraction_models import ExtractionResult
from cane.rag.extractors import extract
from cane.rag.enricher import enrich_chunks, FileMeta, EnrichedChunk
from cane.rag.quality import is_quality_chunk, chunk_quality_score


class Ingestor:
    """Indexes extracted content into ChromaDB with tenant scoping."""

    def __init__(self):
        ensure_dirs()
        self._client = chromadb.PersistentClient(path=DB_PATH)

        ef = embedding_functions.SentenceTransformerEmbeddingFunction(
            model_name=TEXT_EMBED_MODEL
        )
        self._text_col = self._client.get_or_create_collection(
            TEXT_COLLECTION, embedding_function=ef
        )

        self._image_col = None
        self._clip_model = None
        self._clip_processor = None
        self._device = None

    # ── Public API ──

    def ingest(
        self,
        filepath: str,
        tenant_id: str = "",
        workspace_id: str = "",
        document_id: str = "",
        company_name: str = "",
        workspace_name: str = "",
        force: bool = False,
    ) -> ExtractionResult:
        """Extract + index a single file with tenant scoping."""
        fname = Path(filepath).name
        print(f"\n[Ingest] Processing: {fname}")

        result = extract(filepath, str(EXTRACTED_DIR))

        if not result.ok:
            print(f"  [ERROR] {result.error}")
            return result

        # Index
        if result.chunks:
            self._index_chunks(
                result,
                tenant_id=tenant_id,
                workspace_id=workspace_id,
                document_id=document_id,
                company_name=company_name,
                workspace_name=workspace_name,
                images=result.images,  # Pass images for OCR text merging
            )
        if result.images:
            self._index_images(
                result,
                tenant_id=tenant_id,
                workspace_id=workspace_id,
                document_id=document_id,
            )

        return result

    @property
    def text_count(self) -> int:
        return self._text_col.count()

    @property
    def image_count(self) -> int:
        if self._image_col is None:
            try:
                self._image_col = self._client.get_collection(IMAGE_COLLECTION)
            except Exception:
                return 0
        return self._image_col.count()

    # ── Text indexing ──

    TRANSCRIPT_FIXES = {
        "outcall chain": "alkyl chain",
        "outcall chains": "alkyl chains",
        "outcall": "alkyl",
        "outcains": "alkanes",
        "alcohol halibut": "alkyl halides",
        "alcohol halide": "alkyl halide",
        "alcohol halides": "alkyl halides",
        "new clear file": "nucleophile",
        "new clear files": "nucleophiles",
        "electro file": "electrophile",
        "electro files": "electrophiles",
        "carbock sealic": "carboxylic",
    }

    def _clean_transcript(self, text: str) -> str:
        if not text:
            return text
        result = text
        for bad, good in self.TRANSCRIPT_FIXES.items():
            pattern = _re.compile(_re.escape(bad), _re.IGNORECASE)
            result = pattern.sub(good, result)
        return result

    def _index_chunks(
        self,
        result: ExtractionResult,
        tenant_id: str,
        workspace_id: str,
        document_id: str,
        company_name: str,
        workspace_name: str,
        images: list = None,
    ):
        """Index text chunks with tenant scoping and contextual enrichment."""

        # Clean transcript errors
        for chunk in result.chunks:
            if chunk.text:
                chunk.text = self._clean_transcript(chunk.text)

        # Merge OCR text from keyframes into nearby Whisper transcript chunks
        # This gives Whisper chunks the correct slide terminology for display
        if images:
            ocr_frames = [(img.timestamp_sec, img.caption) for img in images
                          if img.caption and len(img.caption.strip()) > 20]
            if ocr_frames:
                merged_count = 0
                for chunk in result.chunks:
                    # Skip OCR-created chunks (location ends with "[slide]")
                    if chunk.location and chunk.location.endswith("[slide]"):
                        continue
                    s = chunk.start_sec or 0
                    e = chunk.end_sec or 0
                    if s <= 0 and e <= 0:
                        continue
                    # Find keyframes within this chunk's time window
                    nearby_ocr = []
                    for ts, caption in ocr_frames:
                        if s - 5 <= ts <= e + 5:
                            nearby_ocr.append(caption)
                    if nearby_ocr:
                        # Store OCR text in metadata for later use as display_text boost
                        chunk.metadata["ocr_slide_text"] = "\n\n".join(nearby_ocr)
                        merged_count += 1
                if merged_count:
                    print(f"  [OCR] Merged slide text into {merged_count} transcript chunks")

        # Quality filter
        quality_chunks = [c for c in result.chunks if c.text and is_quality_chunk(c.text.strip())]

        if not quality_chunks:
            print(f"  [Index] 0 chunks passed quality filter")
            return

        filtered_count = len(result.chunks) - len(quality_chunks)
        if filtered_count > 0:
            print(f"  [Filter] {filtered_count} junk chunks removed, {len(quality_chunks)} kept")

        # Build enrichment metadata — company/workspace instead of class/professor
        file_meta = FileMeta(
            class_name=company_name,       # reused field → company name in header
            professor="",
            lecture_label=workspace_name,   # reused field → workspace name in header
            filename=result.source_file or "",
            file_type=result.source_type or "",
        )

        chunk_dicts = []
        for chunk in quality_chunks:
            chunk_dicts.append({
                "text": chunk.text,
                "chunk_id": chunk.chunk_id,
                "page": chunk.page or 0,
                "page_start": chunk.page or 0,
                "page_end": chunk.page or 0,
                "timestamp_start": chunk.start_sec if chunk.start_sec else None,
                "timestamp_end": chunk.end_sec if chunk.end_sec else None,
                "source_type": chunk.source_type or "",
            })

        enriched = enrich_chunks(chunk_dicts, file_meta)

        # Build ChromaDB arrays
        ids, docs, metas = [], [], []

        for ec, chunk in zip(enriched, quality_chunks):
            ids.append(ec.chunk_id or chunk.chunk_id)
            docs.append(ec.enriched_text)

            metas.append({
                # Tenant scoping — critical for multi-tenancy
                "tenant_id": tenant_id,
                "workspace_id": workspace_id,
                "document_id": document_id,
                # Original metadata
                "source_file": chunk.source_file,
                "source_type": chunk.source_type,
                "chunk_index": chunk.chunk_index,
                "page": chunk.page or 0,
                "start_sec": chunk.start_sec,
                "end_sec": chunk.end_sec,
                "location": chunk.location,
                # Display + quality
                "display_text": ec.display_text,
                "quality_score": chunk_quality_score(ec.display_text),
                # OCR slide text (from keyframe OCR, if available)
                "ocr_slide_text": chunk.metadata.get("ocr_slide_text", ""),
            })

        # Batch upsert
        batch = 5000
        for i in range(0, len(ids), batch):
            self._text_col.upsert(
                ids=ids[i:i+batch],
                documents=docs[i:i+batch],
                metadatas=metas[i:i+batch],
            )
        print(f"  [Index] {len(ids)} enriched chunks → ChromaDB (tenant={tenant_id[:8]}...)")

    # ── Image indexing ──

    def _index_images(self, result: ExtractionResult, tenant_id: str, workspace_id: str, document_id: str):
        self._ensure_clip()

        import torch
        from PIL import Image as PILImage

        col = self._image_col
        ids, embeddings, metas = [], [], []

        for img in result.images:
            try:
                pil = PILImage.open(img.path).convert("RGB")
                inputs = self._clip_processor(images=pil, return_tensors="pt")
                pixel_values = inputs["pixel_values"].to(self._device)
                with torch.no_grad():
                    vision_out = self._clip_model.vision_model(pixel_values=pixel_values)
                    emb = self._clip_model.visual_projection(vision_out.pooler_output)
                    emb = emb / emb.norm(dim=-1, keepdim=True)

                ids.append(img.image_id)
                embeddings.append(emb[0].cpu().tolist())
                metas.append({
                    "tenant_id": tenant_id,
                    "workspace_id": workspace_id,
                    "document_id": document_id,
                    "source_file": img.source_file,
                    "source_type": img.source_type,
                    "frame_path": img.path,
                    "page": img.page or 0,
                    "timestamp_sec": img.timestamp_sec,
                    "width": img.width or 0,
                    "height": img.height or 0,
                })
            except Exception as e:
                print(f"  [CLIP] Failed on {img.path}: {e}")
                continue

        if ids:
            batch = 5000
            for i in range(0, len(ids), batch):
                col.upsert(
                    ids=ids[i:i+batch],
                    embeddings=embeddings[i:i+batch],
                    metadatas=metas[i:i+batch],
                )
            print(f"  [Index] {len(ids)} images → CLIP index")

        # Free CLIP from memory after indexing to save RAM
        self._unload_clip()

    def _ensure_clip(self):
        if self._clip_model is not None:
            return

        import torch
        from transformers import CLIPModel, CLIPProcessor

        self._device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"  [CLIP] Loading {CLIP_MODEL} on {self._device}...")
        self._clip_model = CLIPModel.from_pretrained(CLIP_MODEL).to(self._device)
        self._clip_processor = CLIPProcessor.from_pretrained(CLIP_MODEL)

        self._image_col = self._client.get_or_create_collection(
            IMAGE_COLLECTION,
            metadata={"hnsw:space": "cosine"},
        )

    def _unload_clip(self):
        """Free CLIP model from memory after indexing to save ~600MB RAM."""
        import gc
        if self._clip_model is not None:
            del self._clip_model
            del self._clip_processor
            self._clip_model = None
            self._clip_processor = None
            self._device = None
            gc.collect()
            try:
                import torch
                torch.cuda.empty_cache()
            except Exception:
                pass
            print("  [CLIP] Model unloaded to free memory")