"""
routes/api_keys.py — API key management (web-authenticated, owner only).
"""
from fastapi import APIRouter, HTTPException, Depends, Request
from sqlalchemy.orm import Session

from database import get_db
from db_models import Tenant, ApiKey
from auth import require_owner, generate_api_key, hash_api_key

router = APIRouter(prefix="/api/api-keys", tags=["api_keys"])


@router.get("")
def list_api_keys(user=Depends(require_owner), db: Session = Depends(get_db)):
    keys = db.query(ApiKey).filter(
        ApiKey.tenant_id == user.tenant_id
    ).order_by(ApiKey.created_at.desc()).all()

    return {
        "keys": [
            {
                "id": k.id, "name": k.name, "key_prefix": k.key_prefix,
                "workspace_id": k.workspace_id, "is_active": k.is_active,
                "rate_limit": k.rate_limit, "requests_today": k.requests_today,
                "last_used_at": k.last_used_at.isoformat() if k.last_used_at else None,
                "created_at": k.created_at.isoformat() if k.created_at else None,
            }
            for k in keys
        ]
    }


@router.post("")
async def create_api_key_endpoint(
    request: Request, user=Depends(require_owner), db: Session = Depends(get_db),
):
    """Generate a new API key. Returns the full key ONCE."""
    tenant = db.query(Tenant).filter(Tenant.id == user.tenant_id).first()
    if tenant and tenant.plan == "free":
        raise HTTPException(403, "API access requires a Pro plan. Upgrade to generate API keys.")

    try:
        body = await request.json()
    except Exception:
        body = {}

    name = body.get("name", "API Key")
    workspace_id = body.get("workspace_id", None)

    raw_key = generate_api_key()
    key_prefix = raw_key[:12]
    key_hashed = hash_api_key(raw_key)

    api_key = ApiKey(
        tenant_id=user.tenant_id, name=name,
        key_hash=key_hashed, key_prefix=key_prefix,
        workspace_id=workspace_id if workspace_id else None, rate_limit=1000,
    )
    db.add(api_key)
    db.commit()
    db.refresh(api_key)

    return {
        "id": api_key.id, "name": api_key.name, "key": raw_key,
        "key_prefix": key_prefix, "workspace_id": api_key.workspace_id,
        "rate_limit": api_key.rate_limit,
        "created_at": api_key.created_at.isoformat() if api_key.created_at else None,
    }


@router.delete("/{key_id}")
def revoke_api_key(key_id: str, user=Depends(require_owner), db: Session = Depends(get_db)):
    api_key = db.query(ApiKey).filter(ApiKey.id == key_id, ApiKey.tenant_id == user.tenant_id).first()
    if not api_key:
        raise HTTPException(404, "API key not found")
    db.delete(api_key)
    db.commit()
    return {"status": "deleted"}
