"""
routes/memory_routes.py -- CRUD for agent memories.

View, add, edit, and delete memories per agent.
"""
from datetime import datetime

from fastapi import APIRouter, Depends, Query as Q
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from database import get_db
from db_models import User, Workspace
from auth import get_current_user
from memory_models import AgentMemory

router = APIRouter(prefix="/api/agents", tags=["memories"])


def _verify_agent(agent_id: str, user: User, db: Session):
    ws = db.query(Workspace).filter(
        Workspace.id == agent_id,
        Workspace.tenant_id == user.tenant_id,
        Workspace.agent_type.isnot(None),
    ).first()
    return ws


@router.get("/{agent_id}/memories")
def list_memories(
    agent_id: str,
    user_id: str = Q("", alias="user_id"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ws = _verify_agent(agent_id, user, db)
    if not ws:
        return JSONResponse({"error": "Agent not found"}, status_code=404)

    q = db.query(AgentMemory).filter(
        AgentMemory.workspace_id == agent_id,
        AgentMemory.tenant_id == user.tenant_id,
        AgentMemory.is_active == True,
    )

    # Optionally filter by user_id
    if user_id:
        q = q.filter(
            (AgentMemory.user_id == user_id) | (AgentMemory.user_id.is_(None))
        )

    memories = q.order_by(AgentMemory.created_at.desc()).limit(100).all()

    return {
        "memories": [
            {
                "id": m.id,
                "memory_type": m.memory_type,
                "content": m.content,
                "source_query": m.source_query or "",
                "confidence": m.confidence,
                "user_id": m.user_id,
                "created_at": m.created_at.isoformat() if m.created_at else None,
            }
            for m in memories
        ]
    }


@router.post("/{agent_id}/memories")
def add_memory(
    agent_id: str,
    body: dict,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ws = _verify_agent(agent_id, user, db)
    if not ws:
        return JSONResponse({"error": "Agent not found"}, status_code=404)

    content = (body.get("content") or "").strip()
    if not content:
        return JSONResponse({"error": "Content is required"}, status_code=400)

    memory_type = body.get("memory_type", "fact")
    if memory_type not in ("preference", "fact", "context", "instruction"):
        memory_type = "fact"

    memory = AgentMemory(
        workspace_id=agent_id,
        tenant_id=user.tenant_id,
        user_id=body.get("user_id") or None,
        memory_type=memory_type,
        content=content,
        source_query="manual entry",
        confidence=1.0,
    )
    db.add(memory)
    db.commit()
    db.refresh(memory)

    return {
        "id": memory.id,
        "memory_type": memory.memory_type,
        "content": memory.content,
        "confidence": memory.confidence,
        "created_at": memory.created_at.isoformat() if memory.created_at else None,
    }


@router.put("/{agent_id}/memories/{memory_id}")
def update_memory(
    agent_id: str,
    memory_id: str,
    body: dict,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ws = _verify_agent(agent_id, user, db)
    if not ws:
        return JSONResponse({"error": "Agent not found"}, status_code=404)

    memory = db.query(AgentMemory).filter(
        AgentMemory.id == memory_id,
        AgentMemory.workspace_id == agent_id,
        AgentMemory.tenant_id == user.tenant_id,
    ).first()
    if not memory:
        return JSONResponse({"error": "Memory not found"}, status_code=404)

    if "content" in body:
        content = (body["content"] or "").strip()
        if content:
            memory.content = content

    if "memory_type" in body:
        if body["memory_type"] in ("preference", "fact", "context", "instruction"):
            memory.memory_type = body["memory_type"]

    memory.updated_at = datetime.utcnow()
    db.commit()

    return {
        "id": memory.id,
        "memory_type": memory.memory_type,
        "content": memory.content,
        "confidence": memory.confidence,
    }


@router.delete("/{agent_id}/memories/{memory_id}")
def delete_memory(
    agent_id: str,
    memory_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ws = _verify_agent(agent_id, user, db)
    if not ws:
        return JSONResponse({"error": "Agent not found"}, status_code=404)

    memory = db.query(AgentMemory).filter(
        AgentMemory.id == memory_id,
        AgentMemory.workspace_id == agent_id,
        AgentMemory.tenant_id == user.tenant_id,
    ).first()
    if not memory:
        return JSONResponse({"error": "Memory not found"}, status_code=404)

    db.delete(memory)
    db.commit()

    return {"status": "deleted"}


@router.delete("/{agent_id}/memories")
def clear_memories(
    agent_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ws = _verify_agent(agent_id, user, db)
    if not ws:
        return JSONResponse({"error": "Agent not found"}, status_code=404)

    count = db.query(AgentMemory).filter(
        AgentMemory.workspace_id == agent_id,
        AgentMemory.tenant_id == user.tenant_id,
    ).delete(synchronize_session=False)
    db.commit()

    return {"status": "cleared", "count": count}
