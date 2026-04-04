"""
analytics_models.py — Conversation logging for agent analytics.

ConversationLog tracks every query/response across all channels
(widget, internal chat, API) for per-agent usage analytics.
"""
import uuid
from datetime import datetime

from sqlalchemy import Column, String, Integer, Float, Text, DateTime, ForeignKey
from cane.core.database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class ConversationLog(Base):
    __tablename__ = "conversation_logs"

    id = Column(String(36), primary_key=True, default=_uuid)
    tenant_id = Column(String(36), ForeignKey("tenants.id"), nullable=False)
    workspace_id = Column(String(36), ForeignKey("workspaces.id"), nullable=False)
    user_id = Column(String(36), nullable=True)            # null for widget/API
    session_id = Column(String(100), nullable=True)         # group multi-turn conversations

    # Request
    channel = Column(String(20), default="internal")        # internal | widget | api
    query = Column(Text, nullable=False)
    chunks_used = Column(Integer, default=0)

    # Response
    answer_preview = Column(Text, nullable=True)                # first 500 chars
    sources_used = Column(Text, nullable=True)                  # JSON array of filenames
    tools_called = Column(Text, nullable=True)                  # JSON array of tool names invoked
    response_time_ms = Column(Integer, nullable=True)

    # Quality signals
    thumbs_up = Column(Integer, default=0)                  # 0 = no feedback, 1 = positive
    thumbs_down = Column(Integer, default=0)

    created_at = Column(DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f"<ConversationLog {self.channel} q={self.query[:40]}>"
