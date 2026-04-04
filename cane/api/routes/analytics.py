"""
analytics_routes.py — Agent analytics API.

  GET   /api/analytics/:workspace_id          — aggregate dashboard stats
  GET   /api/analytics/:workspace_id/queries  — recent conversations
  POST  /api/analytics/feedback               — thumbs up/down on a conversation
  PUT   /api/agents/:id/widget-config         — update widget appearance
  GET   /api/agents/:id/widget-config         — get widget config
"""
import json
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse
from sqlalchemy import func, cast, Date
from sqlalchemy.orm import Session

from cane.core.database import get_db
from cane.auth.jwt import get_current_user
from cane.core.models import User, Workspace
from cane.core.analytics_models import ConversationLog

router = APIRouter(prefix="/api", tags=["analytics"])


# ─── Dashboard Stats ───

@router.get("/analytics/{workspace_id}")
def get_analytics(
    workspace_id: str,
    days: int = Query(30, ge=1, le=90),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Aggregate analytics for an agent."""
    # Verify ownership
    ws = db.query(Workspace).filter(
        Workspace.id == workspace_id,
        Workspace.tenant_id == user.tenant_id,
    ).first()
    if not ws:
        return JSONResponse({"error": "Agent not found"}, status_code=404)

    since = datetime.utcnow() - timedelta(days=days)
    base = db.query(ConversationLog).filter(
        ConversationLog.workspace_id == workspace_id,
        ConversationLog.created_at >= since,
    )

    total = base.count()
    if total == 0:
        return {
            "total_conversations": 0,
            "by_channel": {},
            "by_day": [],
            "avg_response_ms": None,
            "top_queries": [],
            "feedback": {"positive": 0, "negative": 0, "none": 0},
            "tools_used": {},
        }

    # By channel
    channel_counts = dict(
        db.query(ConversationLog.channel, func.count())
        .filter(ConversationLog.workspace_id == workspace_id, ConversationLog.created_at >= since)
        .group_by(ConversationLog.channel).all()
    )

    # By day (last N days)
    daily = (
        db.query(
            cast(ConversationLog.created_at, Date).label("day"),
            func.count().label("count"),
        )
        .filter(ConversationLog.workspace_id == workspace_id, ConversationLog.created_at >= since)
        .group_by("day")
        .order_by("day")
        .all()
    )
    by_day = [{"date": str(d.day), "count": d.count} for d in daily]

    # Avg response time
    avg_ms = db.query(func.avg(ConversationLog.response_time_ms)).filter(
        ConversationLog.workspace_id == workspace_id,
        ConversationLog.created_at >= since,
        ConversationLog.response_time_ms.isnot(None),
    ).scalar()

    # Recent queries (last 50)
    recent = (
        base.order_by(ConversationLog.created_at.desc())
        .limit(50)
        .all()
    )
    top_queries = [
        {
            "id": r.id,
            "query": r.query[:200],
            "answer_preview": (r.answer_preview or "")[:200],
            "channel": r.channel,
            "chunks_used": r.chunks_used,
            "response_time_ms": r.response_time_ms,
            "tools_called": json.loads(r.tools_called or "[]"),
            "thumbs_up": r.thumbs_up,
            "thumbs_down": r.thumbs_down,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in recent
    ]

    # Feedback summary
    positive = base.filter(ConversationLog.thumbs_up > 0).count()
    negative = base.filter(ConversationLog.thumbs_down > 0).count()

    # Tool usage
    tools_used = {}
    tool_rows = base.filter(ConversationLog.tools_called != "[]").all()
    for row in tool_rows:
        for tool in json.loads(row.tools_called or "[]"):
            tools_used[tool] = tools_used.get(tool, 0) + 1

    return {
        "total_conversations": total,
        "by_channel": channel_counts,
        "by_day": by_day,
        "avg_response_ms": round(avg_ms) if avg_ms else None,
        "top_queries": top_queries,
        "feedback": {"positive": positive, "negative": negative, "none": total - positive - negative},
        "tools_used": tools_used,
    }


# ─── Feedback ───

@router.post("/analytics/feedback")
def submit_feedback(
    conversation_id: str = Query(...),
    vote: str = Query(...),  # "up" or "down"
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Submit thumbs up/down for a conversation."""
    log = db.query(ConversationLog).filter(
        ConversationLog.id == conversation_id,
        ConversationLog.tenant_id == user.tenant_id,
    ).first()
    if not log:
        return JSONResponse({"error": "Conversation not found"}, status_code=404)

    if vote == "up":
        log.thumbs_up = 1
        log.thumbs_down = 0
    elif vote == "down":
        log.thumbs_up = 0
        log.thumbs_down = 1

    db.commit()
    return {"status": "ok"}


# ─── Widget Config ───

@router.get("/agents/{workspace_id}/widget-config")
def get_widget_config(
    workspace_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ws = db.query(Workspace).filter(
        Workspace.id == workspace_id,
        Workspace.tenant_id == user.tenant_id,
    ).first()
    if not ws:
        return JSONResponse({"error": "Agent not found"}, status_code=404)

    # Read via raw SQL since column may not exist yet
    try:
        from sqlalchemy import text
        row = db.execute(
            text("SELECT widget_config FROM workspaces WHERE id = :wid"),
            {"wid": workspace_id},
        ).first()
        config = json.loads(row[0] or "{}") if row and row[0] else {}
    except Exception:
        config = {}

    return {"config": config}


@router.put("/agents/{workspace_id}/widget-config")
async def update_widget_config(
    workspace_id: str,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ws = db.query(Workspace).filter(
        Workspace.id == workspace_id,
        Workspace.tenant_id == user.tenant_id,
    ).first()
    if not ws:
        return JSONResponse({"error": "Agent not found"}, status_code=404)

    try:
        body = await request.json()
    except Exception:
        body = {}

    # Write via raw SQL since column may not exist yet
    try:
        from sqlalchemy import text
        db.execute(
            text("UPDATE workspaces SET widget_config = :cfg WHERE id = :wid"),
            {"cfg": json.dumps(body), "wid": workspace_id},
        )
        db.commit()
    except Exception as e:
        return JSONResponse({"error": f"widget_config column not available: {e}"}, status_code=500)

    return {"status": "ok", "config": body}
