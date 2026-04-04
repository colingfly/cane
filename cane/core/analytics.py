"""
services/analytics.py — Log conversations for analytics.
"""
import json
import time
from sqlalchemy.orm import Session
from cane.core.analytics_models import ConversationLog


def log_conversation(
    db: Session,
    tenant_id: str,
    workspace_id: str,
    query: str,
    answer: str = "",
    channel: str = "internal",
    user_id: str = None,
    session_id: str = None,
    chunks_used: int = 0,
    sources: list = None,
    tools_called: list = None,
    response_time_ms: int = None,
):
    """Log a conversation for analytics. Fire-and-forget — never raises."""
    try:
        log = ConversationLog(
            tenant_id=tenant_id,
            workspace_id=workspace_id,
            user_id=user_id,
            session_id=session_id,
            channel=channel,
            query=query[:2000],
            chunks_used=chunks_used,
            answer_preview=(answer or "")[:500],
            sources_used=json.dumps(sources or []),
            tools_called=json.dumps(tools_called or []),
            response_time_ms=response_time_ms,
        )
        db.add(log)
        db.commit()
    except Exception as e:
        print(f"  [Analytics] Log failed: {e}")
        try:
            db.rollback()
        except Exception:
            pass
