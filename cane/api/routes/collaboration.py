"""
routes/collaboration.py -- Agent network and communication endpoints.

Provides the data for the Agent Network visualization page:
nodes (agents), edges (links), and inter-agent communication logs.
"""
from fastapi import APIRouter, Query, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import func

from cane.core.database import get_db
from cane.core.models import User, Workspace
from cane.tools.models import AgentLink, AgentCommunication
from cane.auth.jwt import get_current_user

router = APIRouter(prefix="/api/agents", tags=["collaboration"])


@router.get("/network")
def get_agent_network(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return all agents (nodes), links (edges), and communication stats for the tenant."""

    # Nodes: all agents in the tenant
    agents = db.query(Workspace).filter(
        Workspace.tenant_id == user.tenant_id,
        Workspace.agent_type.isnot(None),
    ).all()

    nodes = [
        {
            "id": a.id,
            "name": a.name,
            "icon": a.agent_icon or "",
            "description": a.agent_description or a.description or "",
            "agent_type": a.agent_type or "custom",
            "orchestrator_mode": getattr(a, "orchestrator_mode", False) or False,
        }
        for a in agents
    ]

    # Edges: all agent links in the tenant
    try:
        links = db.query(AgentLink).filter(
            AgentLink.tenant_id == user.tenant_id,
        ).all()
    except Exception:
        links = []

    # Communication counts per pair
    pair_counts = {}
    pair_durations = {}
    try:
        rows = db.query(
            AgentCommunication.parent_agent_id,
            AgentCommunication.child_agent_id,
            func.count(AgentCommunication.id).label("cnt"),
            func.avg(AgentCommunication.duration_ms).label("avg_ms"),
        ).filter(
            AgentCommunication.tenant_id == user.tenant_id,
        ).group_by(
            AgentCommunication.parent_agent_id,
            AgentCommunication.child_agent_id,
        ).all()
        for row in rows:
            key = (row.parent_agent_id, row.child_agent_id)
            pair_counts[key] = row.cnt
            pair_durations[key] = int(row.avg_ms or 0)
    except Exception:
        pass

    edges = [
        {
            "id": link.id,
            "source": link.parent_workspace_id,
            "target": link.child_workspace_id,
            "tool_name": link.tool_name,
            "comm_count": pair_counts.get((link.parent_workspace_id, link.child_workspace_id), 0),
            "avg_duration_ms": pair_durations.get((link.parent_workspace_id, link.child_workspace_id), 0),
        }
        for link in links
    ]

    # Also add edges for orchestrator auto-discovered pairs (no AgentLink)
    linked_pairs = {(link.parent_workspace_id, link.child_workspace_id) for link in links}
    for (parent_id, child_id), cnt in pair_counts.items():
        if (parent_id, child_id) not in linked_pairs:
            edges.append({
                "id": f"auto_{parent_id}_{child_id}"[:36],
                "source": parent_id,
                "target": child_id,
                "tool_name": "auto",
                "comm_count": cnt,
                "avg_duration_ms": pair_durations.get((parent_id, child_id), 0),
            })

    # Aggregate stats
    total_comms = sum(pair_counts.values())
    all_durations = [pair_durations[k] for k in pair_durations if pair_durations[k] > 0]
    avg_response_ms = int(sum(all_durations) / len(all_durations)) if all_durations else 0

    return {
        "nodes": nodes,
        "edges": edges,
        "stats": {
            "total_communications": total_comms,
            "avg_response_ms": avg_response_ms,
        },
    }


@router.get("/{agent_id}/communications")
def get_agent_communications(
    agent_id: str,
    limit: int = Query(50, ge=1, le=200),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return recent communications for a specific agent (as parent or child)."""
    from sqlalchemy import or_

    try:
        comms = db.query(AgentCommunication).filter(
            AgentCommunication.tenant_id == user.tenant_id,
            or_(
                AgentCommunication.parent_agent_id == agent_id,
                AgentCommunication.child_agent_id == agent_id,
            ),
        ).order_by(AgentCommunication.created_at.desc()).limit(limit).all()

        # Build agent name lookup
        agent_ids = set()
        for c in comms:
            agent_ids.add(c.parent_agent_id)
            agent_ids.add(c.child_agent_id)
        agent_ids.discard("")

        name_map = {}
        if agent_ids:
            agents = db.query(Workspace).filter(Workspace.id.in_(agent_ids)).all()
            name_map = {a.id: {"name": a.name, "icon": a.agent_icon or ""} for a in agents}

        return {
            "communications": [
                {
                    "id": c.id,
                    "parent_agent_id": c.parent_agent_id,
                    "parent_name": name_map.get(c.parent_agent_id, {}).get("name", "Unknown"),
                    "child_agent_id": c.child_agent_id,
                    "child_name": name_map.get(c.child_agent_id, {}).get("name", "Unknown"),
                    "child_icon": name_map.get(c.child_agent_id, {}).get("icon", ""),
                    "query_sent": c.query_sent or "",
                    "response_preview": (c.response_received or "")[:300],
                    "duration_ms": c.duration_ms or 0,
                    "status": c.status or "ok",
                    "depth_level": c.depth_level or 0,
                    "created_at": c.created_at.isoformat() if c.created_at else None,
                }
                for c in comms
            ]
        }
    except Exception as e:
        print(f"  [Collaboration] Communications query failed: {e}")
        return {"communications": []}
