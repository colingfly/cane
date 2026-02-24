"""
routes/team.py — Team management (owner only).
"""
from fastapi import APIRouter, Form, HTTPException, Depends
from sqlalchemy.orm import Session

from database import get_db
from db_models import User
from auth import require_owner, hash_password
from security import sanitize_form_field, validate_email, validate_password

router = APIRouter(prefix="/api/team", tags=["team"])


@router.get("")
def list_team(user: User = Depends(require_owner), db: Session = Depends(get_db)):
    users = db.query(User).filter(User.tenant_id == user.tenant_id).all()
    return {
        "members": [
            {
                "id": u.id, "email": u.email, "name": u.name, "role": u.role,
                "is_active": u.is_active,
                "last_login": u.last_login.isoformat() if u.last_login else None,
                "created_at": u.created_at.isoformat(),
            }
            for u in users
        ]
    }


@router.post("/invite")
def invite_member(
    email: str = Form(...), name: str = Form(""),
    password: str = Form(...), role: str = Form("member"),
    user: User = Depends(require_owner), db: Session = Depends(get_db),
):
    if role not in ("member", "owner"):
        raise HTTPException(400, "Role must be 'member' or 'owner'")

    email = sanitize_form_field(email).lower()
    name = sanitize_form_field(name)
    email_err = validate_email(email)
    if email_err:
        raise HTTPException(400, email_err)
    pwd_err = validate_password(password)
    if pwd_err:
        raise HTTPException(400, pwd_err)

    if db.query(User).filter(User.email == email).first():
        raise HTTPException(400, "Email already registered")

    new_user = User(
        tenant_id=user.tenant_id, email=email,
        password_hash=hash_password(password), name=name, role=role,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return {"id": new_user.id, "email": new_user.email, "role": new_user.role}
