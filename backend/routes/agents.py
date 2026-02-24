"""
routes/agents.py — Agent CRUD, templates, and prompt generation.
"""
import traceback

from fastapi import APIRouter, Form, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import text

from database import get_db
from db_models import Tenant, User, Workspace, Document, SearchLog, ApiKey
from auth import get_current_user
from agent_prompts import get_template, list_templates, auto_generate_prompt
from security import sanitize_form_field
from services.limits import check_agent_limit
from services.chroma import text_col, image_col

router = APIRouter(prefix="/api/agents", tags=["agents"])


@router.get("/templates")
def get_agent_templates(user: User = Depends(get_current_user)):
    return {"templates": list_templates()}


@router.get("")
def list_agents(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    agents = db.query(Workspace).filter(
        Workspace.tenant_id == user.tenant_id,
        Workspace.agent_type.isnot(None),
    ).order_by(Workspace.created_at.desc()).all()

    result = []
    for a in agents:
        doc_count = db.query(Document).filter(Document.workspace_id == a.id).count()
        result.append({
            "id": a.id, "name": a.name, "agent_type": a.agent_type,
            "agent_icon": a.agent_icon or "", "agent_description": a.agent_description or "",
            "system_prompt": a.system_prompt or "",
            "show_on_homepage": getattr(a, "show_on_homepage", False) or False,
            "document_count": doc_count,
            "created_at": a.created_at.isoformat() if a.created_at else "",
        })
    return {"agents": result}


@router.post("")
def create_agent(
    agent_type: str = Form("custom"), name: str = Form(""),
    description: str = Form(""), icon: str = Form(""),
    user: User = Depends(get_current_user), db: Session = Depends(get_db),
):
    """Create a new agent."""
    # Check limit
    tenant = db.query(Tenant).filter(Tenant.id == user.tenant_id).first()
    limit_err = check_agent_limit(user.tenant_id, tenant.plan if tenant else "free", db)
    if limit_err:
        return JSONResponse({"error": limit_err}, status_code=403)

    name = sanitize_form_field(name)
    description = sanitize_form_field(description)
    icon = sanitize_form_field(icon)

    tmpl = get_template(agent_type)
    if tmpl:
        name = name or tmpl.get("name", "New Agent")
        icon = icon or tmpl.get("icon", "")
        description = description or tmpl.get("description", "")
        system_prompt = tmpl.get("system_prompt", "")
    else:
        agent_type = "custom"
        icon = icon or "CA"
        system_prompt = ""

    if not name:
        return JSONResponse({"error": "Agent name is required"}, status_code=400)

    ws = Workspace(
        tenant_id=user.tenant_id, name=name, description=description,
        agent_type=agent_type, agent_icon=icon, agent_description=description,
        system_prompt=system_prompt, show_on_homepage=False, is_default=False,
    )
    db.add(ws)
    db.commit()
    db.refresh(ws)

    return {
        "id": ws.id, "name": ws.name, "agent_type": ws.agent_type,
        "agent_icon": ws.agent_icon or "", "agent_description": ws.agent_description or "",
        "system_prompt": ws.system_prompt or "",
        "show_on_homepage": getattr(ws, "show_on_homepage", False) or False,
    }


@router.get("/{agent_id}")
def get_agent(agent_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ws = db.query(Workspace).filter(
        Workspace.id == agent_id, Workspace.tenant_id == user.tenant_id,
        Workspace.agent_type.isnot(None),
    ).first()
    if not ws:
        return JSONResponse({"error": "Agent not found"}, status_code=404)

    doc_count = db.query(Document).filter(Document.workspace_id == ws.id).count()
    return {
        "id": ws.id, "name": ws.name, "description": ws.description or "",
        "agent_type": ws.agent_type, "agent_icon": ws.agent_icon or "",
        "agent_description": ws.agent_description or "",
        "system_prompt": ws.system_prompt or "",
        "show_on_homepage": getattr(ws, "show_on_homepage", False) or False,
        "document_count": doc_count,
        "created_at": ws.created_at.isoformat() if ws.created_at else "",
    }


@router.put("/{agent_id}")
def update_agent(
    agent_id: str, name: str = Form(None), description: str = Form(None),
    icon: str = Form(None), system_prompt: str = Form(None),
    show_on_homepage: str = Form(None),
    user: User = Depends(get_current_user), db: Session = Depends(get_db),
):
    ws = db.query(Workspace).filter(
        Workspace.id == agent_id, Workspace.tenant_id == user.tenant_id,
        Workspace.agent_type.isnot(None),
    ).first()
    if not ws:
        return JSONResponse({"error": "Agent not found"}, status_code=404)

    if name is not None:
        ws.name = sanitize_form_field(name)
    if description is not None:
        ws.agent_description = sanitize_form_field(description)
    if icon is not None:
        ws.agent_icon = sanitize_form_field(icon)
    if system_prompt is not None:
        ws.system_prompt = system_prompt
    if show_on_homepage is not None:
        ws.show_on_homepage = show_on_homepage.lower() in ("true", "1", "yes")

    db.commit()
    return {
        "id": ws.id, "name": ws.name, "agent_type": ws.agent_type,
        "agent_icon": ws.agent_icon or "", "agent_description": ws.agent_description or "",
        "system_prompt": ws.system_prompt or "",
        "show_on_homepage": getattr(ws, "show_on_homepage", False) or False,
    }


def _safe_delete(db, sql, params):
    """Execute raw DELETE, silently skip if table doesn't exist."""
    try:
        db.execute(text(sql), params)
    except Exception:
        pass


@router.delete("/{agent_id}")
def delete_agent(agent_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Delete an agent and all related data (defensive — handles missing tables)."""
    ws = db.query(Workspace).filter(
        Workspace.id == agent_id, Workspace.tenant_id == user.tenant_id,
        Workspace.agent_type.isnot(None),
    ).first()
    if not ws:
        return JSONResponse({"error": "Agent not found"}, status_code=404)

    try:
        # ── 1. Marketplace cascade ──
        try:
            from marketplace_models import MarketplaceListing, MarketplaceClone
            listing_ids = [l.id for l in db.query(MarketplaceListing).filter(
                MarketplaceListing.source_workspace_id == agent_id
            ).all()]
            if listing_ids:
                db.query(MarketplaceClone).filter(MarketplaceClone.listing_id.in_(listing_ids)).delete(synchronize_session=False)
                db.query(MarketplaceListing).filter(MarketplaceListing.id.in_(listing_ids)).delete(synchronize_session=False)
            db.query(MarketplaceClone).filter(MarketplaceClone.cloned_workspace_id == agent_id).delete(synchronize_session=False)
        except Exception as e:
            print(f"  [Delete] Marketplace cleanup skipped: {e}")

        # ── 2. Eval cascade ──
        try:
            from eval_models import Environment, TestCase, JudgeCriteria, JudgeCustomRule, EvalRun, EvalResult
            env_ids = [e.id for e in db.query(Environment).filter(Environment.workspace_id == agent_id).all()]
            if env_ids:
                run_ids = [r.id for r in db.query(EvalRun).filter(EvalRun.environment_id.in_(env_ids)).all()]
                if run_ids:
                    db.query(EvalResult).filter(EvalResult.eval_run_id.in_(run_ids)).delete(synchronize_session=False)
                db.query(EvalRun).filter(EvalRun.environment_id.in_(env_ids)).delete(synchronize_session=False)
                db.query(JudgeCustomRule).filter(JudgeCustomRule.environment_id.in_(env_ids)).delete(synchronize_session=False)
                db.query(JudgeCriteria).filter(JudgeCriteria.environment_id.in_(env_ids)).delete(synchronize_session=False)
                db.query(TestCase).filter(TestCase.environment_id.in_(env_ids)).delete(synchronize_session=False)
                db.query(Environment).filter(Environment.id.in_(env_ids)).delete(synchronize_session=False)
        except Exception as e:
            print(f"  [Delete] Eval cleanup skipped: {e}")

        # ── 3. Tools (safe — table might not exist) ──
        _safe_delete(db, "DELETE FROM agent_tools WHERE workspace_id = :wid", {"wid": agent_id})

        # ── 4. MCP servers (safe) ──
        _safe_delete(db, "DELETE FROM mcp_servers WHERE workspace_id = :wid", {"wid": agent_id})

        # ── 5. API keys ──
        db.query(ApiKey).filter(ApiKey.workspace_id == agent_id).delete(synchronize_session=False)

        # ── 6. Search logs ──
        db.query(SearchLog).filter(SearchLog.workspace_id == agent_id).delete(synchronize_session=False)

        # ── 7. Conversation logs / analytics (safe) ──
        _safe_delete(db, "DELETE FROM conversation_logs WHERE workspace_id = :wid", {"wid": agent_id})

        # ── 8. Documents + vector chunks ──
        docs = db.query(Document).filter(Document.workspace_id == agent_id).all()
        for doc in docs:
            try:
                text_col.delete(where={"document_id": doc.id})
            except Exception:
                pass
            try:
                if image_col:
                    image_col.delete(where={"document_id": doc.id})
            except Exception:
                pass
            db.delete(doc)

        # ── 9. Delete workspace ──
        db.delete(ws)
        db.commit()
        return {"status": "deleted"}

    except Exception as e:
        db.rollback()
        traceback.print_exc()
        return JSONResponse({"error": f"Delete failed: {str(e)[:200]}"}, status_code=500)


@router.post("/{agent_id}/generate-prompt")
def generate_agent_prompt(
    agent_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db),
):
    """Auto-generate a system prompt from the agent's documents."""
    ws = db.query(Workspace).filter(
        Workspace.id == agent_id, Workspace.tenant_id == user.tenant_id,
        Workspace.agent_type.isnot(None),
    ).first()
    if not ws:
        return JSONResponse({"error": "Agent not found"}, status_code=404)

    try:
        where = {"$and": [{"tenant_id": user.tenant_id}, {"workspace_id": agent_id}]}
        chunks = text_col.get(where=where, include=["documents", "metadatas"])
        docs = chunks.get("documents", [])
        metas = chunks.get("metadatas", [])
    except Exception:
        docs, metas = [], []

    if not docs:
        return JSONResponse(
            {"error": "Upload documents to this agent first, then generate a prompt."},
            status_code=400,
        )

    file_previews = {}
    for doc, meta in zip(docs, metas):
        src = (meta or {}).get("source_file", "unknown")
        if src not in file_previews:
            display = (meta or {}).get("display_text", doc) or doc
            file_previews[src] = {"filename": src, "preview": display[:2000]}

    prompt = auto_generate_prompt(list(file_previews.values()), base_prompt=ws.system_prompt or "")
    if not prompt:
        return JSONResponse({"error": "Failed to generate prompt. Try again or write one manually."}, status_code=500)

    ws.system_prompt = prompt
    db.commit()
    return {"system_prompt": prompt, "documents_analyzed": len(file_previews)}
