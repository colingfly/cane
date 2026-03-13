"""
eval_schedule_runner.py -- Background loop for scheduled eval runs.

Polls eval_schedules every 60 seconds, triggers eval runs for due schedules.
After each run completes, optionally triggers failure mining and webhook notifications.

Pattern follows services/schedule_runner.py exactly.
"""
import json
import traceback
import threading
import asyncio
import time
from datetime import datetime, timedelta

from database import SessionLocal
from eval_models import (
    Environment, EvalRun, EvalSchedule, TestCase, JudgeCriteria,
)
from db_models import Workspace


# Lock per schedule to prevent concurrent runs
_schedule_locks: dict[str, threading.Lock] = {}


def _get_lock(schedule_id: str) -> threading.Lock:
    if schedule_id not in _schedule_locks:
        _schedule_locks[schedule_id] = threading.Lock()
    return _schedule_locks[schedule_id]


def _compute_next_run(schedule: EvalSchedule) -> datetime:
    """Calculate the next execution time based on schedule config."""
    now = datetime.utcnow()

    if schedule.schedule_type == "daily":
        try:
            hour, minute = map(int, schedule.daily_time.split(":"))
        except (ValueError, AttributeError):
            hour, minute = 9, 0

        next_run = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
        if next_run <= now:
            next_run += timedelta(days=1)
        return next_run

    elif schedule.schedule_type == "interval":
        hours = max(schedule.interval_hours or 24, 1)
        return now + timedelta(hours=hours)

    else:
        # Default: 24 hours from now
        return now + timedelta(hours=24)


def run_eval_schedule(schedule_id: str):
    """
    Execute a single scheduled eval run.
    Called from background thread. Opens its own DB session.
    """
    lock = _get_lock(schedule_id)
    if not lock.acquire(blocking=False):
        print(f"  [EvalScheduler] {schedule_id[:8]} already running, skipping")
        return

    try:
        db = SessionLocal()
        try:
            schedule = db.query(EvalSchedule).filter(EvalSchedule.id == schedule_id).first()
            if not schedule:
                print(f"  [EvalScheduler] Schedule {schedule_id[:8]} not found")
                return

            env = db.query(Environment).filter(Environment.id == schedule.environment_id).first()
            if not env:
                print(f"  [EvalScheduler] Environment {schedule.environment_id[:8]} not found")
                schedule.last_status = "failed"
                schedule.consecutive_failures = (schedule.consecutive_failures or 0) + 1
                schedule.next_run_at = _compute_next_run(schedule)
                db.commit()
                return

            # Mark as running
            schedule.last_status = "running"
            db.commit()

            print(f"  [EvalScheduler] Starting scheduled eval for env={env.name} (schedule={schedule_id[:8]})")

            t0 = time.time()

            try:
                # Build the eval run (same pattern as eval_routes.py POST /{env_id}/run)
                workspace_id = env.workspace_id or ""
                is_external = getattr(env, "target_type", "internal") == "external" and getattr(env, "target_url", "")

                if is_external:
                    agent_prompt = "(external agent)"
                    target_snapshot = json.dumps({
                        "target_type": "external",
                        "target_url": env.target_url,
                        "target_method": getattr(env, "target_method", "POST"),
                        "target_payload_template": getattr(env, "target_payload_template", '{"message": "{{question}}"}'),
                        "target_response_path": getattr(env, "target_response_path", "response"),
                    })
                else:
                    ws = db.query(Workspace).filter(Workspace.id == workspace_id).first()
                    agent_prompt = ws.system_prompt if ws else ""
                    target_snapshot = None

                # Snapshot criteria
                criteria_rows = db.query(JudgeCriteria).filter(
                    JudgeCriteria.environment_id == env.id,
                    JudgeCriteria.is_enabled == True,
                ).all()
                criteria_snapshot = json.dumps([
                    {"key": c.key, "label": c.label, "weight": c.weight, "is_enabled": c.is_enabled}
                    for c in criteria_rows
                ])

                test_cases = db.query(TestCase).filter(
                    TestCase.environment_id == env.id
                ).all()

                if not test_cases:
                    print(f"  [EvalScheduler] No test cases for env={env.name}, skipping")
                    schedule.last_status = "completed"
                    schedule.next_run_at = _compute_next_run(schedule)
                    db.commit()
                    return

                # Create the eval run
                run = EvalRun(
                    environment_id=env.id,
                    tenant_id=schedule.tenant_id,
                    status="pending",
                    total_cases=len(test_cases),
                    agent_prompt=agent_prompt,
                    criteria_snapshot=criteria_snapshot,
                    target_snapshot=target_snapshot,
                    triggered_by=schedule.created_by,
                )
                db.add(run)
                db.commit()
                db.refresh(run)

                # Execute the eval run (synchronous in this thread)
                from eval_engine import execute_eval_run
                execute_eval_run(run.id, db)

                # Reload run to get final stats
                db.refresh(run)

                elapsed_ms = int((time.time() - t0) * 1000)
                previous_score = schedule.last_score

                # Update schedule tracking
                schedule.last_run_id = run.id
                schedule.last_run_at = datetime.utcnow()
                schedule.last_score = run.overall_score
                schedule.last_status = "completed"
                schedule.run_count = (schedule.run_count or 0) + 1
                schedule.consecutive_failures = 0
                schedule.next_run_at = _compute_next_run(schedule)
                db.commit()

                print(f"  [EvalScheduler] Run complete: score={run.overall_score} "
                      f"({run.passed}P/{run.warned}W/{run.failed}F) in {elapsed_ms}ms")

                # Check for regression and notify
                if (schedule.notify_on_regression
                        and previous_score is not None
                        and run.overall_score is not None
                        and run.overall_score < previous_score - 5):
                    print(f"  [EvalScheduler] Regression detected: {previous_score} -> {run.overall_score}")
                    _fire_regression_webhook(env, run, previous_score)

                # Auto-trigger failure mining if enabled
                if (schedule.auto_mine
                        and run.failed > 0
                        and run.status == "completed"):
                    _trigger_auto_mining(
                        env, run, schedule.mine_max_score or 60, schedule.tenant_id, db
                    )

            except Exception as e:
                elapsed_ms = int((time.time() - t0) * 1000)
                error_msg = str(e)[:500]
                traceback.print_exc()

                schedule.last_run_at = datetime.utcnow()
                schedule.last_status = "failed"
                schedule.consecutive_failures = (schedule.consecutive_failures or 0) + 1
                schedule.next_run_at = _compute_next_run(schedule)
                db.commit()

                print(f"  [EvalScheduler] {schedule_id[:8]} failed in {elapsed_ms}ms: {error_msg[:100]}")

                # Auto-disable after 5 consecutive failures
                if (schedule.consecutive_failures or 0) >= 5:
                    schedule.is_enabled = False
                    db.commit()
                    print(f"  [EvalScheduler] {schedule_id[:8]} auto-disabled after 5 consecutive failures")

        finally:
            db.close()
    finally:
        lock.release()


def _fire_regression_webhook(env: Environment, run: EvalRun, previous_score: float):
    """Fire webhook notification when score regresses."""
    webhook_url = getattr(env, "webhook_url", "") or ""
    if not webhook_url or not getattr(env, "webhook_enabled", False):
        return

    try:
        import urllib.request
        raw_headers = getattr(env, "webhook_headers", "{}") or "{}"
        try:
            headers = json.loads(raw_headers)
        except (json.JSONDecodeError, TypeError):
            headers = {}
        headers.setdefault("Content-Type", "application/json")

        payload = json.dumps({
            "event": "eval_regression",
            "environment_id": env.id,
            "environment_name": env.name,
            "run_id": run.id,
            "current_score": run.overall_score,
            "previous_score": previous_score,
            "score_delta": round((run.overall_score or 0) - previous_score, 1),
            "passed": run.passed,
            "warned": run.warned,
            "failed": run.failed,
            "timestamp": datetime.utcnow().isoformat(),
        }).encode()

        req = urllib.request.Request(
            webhook_url, data=payload,
            headers=headers, method="POST",
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            print(f"  [EvalScheduler] Regression webhook sent: {resp.status}")

    except Exception as e:
        print(f"  [EvalScheduler] Regression webhook failed: {e}")


def _trigger_auto_mining(env, run, max_score, tenant_id, db):
    """Auto-trigger failure mining after a scheduled eval run."""
    try:
        from failure_mining import execute_mining_job
        from eval_models import MiningJob

        job = MiningJob(
            environment_id=env.id,
            tenant_id=tenant_id,
            status="pending",
            source_run_ids=json.dumps([run.id]),
            config=json.dumps({
                "max_score": max_score,
                "strategy": "llm_rewrite",
                "max_examples": 50,
            }),
        )
        db.add(job)
        db.commit()
        db.refresh(job)

        print(f"  [EvalScheduler] Auto-mining triggered: job={job.id[:8]}")

        # Run mining in a separate thread with its own session
        def _mine():
            mine_db = SessionLocal()
            try:
                execute_mining_job(job.id, mine_db)
            finally:
                mine_db.close()

        thread = threading.Thread(target=_mine, daemon=True)
        thread.start()

    except Exception as e:
        print(f"  [EvalScheduler] Auto-mining failed: {e}")


def _check_and_run_eval_schedules():
    """Check all enabled eval schedules and run any that are due."""
    db = SessionLocal()
    try:
        now = datetime.utcnow()
        schedules = db.query(EvalSchedule).filter(
            EvalSchedule.is_enabled == True,
            EvalSchedule.last_status != "running",
            EvalSchedule.next_run_at <= now,
        ).all()

        for schedule in schedules:
            sid = schedule.id
            db.expunge(schedule)
            thread = threading.Thread(target=run_eval_schedule, args=(sid,), daemon=True)
            thread.start()

        if schedules:
            print(f"  [EvalScheduler] Triggered {len(schedules)} eval schedule(s)")

    except Exception as e:
        print(f"  [EvalScheduler] Check error: {e}")
    finally:
        db.close()


async def start_eval_schedule_loop():
    """
    Background loop that checks for due eval schedules every 60 seconds.
    Called from app.py on startup.
    """
    print("  [EvalScheduler] Background eval schedule loop started")
    while True:
        await asyncio.sleep(60)
        try:
            _check_and_run_eval_schedules()
        except Exception as e:
            print(f"  [EvalScheduler] Loop error: {e}")
