"""
conversation_routes.py -- CRUD endpoints for conversation history.

Allows listing, viewing, and deleting conversation threads per agent.
"""
from fastapi import APIRouter, Query, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from cane.core.database import get_db
from cane.core.models import User, Workspace
from cane.auth.jwt import get_current_user
from cane.agents.conversation_models import Conversation, ConversationMessage

router = APIRouter(prefix="/api/agents", tags=["conversations"])


def _verify_agent(agent_id: str, user: User, db: Session):
    """Verify agent exists and belongs to user's tenant."""
    ws = db.query(Workspace).filter(
        Workspace.id == agent_id,
        Workspace.tenant_id == user.tenant_id,
        Workspace.agent_type.isnot(None),
    ).first()
    return ws


# ---- List conversations for an agent ----

@router.get("/{agent_id}/conversations")
def list_conversations(
    agent_id: str,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ws = _verify_agent(agent_id, user, db)
    if not ws:
        return JSONResponse({"error": "Agent not found"}, status_code=404)

    total = db.query(Conversation).filter(
        Conversation.workspace_id == agent_id,
        Conversation.tenant_id == user.tenant_id,
    ).count()

    conversations = db.query(Conversation).filter(
        Conversation.workspace_id == agent_id,
        Conversation.tenant_id == user.tenant_id,
    ).order_by(Conversation.updated_at.desc()).offset(offset).limit(limit).all()

    return {
        "total": total,
        "conversations": [
            {
                "id": c.id,
                "title": c.title or "Untitled",
                "channel": c.channel or "internal",
                "message_count": c.message_count or 0,
                "created_at": c.created_at.isoformat() if c.created_at else None,
                "updated_at": c.updated_at.isoformat() if c.updated_at else None,
            }
            for c in conversations
        ]
    }


# ---- Get a conversation with messages ----

@router.get("/{agent_id}/conversations/{conv_id}")
def get_conversation(
    agent_id: str,
    conv_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ws = _verify_agent(agent_id, user, db)
    if not ws:
        return JSONResponse({"error": "Agent not found"}, status_code=404)

    conv = db.query(Conversation).filter(
        Conversation.id == conv_id,
        Conversation.workspace_id == agent_id,
        Conversation.tenant_id == user.tenant_id,
    ).first()
    if not conv:
        return JSONResponse({"error": "Conversation not found"}, status_code=404)

    messages = db.query(ConversationMessage).filter(
        ConversationMessage.conversation_id == conv_id,
    ).order_by(ConversationMessage.created_at.asc()).all()

    return {
        "conversation": {
            "id": conv.id,
            "title": conv.title or "Untitled",
            "channel": conv.channel or "internal",
            "message_count": conv.message_count or 0,
            "created_at": conv.created_at.isoformat() if conv.created_at else None,
            "updated_at": conv.updated_at.isoformat() if conv.updated_at else None,
        },
        "messages": [
            {
                "id": m.id,
                "role": m.role,
                "content": m.content,
                "sources": m.sources or "[]",
                "chunks_used": m.chunks_used or 0,
                "response_time_ms": m.response_time_ms,
                "created_at": m.created_at.isoformat() if m.created_at else None,
            }
            for m in messages
        ]
    }


# ---- Delete a single conversation ----

@router.delete("/{agent_id}/conversations/{conv_id}")
def delete_conversation(
    agent_id: str,
    conv_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ws = _verify_agent(agent_id, user, db)
    if not ws:
        return JSONResponse({"error": "Agent not found"}, status_code=404)

    conv = db.query(Conversation).filter(
        Conversation.id == conv_id,
        Conversation.workspace_id == agent_id,
        Conversation.tenant_id == user.tenant_id,
    ).first()
    if not conv:
        return JSONResponse({"error": "Conversation not found"}, status_code=404)

    # CASCADE handles messages
    db.delete(conv)
    db.commit()
    return {"status": "deleted"}


# ---- Clear all conversations for an agent ----

@router.delete("/{agent_id}/conversations")
def clear_conversations(
    agent_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ws = _verify_agent(agent_id, user, db)
    if not ws:
        return JSONResponse({"error": "Agent not found"}, status_code=404)

    # Delete messages first (in case CASCADE isn't working on all DBs)
    conv_ids = [c.id for c in db.query(Conversation).filter(
        Conversation.workspace_id == agent_id,
        Conversation.tenant_id == user.tenant_id,
    ).all()]

    if conv_ids:
        db.query(ConversationMessage).filter(
            ConversationMessage.conversation_id.in_(conv_ids)
        ).delete(synchronize_session=False)
        db.query(Conversation).filter(
            Conversation.id.in_(conv_ids)
        ).delete(synchronize_session=False)
        db.commit()

    return {"status": "cleared", "deleted": len(conv_ids)}
