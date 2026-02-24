"""
routes/auth.py — Authentication endpoints.
"""
import re
from datetime import datetime

from fastapi import APIRouter, Form, HTTPException, Depends, Request
from sqlalchemy.orm import Session

from database import get_db
from db_models import Tenant, User, Workspace
from auth import (
    get_current_user, hash_password, verify_password, create_token,
)
from security import (
    login_limiter, validate_password, sanitize_form_field, validate_email,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login")
def login(request: Request, email: str = Form(...), password: str = Form(...), db: Session = Depends(get_db)):
    """Authenticate and return a JWT."""
    client_ip = request.client.host if request.client else "unknown"
    if login_limiter.is_locked(client_ip):
        remaining = login_limiter.remaining_lockout(client_ip)
        raise HTTPException(429, f"Too many failed attempts. Try again in {remaining} seconds.")

    email = sanitize_form_field(email).lower()
    email_err = validate_email(email)
    if email_err:
        raise HTTPException(400, email_err)

    user = db.query(User).filter(User.email == email, User.is_active == True).first()
    if not user or not verify_password(password, user.password_hash):
        login_limiter.record_failure(client_ip)
        raise HTTPException(401, "Invalid email or password")

    login_limiter.record_success(client_ip)
    user.last_login = datetime.utcnow()
    db.commit()

    tenant = db.query(Tenant).filter(Tenant.id == user.tenant_id).first()

    return {
        "token": create_token(user.id, user.tenant_id, user.role),
        "user": {"id": user.id, "email": user.email, "name": user.name, "role": user.role},
        "tenant": {"id": tenant.id, "name": tenant.name, "slug": tenant.slug, "plan": tenant.plan or "free"},
    }


@router.get("/me")
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Return current user + tenant info."""
    tenant = db.query(Tenant).filter(Tenant.id == user.tenant_id).first()
    workspaces = db.query(Workspace).filter(Workspace.tenant_id == user.tenant_id).all()

    return {
        "user": {"id": user.id, "email": user.email, "name": user.name, "role": user.role},
        "tenant": {"id": tenant.id, "name": tenant.name, "slug": tenant.slug, "plan": tenant.plan or "free"},
        "workspaces": [
            {
                "id": w.id, "name": w.name, "is_default": w.is_default,
                "agent_type": getattr(w, "agent_type", None),
                "agent_icon": getattr(w, "agent_icon", "") or "",
                "show_on_homepage": getattr(w, "show_on_homepage", False) or False,
            }
            for w in workspaces
        ],
    }


@router.post("/register")
def register(
    request: Request,
    email: str = Form(...),
    password: str = Form(...),
    name: str = Form(""),
    company_name: str = Form(""),
    db: Session = Depends(get_db),
):
    """Self-service signup: creates tenant + owner + default workspace + returns JWT."""
    client_ip = request.client.host if request.client else "unknown"
    if login_limiter.is_locked(client_ip):
        remaining = login_limiter.remaining_lockout(client_ip)
        raise HTTPException(429, f"Too many attempts. Try again in {remaining} seconds.")

    email = sanitize_form_field(email).lower()
    name = sanitize_form_field(name)
    company_name = sanitize_form_field(company_name)

    email_err = validate_email(email)
    if email_err:
        raise HTTPException(400, email_err)
    pwd_err = validate_password(password)
    if pwd_err:
        raise HTTPException(400, pwd_err)

    existing = db.query(User).filter(User.email == email).first()
    if existing:
        login_limiter.record_failure(client_ip)
        raise HTTPException(400, "An account with this email already exists")

    # Generate slug
    if company_name:
        slug = re.sub(r'[^a-z0-9]+', '-', company_name.lower()).strip('-')[:50]
    else:
        slug = email.split('@')[0]
        slug = re.sub(r'[^a-z0-9]+', '-', slug.lower()).strip('-')[:50]

    base_slug = slug
    counter = 1
    while db.query(Tenant).filter(Tenant.slug == slug).first():
        slug = f"{base_slug}-{counter}"
        counter += 1

    tenant = Tenant(name=company_name or name or email.split('@')[0], slug=slug)
    db.add(tenant)
    db.flush()

    ws = Workspace(tenant_id=tenant.id, name="Documents", description="Default workspace", is_default=True)
    db.add(ws)

    user = User(
        tenant_id=tenant.id, email=email,
        password_hash=hash_password(password), name=name, role="owner",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    login_limiter.record_success(client_ip)

    return {
        "token": create_token(user.id, user.tenant_id, user.role),
        "user": {"id": user.id, "email": user.email, "name": user.name, "role": user.role},
        "tenant": {"id": tenant.id, "name": tenant.name, "slug": tenant.slug, "plan": tenant.plan or "free"},
    }


@router.post("/password")
def change_password(
    current_password: str = Form(...),
    new_password: str = Form(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Change the current user's password."""
    if not verify_password(current_password, user.password_hash):
        raise HTTPException(400, "Current password is incorrect")
    pwd_err = validate_password(new_password)
    if pwd_err:
        raise HTTPException(400, pwd_err)
    user.password_hash = hash_password(new_password)
    db.commit()
    return {"status": "ok", "message": "Password updated"}
