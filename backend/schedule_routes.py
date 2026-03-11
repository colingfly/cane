"""
schedule_routes.py -- CRUD endpoints for agent schedules.

Allows creating, updating, toggling, and triggering scheduled agent runs.
"""
import re
import threading
from datetime import datetime

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from database import get_db
from db_models import User, Workspace
from auth import get_current_user
from schedule_models import AgentSchedule, AgentScheduleRun
from services.schedule_runner import _compute_next_run, run_schedule

router = APIRouter(prefix="/api/agents", tags=["schedules"])


def _verify_agent(agent_id: str, user: User, db: Session):
    """Verify agent exists and belongs to user's tenant."""
    ws = db.query(Workspace).filter(
        Workspace.id == agent_id,
        Workspace.tenant_id == user.tenant_id,
        Workspace.agent_type.isnot(None),
    ).first()
    if not ws:
        return None
    return ws


# ---- List schedules for an agent ----

@router.get("/{agent_id}/schedules")
def list_schedules(
    agent_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ws = _verify_agent(agent_id, user, db)
    if not ws:
        return JSONResponse({"error": "Agent not found"}, status_code=404)

    schedules = db.query(AgentSchedule).filter(
        AgentSchedule.workspace_id == agent_id,
        AgentSchedule.tenant_id == user.tenant_id,
    ).order_by(AgentSchedule.created_at.desc()).all()

    return {
        "schedules": [
            {
                "id": s.id,
                "prompt": s.prompt,
                "schedule_type": s.schedule_type,
                "interval_minutes": s.interval_minutes,
                "daily_time": s.daily_time or "",
                "is_enabled": s.is_enabled,
                "last_run_at": s.last_run_at.isoformat() if s.last_run_at else None,
                "last_run_status": s.last_run_status or "",
                "next_run_at": s.next_run_at.isoformat() if s.next_run_at else None,
                "run_count": s.run_count or 0,
                "created_at": s.created_at.isoformat() if s.created_at else None,
            }
            for s in schedules
        ]
    }


# ---- Create a schedule ----

@router.post("/{agent_id}/schedules")
def create_schedule(
    agent_id: str,
    body: dict,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ws = _verify_agent(agent_id, user, db)
    if not ws:
        return JSONResponse({"error": "Agent not found"}, status_code=404)

    prompt = (body.get("prompt") or "").strip()
    if not prompt:
        return JSONResponse({"error": "Prompt is required"}, status_code=400)

    schedule_type = body.get("schedule_type", "interval")
    if schedule_type not in ("interval", "daily"):
        return JSONResponse({"error": "schedule_type must be 'interval' or 'daily'"}, status_code=400)

    interval_minutes = int(body.get("interval_minutes", 60))
    if interval_minutes < 15:
        return JSONResponse({"error": "Minimum interval is 15 minutes"}, status_code=400)

    daily_time = body.get("daily_time", "09:00")
    if schedule_type == "daily" and not re.match(r"^\d{2}:\d{2}$", daily_time):
        return JSONResponse({"error": "daily_time must be HH:MM format"}, status_code=400)

    # Limit: 1 schedule per agent (v1)
    existing = db.query(AgentSchedule).filter(
        AgentSchedule.workspace_id == agent_id,
    ).first()
    if existing:
        return JSONResponse({"error": "This agent already has a schedule. Delete or update the existing one."}, status_code=409)

    schedule = AgentSchedule(
        workspace_id=agent_id,
        tenant_id=user.tenant_id,
        prompt=prompt,
        schedule_type=schedule_type,
        interval_minutes=interval_minutes,
        daily_time=daily_time if schedule_type == "daily" else "",
        is_enabled=True,
    )
    schedule.next_run_at = _compute_next_run(schedule)

    db.add(schedule)
    db.commit()
    db.refresh(schedule)

    return {
        "id": schedule.id,
        "prompt": schedule.prompt,
        "schedule_type": schedule.schedule_type,
        "interval_minutes": schedule.interval_minutes,
        "daily_time": schedule.daily_time or "",
        "is_enabled": schedule.is_enabled,
        "next_run_at": schedule.next_run_at.isoformat() if schedule.next_run_at else None,
        "run_count": 0,
    }


# ---- Update a schedule ----

@router.put("/{agent_id}/schedules/{schedule_id}")
def update_schedule(
    agent_id: str,
    schedule_id: str,
    body: dict,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ws = _verify_agent(agent_id, user, db)
    if not ws:
        return JSONResponse({"error": "Agent not found"}, status_code=404)

    schedule = db.query(AgentSchedule).filter(
        AgentSchedule.id == schedule_id,
        AgentSchedule.workspace_id == agent_id,
        AgentSchedule.tenant_id == user.tenant_id,
    ).first()
    if not schedule:
        return JSONResponse({"error": "Schedule not found"}, status_code=404)

    changed = False

    if "prompt" in body:
        prompt = (body["prompt"] or "").strip()
        if prompt:
            schedule.prompt = prompt
            changed = True

    if "schedule_type" in body:
        if body["schedule_type"] in ("interval", "daily"):
            schedule.schedule_type = body["schedule_type"]
            changed = True

    if "interval_minutes" in body:
        val = int(body["interval_minutes"])
        if val >= 15:
            schedule.interval_minutes = val
            changed = True

    if "daily_time" in body:
        dt = body["daily_time"]
        if re.match(r"^\d{2}:\d{2}$", dt):
            schedule.daily_time = dt
            changed = True

    if "is_enabled" in body:
        schedule.is_enabled = bool(body["is_enabled"])
        changed = True

    if changed:
        # Recompute next run when schedule params change or re-enabled
        if schedule.is_enabled:
            schedule.next_run_at = _compute_next_run(schedule)
        schedule.updated_at = datetime.utcnow()
        db.commit()

    return {
        "id": schedule.id,
        "prompt": schedule.prompt,
        "schedule_type": schedule.schedule_type,
        "interval_minutes": schedule.interval_minutes,
        "daily_time": schedule.daily_time or "",
        "is_enabled": schedule.is_enabled,
        "last_run_at": schedule.last_run_at.isoformat() if schedule.last_run_at else None,
        "last_run_status": schedule.last_run_status or "",
        "next_run_at": schedule.next_run_at.isoformat() if schedule.next_run_at else None,
        "run_count": schedule.run_count or 0,
    }


# ---- Delete a schedule ----

@router.delete("/{agent_id}/schedules/{schedule_id}")
def delete_schedule(
    agent_id: str,
    schedule_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ws = _verify_agent(agent_id, user, db)
    if not ws:
        return JSONResponse({"error": "Agent not found"}, status_code=404)

    schedule = db.query(AgentSchedule).filter(
        AgentSchedule.id == schedule_id,
        AgentSchedule.workspace_id == agent_id,
        AgentSchedule.tenant_id == user.tenant_id,
    ).first()
    if not schedule:
        return JSONResponse({"error": "Schedule not found"}, status_code=404)

    # Delete runs first, then schedule
    db.query(AgentScheduleRun).filter(AgentScheduleRun.schedule_id == schedule_id).delete(synchronize_session=False)
    db.delete(schedule)
    db.commit()

    return {"status": "deleted"}


# ---- Get run history ----

@router.get("/{agent_id}/schedules/{schedule_id}/runs")
def get_schedule_runs(
    agent_id: str,
    schedule_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ws = _verify_agent(agent_id, user, db)
    if not ws:
        return JSONResponse({"error": "Agent not found"}, status_code=404)

    runs = db.query(AgentScheduleRun).filter(
        AgentScheduleRun.schedule_id == schedule_id,
        AgentScheduleRun.tenant_id == user.tenant_id,
    ).order_by(AgentScheduleRun.created_at.desc()).limit(20).all()

    return {
        "runs": [
            {
                "id": r.id,
                "prompt": r.prompt,
                "response": r.response or "",
                "status": r.status,
                "error_message": r.error_message or "",
                "duration_ms": r.duration_ms or 0,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in runs
        ]
    }


# ---- Manual trigger ----

@router.post("/{agent_id}/schedules/{schedule_id}/trigger")
def trigger_schedule(
    agent_id: str,
    schedule_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ws = _verify_agent(agent_id, user, db)
    if not ws:
        return JSONResponse({"error": "Agent not found"}, status_code=404)

    schedule = db.query(AgentSchedule).filter(
        AgentSchedule.id == schedule_id,
        AgentSchedule.workspace_id == agent_id,
        AgentSchedule.tenant_id == user.tenant_id,
    ).first()
    if not schedule:
        return JSONResponse({"error": "Schedule not found"}, status_code=404)

    if schedule.last_run_status == "running":
        return JSONResponse({"error": "Schedule is already running"}, status_code=409)

    # Spawn in background thread
    thread = threading.Thread(target=run_schedule, args=(schedule_id,), daemon=True)
    thread.start()

    return {"status": "triggered"}
