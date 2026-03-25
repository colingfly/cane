"""
services/limits.py — Plan limit checks.
"""
from datetime import datetime
from sqlalchemy.orm import Session
from db_models import Workspace, Document, SearchLog

PLAN_LIMITS = {
    "guest":    {"max_agents": 1,  "max_documents": 3,  "max_searches_month": 20},
    "free":     {"max_agents": 1,  "max_documents": 3,  "max_searches_month": 50},
    "pro":      {"max_agents": 3,  "max_documents": -1, "max_searches_month": -1},
    "business": {"max_agents": -1, "max_documents": -1, "max_searches_month": -1},
}


def get_plan_limits(plan: str) -> dict:
    return PLAN_LIMITS.get(plan, PLAN_LIMITS["free"])


def check_agent_limit(tenant_id: str, plan: str, db: Session) -> str | None:
    limits = get_plan_limits(plan)
    if limits["max_agents"] == -1:
        return None
    count = db.query(Workspace).filter(
        Workspace.tenant_id == tenant_id,
        Workspace.is_default == False,
    ).count()
    if count >= limits["max_agents"]:
        return f"Free plan allows {limits['max_agents']} agent. Delete an existing agent or upgrade to Pro."
    return None


def check_document_limit(tenant_id: str, plan: str, db: Session) -> str | None:
    limits = get_plan_limits(plan)
    if limits["max_documents"] == -1:
        return None
    count = db.query(Document).filter(Document.tenant_id == tenant_id).count()
    if count >= limits["max_documents"]:
        return f"Free plan allows {limits['max_documents']} documents. Delete existing documents or upgrade to Pro."
    return None


def check_guest_agent_limit(guest_session_id: str, db: Session) -> str | None:
    """Check agent limit scoped by guest session (not tenant)."""
    count = db.query(Workspace).filter(
        Workspace.guest_session_id == guest_session_id,
        Workspace.is_default == False,
    ).count()
    if count >= 1:
        return "Anonymous users can create 1 agent. Sign up to create more."
    return None


def check_guest_document_limit(guest_session_id: str, db: Session) -> str | None:
    """Check document limit scoped by guest session."""
    count = db.query(Document).filter(
        Document.workspace_id.in_(
            db.query(Workspace.id).filter(Workspace.guest_session_id == guest_session_id)
        )
    ).count()
    if count >= 3:
        return "Anonymous users can upload 3 documents. Sign up for more."
    return None


def check_search_limit(tenant_id: str, plan: str, db: Session) -> str | None:
    limits = get_plan_limits(plan)
    if limits["max_searches_month"] == -1:
        return None
    first_of_month = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    count = db.query(SearchLog).filter(
        SearchLog.tenant_id == tenant_id,
        SearchLog.created_at >= first_of_month,
    ).count()
    if count >= limits["max_searches_month"]:
        return f"Free plan allows {limits['max_searches_month']} searches per month. Upgrade to Pro for unlimited searches."
    return None
