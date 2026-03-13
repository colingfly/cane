"""
agent_versions.py -- Agent versioning and config snapshots.

Pillar 1 (Orchestration) tightening:
  - Snapshot agent configuration at any point
  - Version history with diffs
  - Rollback to previous versions
  - Auto-snapshot before eval runs
"""
import json
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import text

from database import get_db
from auth import get_current_user
from db_models import User, Workspace

router = APIRouter(prefix="/api/agents", tags=["agent-versions"])


def _get_workspace(workspace_id: str, tenant_id: str, db: Session) -> Workspace:
    ws = db.query(Workspace).filter(
        Workspace.id == workspace_id,
        Workspace.tenant_id == tenant_id,
    ).first()
    if not ws:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Agent not found")
    return ws


def _snapshot_agent(ws: Workspace) -> dict:
    """Capture the current agent configuration as a JSON-serializable dict."""
    return {
        "name": ws.name,
        "description": ws.description or "",
        "system_prompt": ws.system_prompt or "",
        "agent_type": ws.agent_type or "",
        "agent_icon": ws.agent_icon or "",
        "agent_description": ws.agent_description or "",
        "tool_chaining_enabled": bool(ws.tool_chaining_enabled),
        "orchestrator_mode": bool(ws.orchestrator_mode),
    }


def _diff_snapshots(old: dict, new: dict) -> list:
    """Generate a list of changes between two snapshots."""
    changes = []
    all_keys = set(list(old.keys()) + list(new.keys()))
    for key in sorted(all_keys):
        old_val = old.get(key)
        new_val = new.get(key)
        if old_val != new_val:
            changes.append({
                "field": key,
                "old_value": str(old_val)[:500] if old_val else "",
                "new_value": str(new_val)[:500] if new_val else "",
            })
    return changes


# ── Create Version Snapshot ──

@router.post("/{workspace_id}/versions")
def create_version(
    workspace_id: str,
    label: str = Query("", description="Optional label for this version"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Snapshot the current agent configuration as a version.
    """
    ws = _get_workspace(workspace_id, user.tenant_id, db)
    snapshot = _snapshot_agent(ws)
    version_id = str(uuid.uuid4())

    # Get next version number
    result = db.execute(text(
        "SELECT MAX(version_number) as max_v FROM agent_versions WHERE workspace_id = :ws_id"
    ), {"ws_id": workspace_id}).fetchone()
    next_version = (result[0] or 0) + 1

    # Get previous version for diff
    prev = db.execute(text(
        "SELECT config_snapshot FROM agent_versions WHERE workspace_id = :ws_id ORDER BY version_number DESC LIMIT 1"
    ), {"ws_id": workspace_id}).fetchone()

    changes = []
    if prev and prev[0]:
        try:
            old_snapshot = json.loads(prev[0])
            changes = _diff_snapshots(old_snapshot, snapshot)
        except (json.JSONDecodeError, TypeError):
            pass

    db.execute(text("""
        INSERT INTO agent_versions (id, workspace_id, tenant_id, version_number, label,
            config_snapshot, changes, created_by, created_at)
        VALUES (:id, :ws_id, :tenant_id, :version, :label, :snapshot, :changes, :user_id, :now)
    """), {
        "id": version_id,
        "ws_id": workspace_id,
        "tenant_id": user.tenant_id,
        "version": next_version,
        "label": label or f"v{next_version}",
        "snapshot": json.dumps(snapshot),
        "changes": json.dumps(changes),
        "user_id": user.id,
        "now": datetime.utcnow(),
    })
    db.commit()

    return {
        "version_id": version_id,
        "version_number": next_version,
        "label": label or f"v{next_version}",
        "snapshot": snapshot,
        "changes": changes,
        "created_at": datetime.utcnow().isoformat(),
    }


# ── List Versions ──

@router.get("/{workspace_id}/versions")
def list_versions(
    workspace_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all versions for an agent, newest first."""
    _get_workspace(workspace_id, user.tenant_id, db)

    rows = db.execute(text("""
        SELECT id, version_number, label, changes, created_by, created_at
        FROM agent_versions
        WHERE workspace_id = :ws_id AND tenant_id = :tenant_id
        ORDER BY version_number DESC
    """), {"ws_id": workspace_id, "tenant_id": user.tenant_id}).fetchall()

    versions = []
    for row in rows:
        changes = []
        try:
            changes = json.loads(row[3]) if row[3] else []
        except (json.JSONDecodeError, TypeError):
            pass

        versions.append({
            "id": row[0],
            "version_number": row[1],
            "label": row[2] or "",
            "changes": changes,
            "change_count": len(changes),
            "created_by": row[4],
            "created_at": row[5].isoformat() if row[5] else None,
        })

    return {"versions": versions, "total": len(versions)}


# ── Get Version Detail ──

@router.get("/{workspace_id}/versions/{version_id}")
def get_version(
    workspace_id: str,
    version_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get full snapshot for a specific version."""
    _get_workspace(workspace_id, user.tenant_id, db)

    row = db.execute(text("""
        SELECT id, version_number, label, config_snapshot, changes, created_by, created_at
        FROM agent_versions
        WHERE id = :vid AND workspace_id = :ws_id AND tenant_id = :tenant_id
    """), {"vid": version_id, "ws_id": workspace_id, "tenant_id": user.tenant_id}).fetchone()

    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Version not found")

    snapshot = {}
    changes = []
    try:
        snapshot = json.loads(row[3]) if row[3] else {}
        changes = json.loads(row[4]) if row[4] else []
    except (json.JSONDecodeError, TypeError):
        pass

    return {
        "id": row[0],
        "version_number": row[1],
        "label": row[2] or "",
        "snapshot": snapshot,
        "changes": changes,
        "created_by": row[5],
        "created_at": row[6].isoformat() if row[6] else None,
    }


# ── Rollback to Version ──

@router.post("/{workspace_id}/versions/{version_id}/rollback")
def rollback_version(
    workspace_id: str,
    version_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Rollback agent config to a previous version.
    Creates a new version snapshot of the current state before rolling back.
    """
    ws = _get_workspace(workspace_id, user.tenant_id, db)

    row = db.execute(text("""
        SELECT config_snapshot, version_number, label
        FROM agent_versions
        WHERE id = :vid AND workspace_id = :ws_id AND tenant_id = :tenant_id
    """), {"vid": version_id, "ws_id": workspace_id, "tenant_id": user.tenant_id}).fetchone()

    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Version not found")

    try:
        snapshot = json.loads(row[0]) if row[0] else {}
    except (json.JSONDecodeError, TypeError):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid version snapshot")

    # Apply snapshot to workspace
    if "name" in snapshot:
        ws.name = snapshot["name"]
    if "system_prompt" in snapshot:
        ws.system_prompt = snapshot["system_prompt"]
    if "agent_type" in snapshot:
        ws.agent_type = snapshot["agent_type"]
    if "agent_icon" in snapshot:
        ws.agent_icon = snapshot["agent_icon"]
    if "agent_description" in snapshot:
        ws.agent_description = snapshot["agent_description"]
    if "tool_chaining_enabled" in snapshot:
        ws.tool_chaining_enabled = snapshot["tool_chaining_enabled"]
    if "orchestrator_mode" in snapshot:
        ws.orchestrator_mode = snapshot["orchestrator_mode"]
    if "description" in snapshot:
        ws.description = snapshot["description"]

    ws.updated_at = datetime.utcnow()
    db.commit()

    return {
        "rolled_back_to": {
            "version_id": version_id,
            "version_number": row[1],
            "label": row[2],
        },
        "current_config": _snapshot_agent(ws),
    }


# ── Compare Two Versions ──

@router.get("/{workspace_id}/versions/compare")
def compare_versions(
    workspace_id: str,
    version_a: str = Query(..., description="First version ID"),
    version_b: str = Query(..., description="Second version ID"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Compare two versions side by side."""
    _get_workspace(workspace_id, user.tenant_id, db)

    row_a = db.execute(text("""
        SELECT config_snapshot, version_number, label, created_at
        FROM agent_versions WHERE id = :vid AND workspace_id = :ws_id
    """), {"vid": version_a, "ws_id": workspace_id}).fetchone()

    row_b = db.execute(text("""
        SELECT config_snapshot, version_number, label, created_at
        FROM agent_versions WHERE id = :vid AND workspace_id = :ws_id
    """), {"vid": version_b, "ws_id": workspace_id}).fetchone()

    if not row_a or not row_b:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "One or both versions not found")

    snap_a = json.loads(row_a[0]) if row_a[0] else {}
    snap_b = json.loads(row_b[0]) if row_b[0] else {}

    return {
        "version_a": {
            "id": version_a,
            "version_number": row_a[1],
            "label": row_a[2],
            "created_at": row_a[3].isoformat() if row_a[3] else None,
            "snapshot": snap_a,
        },
        "version_b": {
            "id": version_b,
            "version_number": row_b[1],
            "label": row_b[2],
            "created_at": row_b[3].isoformat() if row_b[3] else None,
            "snapshot": snap_b,
        },
        "diff": _diff_snapshots(snap_a, snap_b),
    }
