"""
eval_api.py -- Public Eval-as-a-Service API.

Lets external developers evaluate any agent against Cane's eval suites
using API key auth. Three endpoints:

  POST /v1/eval/run      -- submit an agent for evaluation
  GET  /v1/eval/run/{id} -- get eval results
  GET  /v1/eval/suites   -- list public eval suites
"""
import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status, BackgroundTasks
from sqlalchemy.orm import Session

from database import get_db, SessionLocal
from auth import get_api_key_auth
from db_models import ApiKey
from eval_models import (
    Environment, TestCase, JudgeCriteria, JudgeCustomRule, EvalRun, EvalResult,
    MiningJob, MinedExample, EvalSchedule,
)

router = APIRouter(prefix="/v1/eval", tags=["eval-api"])


# ── List public eval suites ──

@router.get("/suites")
def list_public_suites(
    api_key: ApiKey = Depends(get_api_key_auth),
    db: Session = Depends(get_db),
):
    """List all public evaluation suites available for testing."""
    envs = db.query(Environment).filter(
        Environment.is_public == True,
        Environment.is_active == True,
    ).order_by(Environment.created_at.desc()).all()

    suites = []
    for env in envs:
        test_count = db.query(TestCase).filter(TestCase.environment_id == env.id).count()
        criteria = db.query(JudgeCriteria).filter(
            JudgeCriteria.environment_id == env.id,
            JudgeCriteria.is_enabled == True,
        ).all()

        suites.append({
            "id": env.id,
            "name": env.name,
            "description": env.description or "",
            "test_case_count": test_count,
            "criteria": [
                {"key": c.key, "label": c.label, "weight": c.weight}
                for c in criteria
            ],
        })

    return {"suites": suites}


# ── Submit agent for evaluation ──

@router.post("/run", status_code=202)
def submit_eval_run(
    environment_id: str,
    target_url: str,
    target_headers: str = "{}",
    target_payload_template: str = '{"message": "{{question}}"}',
    target_response_path: str = "response",
    background_tasks: BackgroundTasks = None,
    api_key: ApiKey = Depends(get_api_key_auth),
    db: Session = Depends(get_db),
):
    """
    Submit an external agent for evaluation against a public eval suite.
    The agent must be reachable via HTTP at target_url.
    """
    # Look up the environment
    env = db.query(Environment).filter(
        Environment.id == environment_id,
        Environment.is_active == True,
    ).first()

    if not env:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Evaluation suite not found")

    # Must be public OR belong to the API key's tenant
    if not env.is_public and env.tenant_id != api_key.tenant_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This evaluation suite is not public")

    # Validate test cases exist
    test_cases = db.query(TestCase).filter(TestCase.environment_id == env.id).all()
    if not test_cases:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Evaluation suite has no test cases")

    # Validate criteria
    enabled_criteria = db.query(JudgeCriteria).filter(
        JudgeCriteria.environment_id == env.id,
        JudgeCriteria.is_enabled == True,
    ).all()
    if not enabled_criteria:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Evaluation suite has no enabled criteria")

    total_weight = sum(c.weight for c in enabled_criteria)
    if total_weight != 100:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Criteria weights must sum to 100 (currently {total_weight})")

    # Check for already-running eval from this API key
    active = db.query(EvalRun).filter(
        EvalRun.environment_id == env.id,
        EvalRun.api_key_id == api_key.id,
        EvalRun.status.in_(["pending", "running"]),
    ).first()
    if active:
        raise HTTPException(status.HTTP_409_CONFLICT, "An evaluation is already running for this suite from your API key")

    # Override environment target config for this run
    env.target_type = "external"
    env.target_url = target_url.strip()
    env.target_headers = target_headers.strip()
    env.target_payload_template = target_payload_template
    env.target_response_path = target_response_path.strip()

    # Snapshot criteria
    criteria_snapshot = json.dumps([
        {"key": c.key, "label": c.label, "weight": c.weight, "is_enabled": True}
        for c in enabled_criteria
    ])

    # Snapshot target config
    target_snapshot = json.dumps({
        "target_type": "external",
        "target_url": target_url.strip(),
        "target_payload_template": target_payload_template,
        "target_response_path": target_response_path.strip(),
    })

    # Create run
    run = EvalRun(
        environment_id=env.id,
        tenant_id=env.tenant_id,
        status="pending",
        total_cases=len(test_cases),
        agent_prompt="(external agent via API)",
        criteria_snapshot=criteria_snapshot,
        target_snapshot=target_snapshot,
        api_key_id=api_key.id,
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    # Kick off in background
    from eval_engine import execute_eval_run

    def _run_eval():
        session = SessionLocal()
        try:
            execute_eval_run(run.id, session)
        finally:
            session.close()

    background_tasks.add_task(_run_eval)

    return {
        "run_id": run.id,
        "status": "pending",
        "total_cases": len(test_cases),
        "environment_id": env.id,
        "environment_name": env.name,
    }


# ── Get eval results ──

@router.get("/run/{run_id}")
def get_eval_results(
    run_id: str,
    api_key: ApiKey = Depends(get_api_key_auth),
    db: Session = Depends(get_db),
):
    """Get evaluation run results. Only accessible to the API key that triggered the run."""
    run = db.query(EvalRun).filter(EvalRun.id == run_id).first()

    if not run:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Run not found")

    # Must be the API key that triggered it, or belong to the same tenant
    if run.api_key_id != api_key.id and run.tenant_id != api_key.tenant_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Access denied")

    results = db.query(EvalResult).filter(
        EvalResult.eval_run_id == run.id
    ).order_by(EvalResult.created_at).all()

    return {
        "run_id": run.id,
        "environment_id": run.environment_id,
        "status": run.status,
        "overall_score": run.overall_score,
        "total_cases": run.total_cases,
        "passed": run.passed,
        "warned": run.warned,
        "failed": run.failed,
        "started_at": run.started_at.isoformat() if run.started_at else None,
        "completed_at": run.completed_at.isoformat() if run.completed_at else None,
        "error_message": run.error_message,
        "results": [
            {
                "id": r.id,
                "question": r.question,
                "expected_answer": r.expected_answer or "",
                "agent_answer": r.agent_answer or "",
                "overall_score": r.overall_score,
                "criteria_scores": json.loads(r.criteria_scores) if r.criteria_scores else {},
                "judge_reasoning": r.judge_reasoning or "",
                "status": r.status,
                "response_time_ms": r.response_time_ms,
            }
            for r in results
        ],
    }


# ── Export eval run as training data ──

@router.get("/export/{run_id}")
def api_export_run(
    run_id: str,
    format: str = Query("sft", regex="^(sft|dpo|openai|raw)$"),
    min_score: float = Query(0, ge=0, le=100),
    api_key: ApiKey = Depends(get_api_key_auth),
    db: Session = Depends(get_db),
):
    """Export eval run results as fine-tuning training data (JSONL)."""
    run = db.query(EvalRun).filter(EvalRun.id == run_id).first()
    if not run:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Run not found")

    if run.api_key_id != api_key.id and run.tenant_id != api_key.tenant_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Access denied")

    if run.status != "completed":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Run must be completed")

    env = db.query(Environment).filter(Environment.id == run.environment_id).first()
    results = db.query(EvalResult).filter(EvalResult.eval_run_id == run.id).all()
    filtered = [r for r in results if r.overall_score is not None and r.overall_score >= min_score]

    from routes.eval_export import _export_sft, _export_dpo, _export_openai, _export_raw

    if format == "sft":
        return _export_sft(filtered, run, env)
    elif format == "dpo":
        return _export_dpo(results, run, env, min_score)
    elif format == "openai":
        return _export_openai(filtered, run, env)
    else:
        return _export_raw(filtered, run, env)


# ── Failure Mining (public API) ──

@router.post("/mine", status_code=202)
def api_trigger_mining(
    environment_id: str,
    max_score: float = Query(60, ge=0, le=100),
    run_ids: str = Query(None),
    strategy: str = Query("llm_rewrite"),
    max_examples: int = Query(100, ge=1, le=500),
    background_tasks: BackgroundTasks = None,
    api_key: ApiKey = Depends(get_api_key_auth),
    db: Session = Depends(get_db),
):
    """Trigger failure mining on eval results. Generates improved answers for low-scoring responses."""
    env = db.query(Environment).filter(
        Environment.id == environment_id,
        Environment.is_active == True,
    ).first()
    if not env:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Environment not found")

    if not env.is_public and env.tenant_id != api_key.tenant_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This environment is not public")

    # Check for already-running mining job
    active = db.query(MiningJob).filter(
        MiningJob.environment_id == env.id,
        MiningJob.api_key_id == api_key.id,
        MiningJob.status.in_(["pending", "running"]),
    ).first()
    if active:
        raise HTTPException(status.HTTP_409_CONFLICT, "A mining job is already running")

    source_run_ids = None
    if run_ids:
        try:
            source_run_ids = json.loads(run_ids)
        except json.JSONDecodeError:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "run_ids must be a valid JSON array")

    config = json.dumps({
        "min_score": 0,
        "max_score": max_score,
        "strategy": strategy,
        "max_examples": max_examples,
    })

    job = MiningJob(
        environment_id=env.id,
        tenant_id=env.tenant_id,
        status="pending",
        source_run_ids=json.dumps(source_run_ids) if source_run_ids else None,
        config=config,
        api_key_id=api_key.id,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    from failure_mining import execute_mining_job

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
    }


@router.get("/mine/{job_id}")
def api_get_mining_job(
    job_id: str,
    api_key: ApiKey = Depends(get_api_key_auth),
    db: Session = Depends(get_db),
):
    """Get mining job status and results."""
    job = db.query(MiningJob).filter(MiningJob.id == job_id).first()
    if not job:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Mining job not found")

    if job.tenant_id != api_key.tenant_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Access denied")

    examples = db.query(MinedExample).filter(
        MinedExample.mining_job_id == job.id,
    ).order_by(MinedExample.created_at).all()

    from collections import Counter
    type_counts = Counter(ex.failure_type for ex in examples)

    return {
        "job_id": job.id,
        "status": job.status,
        "total_failures": job.total_failures,
        "total_mined": job.total_mined,
        "error_message": job.error_message,
        "completed_at": job.completed_at.isoformat() if job.completed_at else None,
        "failure_type_distribution": dict(type_counts),
        "examples": [
            {
                "id": ex.id,
                "failure_type": ex.failure_type,
                "prompt": ex.prompt,
                "original_answer": ex.original_answer,
                "improved_answer": ex.improved_answer,
                "original_score": ex.original_score,
                "estimated_improved_score": ex.estimated_improved_score,
            }
            for ex in examples
        ],
    }


@router.get("/mine/{job_id}/export")
def api_export_mining_job(
    job_id: str,
    format: str = Query("dpo", regex="^(dpo|sft)$"),
    api_key: ApiKey = Depends(get_api_key_auth),
    db: Session = Depends(get_db),
):
    """Export mined training data as JSONL."""
    job = db.query(MiningJob).filter(MiningJob.id == job_id).first()
    if not job:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Mining job not found")

    if job.tenant_id != api_key.tenant_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Access denied")

    if job.status != "completed":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Mining job must be completed")

    from failure_mining import export_mined_examples
    from datetime import datetime

    content = export_mined_examples(job.id, db, format)

    return Response(
        content=content,
        media_type="application/jsonl",
        headers={
            "Content-Disposition": f'attachment; filename="mined_{format}_{datetime.utcnow().strftime("%Y%m%d_%H%M%S")}.jsonl"',
        },
    )


# ── Eval Scheduling (public API) ──

@router.get("/schedule/{environment_id}")
def api_get_eval_schedule(
    environment_id: str,
    api_key: ApiKey = Depends(get_api_key_auth),
    db: Session = Depends(get_db),
):
    """Get the eval schedule for an environment."""
    env = db.query(Environment).filter(
        Environment.id == environment_id,
        Environment.is_active == True,
    ).first()
    if not env:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Environment not found")
    if not env.is_public and env.tenant_id != api_key.tenant_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Access denied")

    schedule = db.query(EvalSchedule).filter(
        EvalSchedule.environment_id == env.id,
    ).first()

    if not schedule:
        return {"schedule": None}

    return {
        "schedule": {
            "id": schedule.id,
            "is_enabled": schedule.is_enabled,
            "schedule_type": schedule.schedule_type,
            "daily_time": schedule.daily_time,
            "interval_hours": schedule.interval_hours,
            "auto_mine": schedule.auto_mine,
            "last_run_at": schedule.last_run_at.isoformat() if schedule.last_run_at else None,
            "last_score": schedule.last_score,
            "next_run_at": schedule.next_run_at.isoformat() if schedule.next_run_at else None,
            "run_count": schedule.run_count or 0,
            "last_status": schedule.last_status,
        },
    }


@router.post("/schedule/{environment_id}")
def api_create_eval_schedule(
    environment_id: str,
    schedule_type: str = Query("daily"),
    daily_time: str = Query("09:00"),
    interval_hours: int = Query(24, ge=1, le=168),
    auto_mine: bool = Query(False),
    mine_max_score: int = Query(60, ge=0, le=100),
    notify_on_regression: bool = Query(True),
    api_key: ApiKey = Depends(get_api_key_auth),
    db: Session = Depends(get_db),
):
    """Create or update an eval schedule via API key."""
    env = db.query(Environment).filter(
        Environment.id == environment_id,
        Environment.is_active == True,
    ).first()
    if not env:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Environment not found")
    if env.tenant_id != api_key.tenant_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Access denied")

    schedule = db.query(EvalSchedule).filter(
        EvalSchedule.environment_id == env.id,
    ).first()

    if not schedule:
        schedule = EvalSchedule(
            environment_id=env.id,
            tenant_id=env.tenant_id,
        )
        db.add(schedule)

    schedule.schedule_type = schedule_type
    schedule.daily_time = daily_time
    schedule.interval_hours = max(1, interval_hours)
    schedule.auto_mine = auto_mine
    schedule.mine_max_score = mine_max_score
    schedule.notify_on_regression = notify_on_regression
    schedule.is_enabled = True

    from services.eval_schedule_runner import _compute_next_run
    schedule.next_run_at = _compute_next_run(schedule)

    db.commit()
    db.refresh(schedule)

    return {
        "schedule_id": schedule.id,
        "is_enabled": True,
        "next_run_at": schedule.next_run_at.isoformat() if schedule.next_run_at else None,
    }


@router.delete("/schedule/{environment_id}")
def api_delete_eval_schedule(
    environment_id: str,
    api_key: ApiKey = Depends(get_api_key_auth),
    db: Session = Depends(get_db),
):
    """Delete the eval schedule for an environment."""
    env = db.query(Environment).filter(
        Environment.id == environment_id,
    ).first()
    if not env:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Environment not found")
    if env.tenant_id != api_key.tenant_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Access denied")

    schedule = db.query(EvalSchedule).filter(
        EvalSchedule.environment_id == env.id,
    ).first()
    if not schedule:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No schedule found")

    db.delete(schedule)
    db.commit()
    return {"deleted": True}


# ── Root Cause Analysis (public API) ──

@router.post("/rca/{environment_id}")
def api_batch_rca(
    environment_id: str,
    max_score: float = Query(60, ge=0, le=100),
    max_failures: int = Query(30, ge=1, le=50),
    api_key=Depends(get_api_key),
    db: Session = Depends(get_db),
):
    """Run AI-powered root cause analysis on eval failures."""
    env = db.query(Environment).filter(
        Environment.id == environment_id,
    ).first()
    if not env:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Environment not found")
    if env.tenant_id != api_key.tenant_id and not env.is_public:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Access denied")

    from root_cause_analysis import run_batch_rca
    result = run_batch_rca(
        environment_id=env.id,
        db=db,
        max_score=max_score,
        max_failures=max_failures,
    )
    return result


@router.post("/rca/{environment_id}/{result_id}")
def api_targeted_rca(
    environment_id: str,
    result_id: str,
    api_key=Depends(get_api_key),
    db: Session = Depends(get_db),
):
    """Run deep root cause analysis on a single failing eval result."""
    env = db.query(Environment).filter(
        Environment.id == environment_id,
    ).first()
    if not env:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Environment not found")
    if env.tenant_id != api_key.tenant_id and not env.is_public:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Access denied")

    # Verify result belongs to this environment
    result = db.query(EvalResult).join(EvalRun).filter(
        EvalResult.id == result_id,
        EvalRun.environment_id == env.id,
    ).first()
    if not result:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Eval result not found")

    from root_cause_analysis import run_targeted_rca
    return run_targeted_rca(result_id=result_id, db=db)
