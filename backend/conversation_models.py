"""
conversation_models.py -- Database models for persistent conversation history.

Stores threaded conversations per agent with full message history.
"""
import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, Integer, Boolean, DateTime, ForeignKey
from database import Base


def _uuid():
    return str(uuid.uuid4())


class Conversation(Base):
    """A conversation thread with an agent."""
    __tablename__ = "conversations"

    id = Column(String(36), primary_key=True, default=_uuid)
    workspace_id = Column(String(36), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    tenant_id = Column(String(36), ForeignKey("tenants.id"), nullable=False)
    user_id = Column(String(36), nullable=True)
    session_id = Column(String(100), nullable=True)

    title = Column(String(500), default="")
    channel = Column(String(20), default="internal")       # "internal" | "api" | "widget"
    message_count = Column(Integer, default=0)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f"<Conversation {self.id[:8]} msgs={self.message_count}>"


class ConversationMessage(Base):
    """A single message within a conversation."""
    __tablename__ = "conversation_messages"

    id = Column(String(36), primary_key=True, default=_uuid)
    conversation_id = Column(String(36), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False)
    role = Column(String(20), nullable=False)               # "user" | "assistant"
    content = Column(Text, nullable=False)
    sources = Column(Text, nullable=True)                    # JSON array of source filenames
    chunks_used = Column(Integer, default=0)
    response_time_ms = Column(Integer, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f"<ConversationMessage {self.id[:8]} role={self.role}>"
