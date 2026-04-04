"""
auth.py — Authentication utilities for Cane.

Handles:
  - Password hashing (bcrypt via passlib)
  - JWT token creation / verification
  - FastAPI dependencies for extracting current user + tenant
"""
from datetime import datetime, timedelta
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from cane.core.config import SECRET_KEY, JWT_ALGORITHM, JWT_EXPIRE_HOURS
from cane.core.database import get_db
from cane.core.models import User, Tenant, ApiKey

# -- Password hashing --
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# -- Bearer token scheme --
bearer_scheme = HTTPBearer()
_optional_bearer = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    # bcrypt has a 72-byte limit
    return pwd_context.hash(password[:72])


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def hash_api_key(key: str) -> str:
    return pwd_context.hash(key[:72])


def verify_api_key(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain[:72], hashed)


# ── JWT ──

def create_token(user_id: str, tenant_id: str, role: str) -> str:
    """Create a JWT with user/tenant claims."""
    expire = datetime.utcnow() + timedelta(hours=JWT_EXPIRE_HOURS)
    payload = {
        "sub": user_id,
        "tenant_id": tenant_id,
        "role": role,
        "exp": expire,
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    """Decode and validate a JWT. Raises on invalid/expired."""
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[JWT_ALGORITHM])
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )


# ── FastAPI Dependencies ──

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    """
    Extract the authenticated user from the JWT bearer token.
    Every protected endpoint should depend on this.
    """
    payload = decode_token(credentials.credentials)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token payload")

    user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found or inactive")

    return user


def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_optional_bearer),
    db: Session = Depends(get_db),
) -> Optional[User]:
    """
    Extract the authenticated user if a valid token is present.
    Returns None for anonymous requests instead of raising 401.
    """
    if not credentials:
        return None
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            return None
        user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
        return user
    except JWTError:
        return None


def require_owner(user: User = Depends(get_current_user)) -> User:
    """Require the user to be an owner or admin."""
    if user.role not in ("owner", "admin"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Owner access required")
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    """Require platform admin (you)."""
    if user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin access required")
    return user


# -- API Key Auth --

import secrets
from datetime import date

def generate_api_key() -> str:
    """Generate a new API key with cane_ prefix."""
    return f"cane_{secrets.token_hex(24)}"


def get_api_key_auth(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> ApiKey:
    """
    Authenticate via API key (cane_... prefix).
    Returns the ApiKey object with tenant info.
    """
    token = credentials.credentials

    if not token.startswith("cane_"):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid API key format")

    # Find matching keys by prefix (first 12 chars)
    prefix = token[:12]
    candidates = db.query(ApiKey).filter(
        ApiKey.key_prefix == prefix,
        ApiKey.is_active == True,
    ).all()

    matched = None
    for candidate in candidates:
        try:
            if verify_api_key(token, candidate.key_hash):
                matched = candidate
                break
        except Exception:
            continue

    if not matched:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid API key")

    # Check tenant is active
    tenant = db.query(Tenant).filter(Tenant.id == matched.tenant_id, Tenant.is_active == True).first()
    if not tenant:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Tenant inactive")

    # Rate limiting — simple daily counter
    today = date.today().isoformat()
    if matched.last_used_at and matched.last_used_at.date().isoformat() != today:
        matched.requests_today = 0

    matched.requests_today += 1
    if matched.requests_today > matched.rate_limit:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Daily rate limit exceeded")

    matched.last_used_at = datetime.utcnow()
    db.commit()

    return matched