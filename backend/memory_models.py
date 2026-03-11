"""
memory_models.py -- Database models for Agent Memory.

Persistent memory extracted from conversations. Agents remember
facts, preferences, and instructions across sessions.
"""
import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, Float, Boolean, DateTime, ForeignKey
from database import Base


def _uuid():
    return str(uuid.uuid4())


class AgentMemory(Base):
    """A single extracted memory for an agent, optionally scoped to a user."""
    __tablename__ = "agent_memories"

    id = Column(String(36), primary_key=True, default=_uuid)
    workspace_id = Column(String(36), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    tenant_id = Column(String(36), ForeignKey("tenants.id"), nullable=False)
    user_id = Column(String(36), nullable=True)           # null = global agent memory

    # Memory content
    memory_type = Column(String(50), default="fact")       # preference | fact | context | instruction
    content = Column(Text, nullable=False)                 # the actual memory text
    source_query = Column(Text, default="")                # conversation that produced this

    # Quality
    confidence = Column(Float, default=1.0)                # 0.0 to 1.0

    # Lifecycle
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f"<AgentMemory {self.id[:8]} type={self.memory_type}>"
