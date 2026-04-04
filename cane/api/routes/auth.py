"""
routes/auth.py — Authentication endpoints.
"""
import re
from datetime import datetime

from fastapi import APIRouter, Form, HTTPException, Depends, Request
from sqlalchemy.orm import Session

from cane.core.database import get_db
from cane.core.models import Tenant, User, Workspace, Document
from cane.auth.jwt import (
    get_current_user, hash_password, verify_password, create_token,
)
from cane.core.config import GUEST_TENANT_ID, UPLOAD_DIR
from cane.core.security import (
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
    guest_session_id: str = Form(""),
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

    # Migrate guest data if a guest session was active
    if guest_session_id:
        _migrate_guest_data(db, guest_session_id, tenant.id, user.id)

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


def _migrate_guest_data(db: Session, guest_session_id: str, new_tenant_id: str, new_user_id: str):
    """Migrate guest workspaces, documents, and eval data to a new account."""
    import shutil
    from pathlib import Path

    guest_workspaces = db.query(Workspace).filter(
        Workspace.tenant_id == GUEST_TENANT_ID,
        Workspace.guest_session_id == guest_session_id,
    ).all()

    if not guest_workspaces:
        return

    for ws in guest_workspaces:
        ws.tenant_id = new_tenant_id
        ws.guest_session_id = None

        # Migrate documents
        docs = db.query(Document).filter(Document.workspace_id == ws.id).all()
        for doc in docs:
            doc.tenant_id = new_tenant_id
            doc.uploaded_by = new_user_id

        # Migrate eval data
        try:
            from cane.eval.models import Environment, EvalRun, EvalResult, TestCase, JudgeCriteria, JudgeCustomRule
            envs = db.query(Environment).filter(
                Environment.workspace_id == ws.id, Environment.tenant_id == GUEST_TENANT_ID,
            ).all()
            for env in envs:
                env.tenant_id = new_tenant_id
                env.created_by = new_user_id
                for run in db.query(EvalRun).filter(EvalRun.environment_id == env.id).all():
                    run.tenant_id = new_tenant_id
                    run.triggered_by = new_user_id
        except Exception:
            pass

        # Migrate ChromaDB chunks
        try:
            from cane.rag.chroma import text_col, image_col
            for col in [text_col, image_col]:
                if not col:
                    continue
                results = col.get(
                    where={"$and": [{"tenant_id": GUEST_TENANT_ID}, {"workspace_id": ws.id}]},
                    include=["metadatas"],
                )
                if results["ids"]:
                    new_metas = [{**m, "tenant_id": new_tenant_id} for m in results["metadatas"]]
                    col.update(ids=results["ids"], metadatas=new_metas)
        except Exception:
            pass

        # Move uploaded files
        try:
            guest_dir = UPLOAD_DIR / GUEST_TENANT_ID
            new_dir = UPLOAD_DIR / new_tenant_id
            new_dir.mkdir(parents=True, exist_ok=True)
            if guest_dir.exists():
                for f in guest_dir.iterdir():
                    if f.is_file():
                        dest = new_dir / f.name
                        if not dest.exists():
                            shutil.move(str(f), str(dest))
        except Exception:
            pass

    # Migrate marketplace listings/clones
    try:
        from cane.core.marketplace_models import MarketplaceListing, MarketplaceClone
        db.query(MarketplaceListing).filter(
            MarketplaceListing.guest_session_id == guest_session_id,
        ).update({
            MarketplaceListing.publisher_tenant_id: new_tenant_id,
            MarketplaceListing.publisher_user_id: new_user_id,
            MarketplaceListing.guest_session_id: None,
        })
        db.query(MarketplaceClone).filter(
            MarketplaceClone.guest_session_id == guest_session_id,
        ).update({
            MarketplaceClone.cloned_by_tenant_id: new_tenant_id,
            MarketplaceClone.cloned_by_user_id: new_user_id,
            MarketplaceClone.guest_session_id: None,
        })
    except Exception:
        pass

    db.commit()
    print(f"[Auth] Migrated {len(guest_workspaces)} guest workspace(s) to tenant {new_tenant_id}")
