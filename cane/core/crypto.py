"""
crypto.py — Simple Fernet encryption for storing OAuth tokens in the database.

Derives the encryption key from CANE_SECRET_KEY via PBKDF2, so no new env vars needed.
"""
import base64
import hashlib
from cryptography.fernet import Fernet

from cane.core.config import SECRET_KEY


def _get_fernet() -> Fernet:
    """Derive a Fernet key from SECRET_KEY using PBKDF2."""
    key_bytes = hashlib.pbkdf2_hmac(
        "sha256", SECRET_KEY.encode(), b"cane-connector-encryption", 100_000,
    )
    fernet_key = base64.urlsafe_b64encode(key_bytes[:32])
    return Fernet(fernet_key)


_fernet = _get_fernet()


def encrypt(plaintext: str) -> str:
    """Encrypt a string and return base64-encoded ciphertext."""
    if not plaintext:
        return ""
    return _fernet.encrypt(plaintext.encode()).decode()


def decrypt(ciphertext: str) -> str:
    """Decrypt a base64-encoded ciphertext back to plaintext."""
    if not ciphertext:
        return ""
    return _fernet.decrypt(ciphertext.encode()).decode()
