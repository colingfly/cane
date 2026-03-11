"""
routes/agents.py — Agent CRUD, templates, and prompt generation.
"""
import traceback

from fastapi import APIRouter, Form, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import text

from database import get_db
from db_models import Tenant, User, Workspace, Document, SearchLog, ApiKey
from tool_models import AgentLink
from auth import get_current_user
from agent_prompts import get_template, list_templates, auto_generate_prompt, generate_replica_prompt
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

        # ── 3b. Agent links (parent or child) ──
        _safe_delete(db, "DELETE FROM agent_links WHERE parent_workspace_id = :wid OR child_workspace_id = :wid", {"wid": agent_id})

        # ── 3c. Scheduled runs + schedules ──
        _safe_delete(db, "DELETE FROM agent_schedule_runs WHERE workspace_id = :wid", {"wid": agent_id})
        _safe_delete(db, "DELETE FROM agent_schedules WHERE workspace_id = :wid", {"wid": agent_id})

        # ── 3d. Agent memories ──
        _safe_delete(db, "DELETE FROM agent_memories WHERE workspace_id = :wid", {"wid": agent_id})

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


@router.post("/{agent_id}/generate-replica-prompt")
async def generate_replica_prompt_endpoint(
    agent_id: str, request: Request,
    user: User = Depends(get_current_user), db: Session = Depends(get_db),
):
    """Generate a personalized digital replica prompt from personality profile + writing samples."""
    ws = db.query(Workspace).filter(
        Workspace.id == agent_id, Workspace.tenant_id == user.tenant_id,
        Workspace.agent_type.isnot(None),
    ).first()
    if not ws:
        return JSONResponse({"error": "Agent not found"}, status_code=404)

    body = await request.json()
    personality = {
        "name": body.get("name", ""),
        "role": body.get("role", ""),
        "style": body.get("style", ""),
        "topics": body.get("topics", ""),
        "traits": body.get("traits", ""),
    }

    # Pull writing samples from uploaded documents
    writing_samples = ""
    try:
        where = {"$and": [{"tenant_id": user.tenant_id}, {"workspace_id": agent_id}]}
        chunks = text_col.get(where=where, include=["documents"])
        docs = chunks.get("documents", [])
        writing_samples = "\n\n---\n\n".join(docs[:20])  # First 20 chunks
    except Exception:
        pass

    prompt = generate_replica_prompt(personality, writing_samples)
    if not prompt:
        return JSONResponse(
            {"error": "Failed to generate replica prompt. Upload some writing samples and try again."},
            status_code=500,
        )

    ws.system_prompt = prompt
    db.commit()
    return {"system_prompt": prompt}


# ─────────────────────────────────────────
#  Agent Links (Sub-Agent Orchestration)
# ─────────────────────────────────────────

def _has_circular_ref(db: Session, parent_id: str, child_id: str, tenant_id: str, max_depth: int = 2) -> bool:
    """Check if adding parent->child would create a cycle."""
    if parent_id == child_id:
        return True
    visited = {parent_id}
    frontier = [child_id]
    for _ in range(max_depth):
        if not frontier:
            break
        next_frontier = []
        try:
            links = db.query(AgentLink).filter(
                AgentLink.parent_workspace_id.in_(frontier),
                AgentLink.tenant_id == tenant_id,
            ).all()
        except Exception:
            break
        for link in links:
            if link.child_workspace_id in visited:
                return True
            visited.add(link.child_workspace_id)
            next_frontier.append(link.child_workspace_id)
        frontier = next_frontier
    return False


@router.get("/{agent_id}/links")
def list_agent_links(agent_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """List sub-agent links for an agent."""
    try:
        links = db.query(AgentLink).filter(
            AgentLink.parent_workspace_id == agent_id,
            AgentLink.tenant_id == user.tenant_id,
        ).order_by(AgentLink.created_at.desc()).all()
    except Exception:
        return {"links": []}

    result = []
    for link in links:
        child = db.query(Workspace).filter(Workspace.id == link.child_workspace_id).first()
        result.append({
            "id": link.id,
            "child_agent_id": link.child_workspace_id,
            "child_agent_name": child.name if child else "Unknown",
            "child_agent_icon": (child.agent_icon or "") if child else "",
            "tool_name": link.tool_name,
            "tool_description": link.tool_description,
            "is_enabled": link.is_enabled,
            "created_at": link.created_at.isoformat() if link.created_at else "",
        })
    return {"links": result}


@router.post("/{agent_id}/links")
async def create_agent_link(
    agent_id: str, request: Request,
    user: User = Depends(get_current_user), db: Session = Depends(get_db),
):
    """Link a sub-agent to this agent."""
    body = await request.json()
    child_agent_id = body.get("child_agent_id", "")
    tool_name = body.get("tool_name", "").strip()
    tool_description = body.get("tool_description", "").strip()

    if not child_agent_id or not tool_name or not tool_description:
        return JSONResponse({"error": "child_agent_id, tool_name, and tool_description are required"}, status_code=400)

    if len(tool_name) > 64:
        return JSONResponse({"error": "tool_name must be 64 characters or less"}, status_code=400)

    # Verify parent exists and belongs to tenant
    parent = db.query(Workspace).filter(
        Workspace.id == agent_id, Workspace.tenant_id == user.tenant_id,
        Workspace.agent_type.isnot(None),
    ).first()
    if not parent:
        return JSONResponse({"error": "Agent not found"}, status_code=404)

    # Verify child exists and belongs to same tenant
    child = db.query(Workspace).filter(
        Workspace.id == child_agent_id, Workspace.tenant_id == user.tenant_id,
        Workspace.agent_type.isnot(None),
    ).first()
    if not child:
        return JSONResponse({"error": "Sub-agent not found"}, status_code=404)

    # Prevent self-link and circular references
    if _has_circular_ref(db, agent_id, child_agent_id, user.tenant_id):
        return JSONResponse({"error": "Cannot create circular agent references"}, status_code=400)

    # Check for existing link
    existing = db.query(AgentLink).filter(
        AgentLink.parent_workspace_id == agent_id,
        AgentLink.child_workspace_id == child_agent_id,
    ).first()
    if existing:
        return JSONResponse({"error": "This sub-agent is already linked"}, status_code=400)

    link = AgentLink(
        parent_workspace_id=agent_id,
        child_workspace_id=child_agent_id,
        tenant_id=user.tenant_id,
        tool_name=tool_name,
        tool_description=tool_description,
    )
    db.add(link)
    db.commit()
    db.refresh(link)

    return {
        "id": link.id,
        "child_agent_id": link.child_workspace_id,
        "child_agent_name": child.name,
        "child_agent_icon": child.agent_icon or "",
        "tool_name": link.tool_name,
        "tool_description": link.tool_description,
        "is_enabled": link.is_enabled,
    }


@router.put("/{agent_id}/links/{link_id}")
async def update_agent_link(
    agent_id: str, link_id: str, request: Request,
    user: User = Depends(get_current_user), db: Session = Depends(get_db),
):
    """Update a sub-agent link."""
    link = db.query(AgentLink).filter(
        AgentLink.id == link_id,
        AgentLink.parent_workspace_id == agent_id,
        AgentLink.tenant_id == user.tenant_id,
    ).first()
    if not link:
        return JSONResponse({"error": "Link not found"}, status_code=404)

    body = await request.json()
    if "tool_name" in body:
        link.tool_name = body["tool_name"].strip()[:64]
    if "tool_description" in body:
        link.tool_description = body["tool_description"].strip()
    if "is_enabled" in body:
        link.is_enabled = bool(body["is_enabled"])

    db.commit()
    return {
        "id": link.id,
        "tool_name": link.tool_name,
        "tool_description": link.tool_description,
        "is_enabled": link.is_enabled,
    }


@router.delete("/{agent_id}/links/{link_id}")
def delete_agent_link(
    agent_id: str, link_id: str,
    user: User = Depends(get_current_user), db: Session = Depends(get_db),
):
    """Remove a sub-agent link."""
    link = db.query(AgentLink).filter(
        AgentLink.id == link_id,
        AgentLink.parent_workspace_id == agent_id,
        AgentLink.tenant_id == user.tenant_id,
    ).first()
    if not link:
        return JSONResponse({"error": "Link not found"}, status_code=404)

    db.delete(link)
    db.commit()
    return {"status": "deleted"}
