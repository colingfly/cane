"""
routes/admin.py — Admin-only endpoints for tenant management.
"""
from collections import Counter

from fastapi import APIRouter, Form, HTTPException, Depends
from sqlalchemy.orm import Session

from database import get_db
from db_models import Tenant, User, Workspace, Document, SearchLog, ApiKey
from auth import require_admin, hash_password
from security import sanitize_form_field, validate_email, validate_password

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/tenants")
def admin_list_tenants(user: User = Depends(require_admin), db: Session = Depends(get_db)):
    tenants = db.query(Tenant).filter(Tenant.plan != "admin").all()
    result = []
    for t in tenants:
        doc_count = db.query(Document).filter(Document.tenant_id == t.id, Document.status == "ready").count()
        user_count = db.query(User).filter(User.tenant_id == t.id).count()
        search_count = db.query(SearchLog).filter(SearchLog.tenant_id == t.id).count()
        result.append({
            "id": t.id, "name": t.name, "slug": t.slug, "is_active": t.is_active,
            "created_at": t.created_at.isoformat(),
            "users": user_count, "documents": doc_count, "searches": search_count,
        })
    return {"tenants": result}


@router.get("/tenants/{tenant_id}")
def admin_tenant_detail(tenant_id: str, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(404, "Tenant not found")

    documents = db.query(Document).filter(Document.tenant_id == tenant_id).all()
    users = db.query(User).filter(User.tenant_id == tenant_id).all()
    searches = db.query(SearchLog).filter(
        SearchLog.tenant_id == tenant_id
    ).order_by(SearchLog.created_at.desc()).limit(100).all()

    zero_results = [s for s in searches if s.result_count == 0]
    query_counts = Counter(s.query.lower().strip() for s in searches)
    top_queries = query_counts.most_common(20)

    return {
        "tenant": {"id": tenant.id, "name": tenant.name, "slug": tenant.slug, "created_at": tenant.created_at.isoformat()},
        "users": [{"id": u.id, "email": u.email, "name": u.name, "role": u.role, "last_login": u.last_login.isoformat() if u.last_login else None} for u in users],
        "documents": [{"filename": d.filename, "status": d.status, "chunks": d.chunk_count, "created_at": d.created_at.isoformat()} for d in documents],
        "search_volume": len(searches),
        "zero_result_queries": [{"query": s.query, "time": s.created_at.isoformat()} for s in zero_results],
        "top_queries": [{"query": q, "count": c} for q, c in top_queries],
        "recent_searches": [{"query": s.query, "mode": s.mode, "results": s.result_count, "time": s.created_at.isoformat()} for s in searches[:20]],
    }


@router.post("/tenants")
def admin_create_tenant(
    name: str = Form(...), slug: str = Form(...),
    owner_email: str = Form(...), owner_password: str = Form(...), owner_name: str = Form(""),
    user: User = Depends(require_admin), db: Session = Depends(get_db),
):
    name = sanitize_form_field(name)
    slug = sanitize_form_field(slug).lower()
    owner_email = sanitize_form_field(owner_email).lower()
    owner_name = sanitize_form_field(owner_name)

    email_err = validate_email(owner_email)
    if email_err:
        raise HTTPException(400, email_err)
    pwd_err = validate_password(owner_password)
    if pwd_err:
        raise HTTPException(400, pwd_err)
    if not name:
        raise HTTPException(400, "Company name is required")
    if not slug:
        raise HTTPException(400, "Slug is required")

    if db.query(Tenant).filter(Tenant.slug == slug).first():
        raise HTTPException(400, f"Tenant slug '{slug}' already exists")
    if db.query(User).filter(User.email == owner_email).first():
        raise HTTPException(400, f"Email '{owner_email}' already registered")

    tenant = Tenant(name=name, slug=slug)
    db.add(tenant)
    db.flush()

    ws = Workspace(tenant_id=tenant.id, name=f"{name} Docs", description=f"Default workspace for {name}", is_default=True)
    db.add(ws)

    owner = User(
        tenant_id=tenant.id, email=owner_email,
        password_hash=hash_password(owner_password), name=owner_name, role="owner",
    )
    db.add(owner)
    db.commit()

    return {"tenant_id": tenant.id, "owner_id": owner.id, "workspace_id": ws.id}


@router.put("/tenants/{tenant_id}")
def admin_update_tenant(
    tenant_id: str, name: str = Form(...), slug: str = Form(""),
    user: User = Depends(require_admin), db: Session = Depends(get_db),
):
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(404, "Tenant not found")
    tenant.name = name
    if slug:
        tenant.slug = slug
    db.commit()
    return {"id": tenant.id, "name": tenant.name, "slug": tenant.slug}


@router.delete("/tenants/{tenant_id}")
def admin_delete_tenant(tenant_id: str, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(404, "Tenant not found")

    from marketplace_models import MarketplaceListing, MarketplaceClone
    from eval_models import EvalResult, EvalRun, JudgeCustomRule, JudgeCriteria, TestCase, Environment
    from tool_models import AgentTool
    from mcp_models import McpServer

    listing_ids = [l.id for l in db.query(MarketplaceListing).filter(MarketplaceListing.publisher_tenant_id == tenant_id).all()]
    db.query(MarketplaceClone).filter(MarketplaceClone.cloned_by_tenant_id == tenant_id).delete(synchronize_session=False)
    if listing_ids:
        db.query(MarketplaceClone).filter(MarketplaceClone.listing_id.in_(listing_ids)).delete(synchronize_session=False)
    db.query(MarketplaceListing).filter(MarketplaceListing.publisher_tenant_id == tenant_id).delete(synchronize_session=False)

    env_ids = [e.id for e in db.query(Environment).filter(Environment.tenant_id == tenant_id).all()]
    if env_ids:
        run_ids = [r.id for r in db.query(EvalRun).filter(EvalRun.environment_id.in_(env_ids)).all()]
        if run_ids:
            db.query(EvalResult).filter(EvalResult.eval_run_id.in_(run_ids)).delete(synchronize_session=False)
        db.query(EvalRun).filter(EvalRun.environment_id.in_(env_ids)).delete(synchronize_session=False)
        db.query(JudgeCustomRule).filter(JudgeCustomRule.environment_id.in_(env_ids)).delete(synchronize_session=False)
        db.query(JudgeCriteria).filter(JudgeCriteria.environment_id.in_(env_ids)).delete(synchronize_session=False)
        db.query(TestCase).filter(TestCase.environment_id.in_(env_ids)).delete(synchronize_session=False)
    db.query(Environment).filter(Environment.tenant_id == tenant_id).delete(synchronize_session=False)

    db.query(AgentTool).filter(AgentTool.tenant_id == tenant_id).delete(synchronize_session=False)
    db.query(McpServer).filter(McpServer.tenant_id == tenant_id).delete(synchronize_session=False)
    db.query(ApiKey).filter(ApiKey.tenant_id == tenant_id).delete(synchronize_session=False)
    db.query(SearchLog).filter(SearchLog.tenant_id == tenant_id).delete(synchronize_session=False)
    db.query(Document).filter(Document.tenant_id == tenant_id).delete(synchronize_session=False)
    db.query(Workspace).filter(Workspace.tenant_id == tenant_id).delete(synchronize_session=False)
    db.query(User).filter(User.tenant_id == tenant_id).delete(synchronize_session=False)
    db.delete(tenant)
    db.commit()

    return {"status": "deleted", "name": tenant.name}


@router.put("/tenants/{tenant_id}/users/{user_id}")
def admin_update_user(
    tenant_id: str, user_id: str,
    email: str = Form(...), name: str = Form(""),
    user: User = Depends(require_admin), db: Session = Depends(get_db),
):
    target = db.query(User).filter(User.id == user_id, User.tenant_id == tenant_id).first()
    if not target:
        raise HTTPException(404, "User not found")
    if email != target.email:
        if db.query(User).filter(User.email == email).first():
            raise HTTPException(400, f"Email '{email}' is already in use")
    target.email = email
    target.name = name
    db.commit()
    return {"id": target.id, "email": target.email, "name": target.name}


@router.delete("/tenants/{tenant_id}/users/{user_id}")
def admin_delete_user(
    tenant_id: str, user_id: str,
    user: User = Depends(require_admin), db: Session = Depends(get_db),
):
    target = db.query(User).filter(User.id == user_id, User.tenant_id == tenant_id).first()
    if not target:
        raise HTTPException(404, "User not found")
    if target.role == "owner":
        raise HTTPException(400, "Cannot delete the tenant owner")
    db.delete(target)
    db.commit()
    return {"status": "deleted", "email": target.email}
