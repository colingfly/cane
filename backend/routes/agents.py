"""
routes/agents.py — Agent CRUD, templates, and prompt generation.
"""
import traceback

from fastapi import APIRouter, Form, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

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
    tenant = db.query(Tenant).filter(Tenant.id == user.tenant_id).first()
    limit_err = check_agent_limit(user.tenant_id, tenant.plan if tenant else "free", db)
    if limit_err:
        return JSONResponse({"error": limit_err}, status_code=403)

    template = get_template(agent_type)
    if template:
        name = name or template["name"]
        icon = icon or template.get("icon", "")
        description = description or template.get("description", "")
        system_prompt = template.get("system_prompt", "")
    else:
        agent_type = "custom"
        icon = icon or "CA"
        system_prompt = ""

    if not name:
        return JSONResponse({"error": "Agent name is required"}, status_code=400)

    workspace = Workspace(
        tenant_id=user.tenant_id, name=name, description=description,
        agent_type=agent_type, agent_icon=icon, agent_description=description,
        system_prompt=system_prompt, show_on_homepage=False, is_default=False,
    )
    db.add(workspace)
    db.commit()
    db.refresh(workspace)

    return {
        "id": workspace.id, "name": workspace.name, "agent_type": workspace.agent_type,
        "agent_icon": workspace.agent_icon or "", "agent_description": workspace.agent_description or "",
        "system_prompt": workspace.system_prompt or "",
        "show_on_homepage": getattr(workspace, "show_on_homepage", False) or False,
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
        "id": ws.id, "name": ws.name, "agent_type": ws.agent_type,
        "agent_icon": ws.agent_icon or "", "agent_description": ws.agent_description or "",
        "system_prompt": ws.system_prompt or "",
        "show_on_homepage": getattr(ws, "show_on_homepage", False) or False,
        "document_count": doc_count,
        "created_at": ws.created_at.isoformat() if ws.created_at else "",
    }


@router.put("/{agent_id}")
def update_agent(
    agent_id: str,
    name: str = Form(None), system_prompt: str = Form(None),
    agent_description: str = Form(None), agent_icon: str = Form(None),
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
    if system_prompt is not None:
        ws.system_prompt = system_prompt
    if agent_description is not None:
        ws.agent_description = sanitize_form_field(agent_description)
    if agent_icon is not None:
        ws.agent_icon = agent_icon
    if show_on_homepage is not None:
        ws.show_on_homepage = show_on_homepage.lower() in ("true", "1", "yes")

    db.commit()
    db.refresh(ws)

    return {
        "id": ws.id, "name": ws.name, "agent_type": ws.agent_type,
        "agent_icon": ws.agent_icon or "", "agent_description": ws.agent_description or "",
        "system_prompt": ws.system_prompt or "",
        "show_on_homepage": getattr(ws, "show_on_homepage", False) or False,
    }


@router.delete("/{agent_id}")
def delete_agent(agent_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Delete an agent, its documents, tools, evals, listings, and vector store chunks."""
    ws = db.query(Workspace).filter(
        Workspace.id == agent_id, Workspace.tenant_id == user.tenant_id,
        Workspace.agent_type.isnot(None),
    ).first()
    if not ws:
        return JSONResponse({"error": "Agent not found"}, status_code=404)

    try:
        from marketplace_models import MarketplaceListing, MarketplaceClone
        from eval_models import Environment, TestCase, JudgeCriteria, JudgeCustomRule, EvalRun, EvalResult
        from tool_models import AgentTool
        from mcp_models import McpServer

        # 1. Marketplace cascade
        listing_ids = [l.id for l in db.query(MarketplaceListing).filter(
            MarketplaceListing.source_workspace_id == agent_id
        ).all()]
        if listing_ids:
            db.query(MarketplaceClone).filter(MarketplaceClone.listing_id.in_(listing_ids)).delete(synchronize_session=False)
            db.query(MarketplaceListing).filter(MarketplaceListing.id.in_(listing_ids)).delete(synchronize_session=False)
        db.query(MarketplaceClone).filter(MarketplaceClone.cloned_workspace_id == agent_id).delete(synchronize_session=False)

        # 2. Eval cascade
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

        # 3. Tools, MCP servers, API keys, search logs
        db.query(AgentTool).filter(AgentTool.workspace_id == agent_id).delete(synchronize_session=False)
        db.query(McpServer).filter(McpServer.workspace_id == agent_id).delete(synchronize_session=False)
        db.query(ApiKey).filter(ApiKey.workspace_id == agent_id).delete(synchronize_session=False)
        db.query(SearchLog).filter(SearchLog.workspace_id == agent_id).delete(synchronize_session=False)

        # 4. Documents + vector chunks
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

        # 5. Delete workspace
        db.delete(ws)
        db.commit()
        return {"status": "deleted"}

    except Exception as e:
        db.rollback()
        traceback.print_exc()
        return JSONResponse({"error": f"Delete failed: {str(e)}"}, status_code=500)


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
