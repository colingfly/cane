"""
rca_routes.py -- Internal API endpoints for Root Cause Analysis.

Lets authenticated users run AI-powered root cause analysis on eval failures
to get actionable insights and recommendations.
"""
import json

from fastapi import APIRouter, Depends, HTTPException, Query, status, BackgroundTasks
from sqlalchemy.orm import Session

from cane.core.database import get_db, SessionLocal
from cane.auth.jwt import get_current_user
from cane.core.models import User
from cane.eval.models import Environment, EvalRun, EvalResult

router = APIRouter(prefix="/api/environments", tags=["root-cause-analysis"])


# ---- Batch RCA (analyze all failures) ----

@router.post("/{env_id}/rca")
def trigger_batch_rca(
    env_id: str,
    max_score: float = Query(60, ge=0, le=100),
    run_ids: str = Query(None, description="JSON array of run IDs to analyze"),
    max_failures: int = Query(30, ge=1, le=50),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Run root cause analysis across failing eval results."""
    env = db.query(Environment).filter(
        Environment.id == env_id,
        Environment.tenant_id == user.tenant_id,
        Environment.is_active == True,
    ).first()
    if not env:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Environment not found")

    # Check at least one completed run exists
    completed = db.query(EvalRun).filter(
        EvalRun.environment_id == env.id,
        EvalRun.status == "completed",
    ).count()
    if completed == 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No completed eval runs to analyze")

    # Parse optional run_ids
    parsed_run_ids = None
    if run_ids:
        try:
            parsed_run_ids = json.loads(run_ids)
        except json.JSONDecodeError:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "run_ids must be a valid JSON array")

    from cane.eval.rca import run_batch_rca
    result = run_batch_rca(
        environment_id=env.id,
        db=db,
        run_ids=parsed_run_ids,
        max_score=max_score,
        max_failures=max_failures,
    )

    return result


# ---- Targeted RCA (single result deep dive) ----

@router.post("/{env_id}/rca/{result_id}")
def trigger_targeted_rca(
    env_id: str,
    result_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Run deep root cause analysis on a single failing eval result."""
    env = db.query(Environment).filter(
        Environment.id == env_id,
        Environment.tenant_id == user.tenant_id,
        Environment.is_active == True,
    ).first()
    if not env:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Environment not found")

    # Verify the result belongs to this environment
    result = db.query(EvalResult).join(EvalRun).filter(
        EvalResult.id == result_id,
        EvalRun.environment_id == env.id,
    ).first()
    if not result:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Eval result not found in this environment")

    from cane.eval.rca import run_targeted_rca
    analysis = run_targeted_rca(result_id=result_id, db=db)

    return analysis
