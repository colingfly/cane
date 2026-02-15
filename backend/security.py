"""
security.py — Security middleware and utilities for Cane.

Covers:
  - Login rate limiting (brute force protection)
  - File upload validation (magic bytes, not just extensions)
  - Input sanitization (query length, etc.)
  - Security headers middleware
  - Password strength validation
"""
import time
import struct
from pathlib import Path
from collections import defaultdict
from typing import Optional

from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response


# ═══════════════════════════════════════════════════════════
#  RATE LIMITER — in-memory, per-IP
# ═══════════════════════════════════════════════════════════

class RateLimiter:
    """
    Simple in-memory rate limiter.
    Tracks attempts per key (IP) within a sliding window.
    """

    def __init__(self, max_attempts: int = 5, window_seconds: int = 300, lockout_seconds: int = 900):
        self.max_attempts = max_attempts       # max failures before lockout
        self.window_seconds = window_seconds   # window to count failures (5 min)
        self.lockout_seconds = lockout_seconds # lockout duration (15 min)
        self._attempts: dict[str, list[float]] = defaultdict(list)
        self._lockouts: dict[str, float] = {}

    def is_locked(self, key: str) -> bool:
        """Check if a key is currently locked out."""
        if key in self._lockouts:
            if time.time() < self._lockouts[key]:
                return True
            else:
                del self._lockouts[key]
                self._attempts.pop(key, None)
        return False

    def record_failure(self, key: str):
        """Record a failed attempt. Locks out if threshold exceeded."""
        now = time.time()
        # Prune old attempts outside the window
        self._attempts[key] = [t for t in self._attempts[key] if now - t < self.window_seconds]
        self._attempts[key].append(now)

        if len(self._attempts[key]) >= self.max_attempts:
            self._lockouts[key] = now + self.lockout_seconds

    def record_success(self, key: str):
        """Clear attempts on successful login."""
        self._attempts.pop(key, None)
        self._lockouts.pop(key, None)

    def remaining_lockout(self, key: str) -> int:
        """Seconds remaining in lockout, 0 if not locked."""
        if key in self._lockouts:
            remaining = self._lockouts[key] - time.time()
            return max(0, int(remaining))
        return 0


# Global rate limiter instance
login_limiter = RateLimiter(max_attempts=5, window_seconds=300, lockout_seconds=900)


# ═══════════════════════════════════════════════════════════
#  PASSWORD VALIDATION
# ═══════════════════════════════════════════════════════════

def validate_password(password: str) -> Optional[str]:
    """
    Validate password strength. Returns error message or None if valid.
    """
    if len(password) < 8:
        return "Password must be at least 8 characters"
    if len(password) > 128:
        return "Password must be less than 128 characters"
    if password.isdigit():
        return "Password cannot be all numbers"
    if password.isalpha():
        return "Password must contain at least one number or special character"
    return None


# ═══════════════════════════════════════════════════════════
#  FILE VALIDATION — magic bytes check
# ═══════════════════════════════════════════════════════════

# Map of file types to their magic byte signatures
MAGIC_BYTES = {
    "pdf": [b"%PDF"],
    "docx": [b"PK\x03\x04"],      # ZIP-based (OOXML)
    "xlsx": [b"PK\x03\x04"],      # ZIP-based (OOXML)
    "csv": None,                    # Plain text, no magic bytes
    "image": [
        b"\xff\xd8\xff",           # JPEG
        b"\x89PNG\r\n\x1a\n",     # PNG
        b"GIF87a", b"GIF89a",     # GIF
        b"BM",                     # BMP
        b"II\x2a\x00", b"MM\x00\x2a",  # TIFF
        b"RIFF",                   # WEBP (RIFF container)
    ],
    "audio": [
        b"ID3",                    # MP3 with ID3 tag
        b"\xff\xfb", b"\xff\xf3", b"\xff\xf2",  # MP3 frames
        b"RIFF",                   # WAV
        b"fLaC",                   # FLAC
        b"OggS",                   # OGG
    ],
    "video": [
        b"\x00\x00\x00",          # MP4/MOV (ftyp box, varies)
        b"\x1a\x45\xdf\xa3",     # MKV/WEBM (EBML)
        b"RIFF",                   # AVI
    ],
}

# Maximum file size: 50MB
MAX_FILE_SIZE = 50 * 1024 * 1024


def validate_file_content(content: bytes, claimed_type: str) -> Optional[str]:
    """
    Validate file content matches claimed type using magic bytes.
    Returns error message or None if valid.
    """
    if len(content) == 0:
        return "File is empty"

    if len(content) > MAX_FILE_SIZE:
        mb = MAX_FILE_SIZE // (1024 * 1024)
        return f"File exceeds maximum size of {mb}MB"

    signatures = MAGIC_BYTES.get(claimed_type)
    if signatures is None:
        # No magic bytes to check (CSV, etc.) — allow
        return None

    # Check if file starts with any valid signature
    header = content[:16]
    for sig in signatures:
        if header[:len(sig)] == sig:
            return None

    return f"File content does not match expected type '{claimed_type}'"


# ═══════════════════════════════════════════════════════════
#  INPUT SANITIZATION
# ═══════════════════════════════════════════════════════════

MAX_QUERY_LENGTH = 1000
MAX_FORM_FIELD_LENGTH = 500


def sanitize_query(query: str) -> str:
    """Sanitize and limit search query length."""
    if not query:
        return ""
    # Strip, limit length
    query = query.strip()[:MAX_QUERY_LENGTH]
    # Remove null bytes
    query = query.replace("\x00", "")
    return query


def sanitize_form_field(value: str, max_length: int = MAX_FORM_FIELD_LENGTH) -> str:
    """Sanitize a form field value."""
    if not value:
        return ""
    value = value.strip()[:max_length]
    value = value.replace("\x00", "")
    return value


def validate_email(email: str) -> Optional[str]:
    """Basic email validation. Returns error or None."""
    import re
    email = email.strip().lower()
    if not email:
        return "Email is required"
    if len(email) > 255:
        return "Email too long"
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    if not re.match(pattern, email):
        return "Invalid email format"
    return None


def validate_slug(slug: str) -> Optional[str]:
    """Validate tenant slug. Returns error or None."""
    import re
    if not slug:
        return "Slug is required"
    if len(slug) > 100:
        return "Slug too long"
    if not re.match(r'^[a-z0-9][a-z0-9-]*[a-z0-9]$', slug) and len(slug) > 1:
        return "Slug must be lowercase letters, numbers, and hyphens"
    return None


# ═══════════════════════════════════════════════════════════
#  SECURITY HEADERS MIDDLEWARE
# ═══════════════════════════════════════════════════════════

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to all responses."""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

        # Prevent MIME type sniffing
        response.headers["X-Content-Type-Options"] = "nosniff"

        # Prevent clickjacking
        response.headers["X-Frame-Options"] = "DENY"

        # XSS protection (legacy browsers)
        response.headers["X-XSS-Protection"] = "1; mode=block"

        # Referrer policy
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        # Permissions policy — disable unnecessary browser features
        response.headers["Permissions-Policy"] = (
            "camera=(), microphone=(), geolocation=(), "
            "payment=(), usb=(), magnetometer=()"
        )

        # HSTS — only set in production (when not localhost)
        host = request.headers.get("host", "")
        if "localhost" not in host and "127.0.0.1" not in host:
            response.headers["Strict-Transport-Security"] = (
                "max-age=31536000; includeSubDomains"
            )

        return response


# ═══════════════════════════════════════════════════════════
#  REQUEST ID MIDDLEWARE (for audit trails)
# ═══════════════════════════════════════════════════════════

import uuid

class RequestIDMiddleware(BaseHTTPMiddleware):
    """Attach a unique request ID to each request for tracing."""

    async def dispatch(self, request: Request, call_next):
        request_id = str(uuid.uuid4())[:8]
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response
