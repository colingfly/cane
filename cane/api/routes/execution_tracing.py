"""
execution_tracing.py -- Execution tracing for agent networks.

Pillar 1 (Orchestration) tightening:
  - View agent-to-agent call traces
  - Latency per hop in multi-agent flows
  - Trace depth visualization
  - Session-level flow reconstruction
  - Performance hotspot detection
"""
import json
from collections import defaultdict
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import text

from cane.core.database import get_db
from cane.auth.jwt import get_current_user
from cane.core.models import User, Workspace

router = APIRouter(prefix="/api/agents", tags=["execution-tracing"])


# ── Get Agent Traces ──

@router.get("/{workspace_id}/traces")
def get_agent_traces(
    workspace_id: str,
    limit: int = Query(50, ge=1, le=200),
    days: int = Query(7, ge=1, le=90),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get execution traces for an agent. Shows all inter-agent calls
    where this agent was the parent (orchestrator) or child (called agent).
    """
    ws = db.query(Workspace).filter(
        Workspace.id == workspace_id,
        Workspace.tenant_id == user.tenant_id,
    ).first()
    if not ws:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Agent not found")

    cutoff = datetime.utcnow() - timedelta(days=days)

    # Get traces where this agent is parent or child
    rows = db.execute(text("""
        SELECT c.id, c.parent_agent_id, c.child_agent_id, c.session_id,
               c.query_sent, c.response_received, c.depth_level,
               c.duration_ms, c.status, c.error_message, c.created_at,
               pw.name as parent_name, pw.agent_icon as parent_icon,
               cw.name as child_name, cw.agent_icon as child_icon
        FROM agent_communications c
        LEFT JOIN workspaces pw ON pw.id = c.parent_agent_id
        LEFT JOIN workspaces cw ON cw.id = c.child_agent_id
        WHERE c.tenant_id = :tenant_id
          AND (c.parent_agent_id = :ws_id OR c.child_agent_id = :ws_id)
          AND c.created_at >= :cutoff
        ORDER BY c.created_at DESC
        LIMIT :limit
    """), {
        "tenant_id": user.tenant_id,
        "ws_id": workspace_id,
        "cutoff": cutoff,
        "limit": limit,
    }).fetchall()

    traces = []
    for row in rows:
        traces.append({
            "id": row[0],
            "parent_agent_id": row[1],
            "child_agent_id": row[2],
            "session_id": row[3] or "",
            "query": (row[4] or "")[:300],
            "response_preview": (row[5] or "")[:300],
            "depth": row[6] or 0,
            "duration_ms": row[7] or 0,
            "status": row[8] or "ok",
            "error": row[9] or "",
            "created_at": row[10].isoformat() if row[10] else None,
            "parent_name": row[11] or "Unknown",
            "parent_icon": row[12] or "",
            "child_name": row[13] or "Unknown",
            "child_icon": row[14] or "",
            "direction": "outbound" if row[1] == workspace_id else "inbound",
        })

    return {"traces": traces, "total": len(traces)}


# ── Get Session Trace (full flow) ──

@router.get("/{workspace_id}/traces/session/{session_id}")
def get_session_trace(
    workspace_id: str,
    session_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Reconstruct a full session trace: all agent-to-agent calls in order.
    Shows the complete execution flow for a multi-agent interaction.
    """
    ws = db.query(Workspace).filter(
        Workspace.id == workspace_id,
        Workspace.tenant_id == user.tenant_id,
    ).first()
    if not ws:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Agent not found")

    rows = db.execute(text("""
        SELECT c.id, c.parent_agent_id, c.child_agent_id, c.session_id,
               c.query_sent, c.response_received, c.depth_level,
               c.duration_ms, c.status, c.error_message, c.created_at,
               pw.name as parent_name, pw.agent_icon as parent_icon,
               cw.name as child_name, cw.agent_icon as child_icon
        FROM agent_communications c
        LEFT JOIN workspaces pw ON pw.id = c.parent_agent_id
        LEFT JOIN workspaces cw ON cw.id = c.child_agent_id
        WHERE c.tenant_id = :tenant_id
          AND c.session_id = :session_id
        ORDER BY c.created_at ASC
    """), {
        "tenant_id": user.tenant_id,
        "session_id": session_id,
    }).fetchall()

    if not rows:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")

    steps = []
    total_duration = 0
    agents_involved = set()
    max_depth = 0

    for row in rows:
        duration = row[7] or 0
        total_duration += duration
        agents_involved.add(row[1])
        agents_involved.add(row[2])
        max_depth = max(max_depth, row[6] or 0)

        steps.append({
            "id": row[0],
            "parent_agent_id": row[1],
            "child_agent_id": row[2],
            "parent_name": row[11] or "Unknown",
            "parent_icon": row[12] or "",
            "child_name": row[13] or "Unknown",
            "child_icon": row[14] or "",
            "query": row[4] or "",
            "response": row[5] or "",
            "depth": row[6] or 0,
            "duration_ms": duration,
            "status": row[8] or "ok",
            "error": row[9] or "",
            "created_at": row[10].isoformat() if row[10] else None,
        })

    return {
        "session_id": session_id,
        "steps": steps,
        "total_steps": len(steps),
        "total_duration_ms": total_duration,
        "agents_involved": len(agents_involved),
        "max_depth": max_depth,
    }


# ── Trace Analytics ──

@router.get("/{workspace_id}/traces/analytics")
def get_trace_analytics(
    workspace_id: str,
    days: int = Query(30, ge=1, le=90),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Analytics for agent execution traces:
    - Call volume over time
    - Average latency per child agent
    - Error rates
    - Most called agents
    - Performance hotspots
    """
    ws = db.query(Workspace).filter(
        Workspace.id == workspace_id,
        Workspace.tenant_id == user.tenant_id,
    ).first()
    if not ws:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Agent not found")

    cutoff = datetime.utcnow() - timedelta(days=days)

    rows = db.execute(text("""
        SELECT c.child_agent_id, c.duration_ms, c.status, c.depth_level,
               c.created_at, cw.name as child_name, cw.agent_icon as child_icon
        FROM agent_communications c
        LEFT JOIN workspaces cw ON cw.id = c.child_agent_id
        WHERE c.tenant_id = :tenant_id
          AND c.parent_agent_id = :ws_id
          AND c.created_at >= :cutoff
    """), {
        "tenant_id": user.tenant_id,
        "ws_id": workspace_id,
        "cutoff": cutoff,
    }).fetchall()

    if not rows:
        return {
            "workspace_id": workspace_id,
            "total_calls": 0,
            "has_data": False,
        }

    # Aggregate by child agent
    by_agent = defaultdict(lambda: {
        "name": "Unknown", "icon": "", "calls": 0,
        "total_ms": 0, "errors": 0, "latencies": [],
    })

    daily_counts = defaultdict(int)
    total_errors = 0

    for row in rows:
        child_id = row[0]
        duration = row[1] or 0
        status = row[2] or "ok"
        created = row[4]

        by_agent[child_id]["name"] = row[5] or "Unknown"
        by_agent[child_id]["icon"] = row[6] or ""
        by_agent[child_id]["calls"] += 1
        by_agent[child_id]["total_ms"] += duration
        by_agent[child_id]["latencies"].append(duration)

        if status != "ok":
            by_agent[child_id]["errors"] += 1
            total_errors += 1

        if created:
            day = created.strftime("%Y-%m-%d")
            daily_counts[day] += 1

    # Build agent stats
    agent_stats = []
    for agent_id, data in by_agent.items():
        lats = data["latencies"]
        agent_stats.append({
            "agent_id": agent_id,
            "name": data["name"],
            "icon": data["icon"],
            "total_calls": data["calls"],
            "avg_latency_ms": round(data["total_ms"] / data["calls"]) if data["calls"] else 0,
            "p95_latency_ms": round(sorted(lats)[int(len(lats) * 0.95)] if lats else 0),
            "error_rate": round(data["errors"] / data["calls"] * 100, 1) if data["calls"] else 0,
            "total_time_ms": data["total_ms"],
        })

    # Sort by total calls
    agent_stats.sort(key=lambda x: x["total_calls"], reverse=True)

    # Daily volume (sorted by date)
    volume = [{"date": d, "calls": c} for d, c in sorted(daily_counts.items())]

    return {
        "workspace_id": workspace_id,
        "has_data": True,
        "total_calls": len(rows),
        "total_errors": total_errors,
        "error_rate": round(total_errors / len(rows) * 100, 1) if rows else 0,
        "avg_latency_ms": round(sum(r[1] or 0 for r in rows) / len(rows)) if rows else 0,
        "agent_breakdown": agent_stats,
        "daily_volume": volume[-30:],
        "hotspots": [a for a in agent_stats if a["avg_latency_ms"] > 3000 or a["error_rate"] > 10],
    }
