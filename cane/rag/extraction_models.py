"""
models.py -- Data models for the extraction pipeline.
"""
from dataclasses import dataclass, field
from typing import List, Optional, Dict
from pathlib import Path
import re


@dataclass
class Chunk:
    """A text chunk ready for embedding."""
    text: str
    source_file: str
    source_type: str          # pdf, docx, xlsx, audio, video, image
    class_name: str = ""      # e.g. "CS50", "Organic Chemistry I"
    professor: str = ""       # e.g. "David Malan"
    lecture: str = ""         # e.g. "Lecture 1 - Scratch"
    chunk_index: int = 0
    page: Optional[int] = None
    start_sec: float = 0.0
    end_sec: float = 0.0
    location: str = ""        # human-readable location
    metadata: Dict = field(default_factory=dict)

    @property
    def chunk_id(self) -> str:
        slug = make_slug(self.source_file)
        return f"{slug}_chunk_{self.chunk_index:04d}"


@dataclass
class Image:
    """An extracted image ready for CLIP embedding."""
    path: str
    source_file: str
    source_type: str
    class_name: str = ""
    professor: str = ""
    lecture: str = ""
    page: Optional[int] = None
    timestamp_sec: float = 0.0
    width: Optional[int] = None
    height: Optional[int] = None
    caption: str = ""

    @property
    def image_id(self) -> str:
        return Path(self.path).stem


@dataclass
class ExtractionResult:
    """Output of any extractor."""
    source_file: str
    source_type: str
    chunks: List[Chunk] = field(default_factory=list)
    images: List[Image] = field(default_factory=list)
    error: Optional[str] = None
    class_name: str = ""
    professor: str = ""
    lecture: str = ""

    @property
    def ok(self) -> bool:
        return self.error is None

    def summary(self) -> str:
        return f"[{self.source_type.upper()}] {self.source_file}: {len(self.chunks)} chunks, {len(self.images)} images"


def make_slug(filename: str) -> str:
    """Convert filename to a safe identifier."""
    name = Path(filename).stem
    slug = re.sub(r"[^a-zA-Z0-9]+", "_", name).strip("_").lower()
    return slug[:80]