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

from config import SECRET_KEY, JWT_ALGORITHM, JWT_EXPIRE_HOURS
from database import get_db
from db_models import User, Tenant

# ── Password hashing ──
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ── Bearer token scheme ──
bearer_scheme = HTTPBearer()


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


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
