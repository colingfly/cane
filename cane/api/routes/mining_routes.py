"""
mining_routes.py -- Internal API endpoints for failure mining.

Lets authenticated users trigger mining jobs, view results,
and export mined training data.
"""
import json
from datetime import datetime
from collections import Counter

from fastapi import APIRouter, Depends, HTTPException, Query, status, BackgroundTasks
from fastapi.responses import Response
from sqlalchemy.orm import Session

from cane.core.database import get_db, SessionLocal
from cane.auth.jwt import get_current_user
from cane.core.models import User
from cane.eval.models import Environment, EvalRun, MiningJob, MinedExample

router = APIRouter(prefix="/api/environments", tags=["failure-mining"])


# ── Trigger mining job ──

@router.post("/{env_id}/mine", status_code=202)
def trigger_mining(
    env_id: str,
    min_score: float = Query(0, ge=0, le=100),
    max_score: float = Query(60, ge=0, le=100),
    run_ids: str = Query(None, description="JSON array of run IDs to mine"),
    strategy: str = Query("llm_rewrite"),
    max_examples: int = Query(100, ge=1, le=500),
    background_tasks: BackgroundTasks = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Trigger a failure mining job for an environment."""
    env = db.query(Environment).filter(
        Environment.id == env_id,
        Environment.tenant_id == user.tenant_id,
        Environment.is_active == True,
    ).first()
    if not env:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Environment not found")

    # Check for already-running mining job
    active = db.query(MiningJob).filter(
        MiningJob.environment_id == env.id,
        MiningJob.tenant_id == user.tenant_id,
        MiningJob.status.in_(["pending", "running"]),
    ).first()
    if active:
        raise HTTPException(status.HTTP_409_CONFLICT, "A mining job is already running for this environment")

    # Validate at least one completed run exists
    completed_runs = db.query(EvalRun).filter(
        EvalRun.environment_id == env.id,
        EvalRun.status == "completed",
    ).count()
    if completed_runs == 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No completed eval runs to mine")

    # Parse optional run_ids
    source_run_ids = None
    if run_ids:
        try:
            source_run_ids = json.loads(run_ids)
        except json.JSONDecodeError:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "run_ids must be a valid JSON array")

    config = json.dumps({
        "min_score": min_score,
        "max_score": max_score,
        "strategy": strategy,
        "max_examples": max_examples,
    })

    job = MiningJob(
        environment_id=env.id,
        tenant_id=user.tenant_id,
        status="pending",
        source_run_ids=json.dumps(source_run_ids) if source_run_ids else None,
        config=config,
        created_by=user.id,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    # Kick off in background
    from cane.eval.mining import execute_mining_job

    def _run_mining():
        session = SessionLocal()
        try:
            execute_mining_job(job.id, session)
        finally:
            session.close()

    background_tasks.add_task(_run_mining)

    return {
        "job_id": job.id,
        "status": "pending",
        "environment_id": env.id,
        "config": json.loads(config),
    }


# ── List mining jobs ──

@router.get("/{env_id}/mining-jobs")
def list_mining_jobs(
    env_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all mining jobs for an environment."""
    env = db.query(Environment).filter(
        Environment.id == env_id,
        Environment.tenant_id == user.tenant_id,
        Environment.is_active == True,
    ).first()
    if not env:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Environment not found")

    jobs = db.query(MiningJob).filter(
        MiningJob.environment_id == env.id,
        MiningJob.tenant_id == user.tenant_id,
    ).order_by(MiningJob.created_at.desc()).all()

    return {
        "jobs": [
            {
                "id": j.id,
                "status": j.status,
                "total_failures": j.total_failures,
                "total_mined": j.total_mined,
                "config": json.loads(j.config) if j.config else {},
                "error_message": j.error_message,
                "created_at": j.created_at.isoformat() if j.created_at else None,
                "completed_at": j.completed_at.isoformat() if j.completed_at else None,
            }
            for j in jobs
        ],
    }


# ── Get mining job detail ──

@router.get("/{env_id}/mining-jobs/{job_id}")
def get_mining_job(
    env_id: str,
    job_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get mining job detail with all mined examples."""
    job = db.query(MiningJob).filter(
        MiningJob.id == job_id,
        MiningJob.environment_id == env_id,
        MiningJob.tenant_id == user.tenant_id,
    ).first()
    if not job:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Mining job not found")

    examples = db.query(MinedExample).filter(
        MinedExample.mining_job_id == job.id,
    ).order_by(MinedExample.created_at).all()

    # Failure type distribution
    type_counts = Counter(ex.failure_type for ex in examples)

    return {
        "id": job.id,
        "status": job.status,
        "total_failures": job.total_failures,
        "total_mined": job.total_mined,
        "config": json.loads(job.config) if job.config else {},
        "error_message": job.error_message,
        "created_at": job.created_at.isoformat() if job.created_at else None,
        "completed_at": job.completed_at.isoformat() if job.completed_at else None,
        "failure_type_distribution": dict(type_counts),
        "examples": [
            {
                "id": ex.id,
                "failure_type": ex.failure_type,
                "prompt": ex.prompt,
                "original_answer": ex.original_answer,
                "improved_answer": ex.improved_answer,
                "improvement_reasoning": ex.improvement_reasoning,
                "expected_answer": ex.expected_answer,
                "original_score": ex.original_score,
                "estimated_improved_score": ex.estimated_improved_score,
            }
            for ex in examples
        ],
    }


# ── Export mined data ──

@router.get("/{env_id}/mining-jobs/{job_id}/export")
def export_mining_job(
    env_id: str,
    job_id: str,
    format: str = Query("dpo", regex="^(dpo|sft)$"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Export mined examples as JSONL training data."""
    job = db.query(MiningJob).filter(
        MiningJob.id == job_id,
        MiningJob.environment_id == env_id,
        MiningJob.tenant_id == user.tenant_id,
    ).first()
    if not job:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Mining job not found")

    if job.status != "completed":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Mining job must be completed before exporting")

    from cane.eval.mining import export_mined_examples
    content = export_mined_examples(job.id, db, format)

    return Response(
        content=content,
        media_type="application/jsonl",
        headers={
            "Content-Disposition": f'attachment; filename="mined_{format}_{datetime.utcnow().strftime("%Y%m%d_%H%M%S")}.jsonl"',
        },
    )


# ── Delete mining job ──

@router.delete("/{env_id}/mining-jobs/{job_id}")
def delete_mining_job(
    env_id: str,
    job_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a mining job and all its mined examples."""
    job = db.query(MiningJob).filter(
        MiningJob.id == job_id,
        MiningJob.environment_id == env_id,
        MiningJob.tenant_id == user.tenant_id,
    ).first()
    if not job:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Mining job not found")

    if job.status in ("pending", "running"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot delete a running mining job")

    db.delete(job)
    db.commit()

    return {"deleted": True}
