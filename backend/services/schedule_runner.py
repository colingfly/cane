"""
schedule_runner.py -- Background loop for scheduled agent execution.

Polls agent_schedules every 60 seconds, spawns daemon threads for due schedules.
Reuses the existing RAG + tool pipeline from services.rag and tool_executor.

Pattern follows services/connector_sync.py exactly.
"""
import traceback
import threading
import asyncio
import time
from datetime import datetime, timedelta

from database import SessionLocal
from db_models import Workspace
from schedule_models import AgentSchedule, AgentScheduleRun


# Lock per schedule to prevent concurrent runs
_schedule_locks: dict[str, threading.Lock] = {}


def _get_lock(schedule_id: str) -> threading.Lock:
    if schedule_id not in _schedule_locks:
        _schedule_locks[schedule_id] = threading.Lock()
    return _schedule_locks[schedule_id]


def _compute_next_run(schedule: AgentSchedule) -> datetime:
    """Calculate the next execution time based on schedule config."""
    now = datetime.utcnow()

    if schedule.schedule_type == "daily":
        # Parse HH:MM and find the next occurrence
        try:
            hour, minute = map(int, schedule.daily_time.split(":"))
        except (ValueError, AttributeError):
            hour, minute = 9, 0

        next_run = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
        if next_run <= now:
            next_run += timedelta(days=1)
        return next_run

    else:
        # Interval-based
        minutes = max(schedule.interval_minutes or 60, 15)
        return now + timedelta(minutes=minutes)


def run_schedule(schedule_id: str):
    """
    Execute a single scheduled agent run.
    Called from background thread. Opens its own DB session.
    """
    lock = _get_lock(schedule_id)
    if not lock.acquire(blocking=False):
        print(f"  [Scheduler] {schedule_id[:8]} already running, skipping")
        return

    try:
        db = SessionLocal()
        try:
            schedule = db.query(AgentSchedule).filter(AgentSchedule.id == schedule_id).first()
            if not schedule:
                print(f"  [Scheduler] Schedule {schedule_id[:8]} not found")
                return

            ws = db.query(Workspace).filter(Workspace.id == schedule.workspace_id).first()
            if not ws:
                print(f"  [Scheduler] Workspace {schedule.workspace_id[:8]} not found")
                return

            # Mark as running
            schedule.last_run_status = "running"
            db.commit()

            # Create run record
            run = AgentScheduleRun(
                schedule_id=schedule.id,
                workspace_id=schedule.workspace_id,
                tenant_id=schedule.tenant_id,
                prompt=schedule.prompt,
                status="running",
            )
            db.add(run)
            db.commit()

            t0 = time.time()
            try:
                # Run the ask pipeline (same as routes/ask.py)
                from services.rag import build_context, build_system_prompt, call_claude
                from services.tools import get_all_tools
                from tool_executor import call_claude_with_tools

                ctx = build_context(
                    schedule.prompt,
                    schedule.tenant_id,
                    schedule.workspace_id,
                    5,
                )

                agent_prompt = ws.system_prompt or ""
                system_prompt = build_system_prompt(agent_prompt)
                user_prompt = f"Question: {schedule.prompt}\n\nDocument Excerpts:\n{ctx.context}\n\nProvide a clear answer based on the above."

                # Load tools
                claude_tools, tool_lookup = get_all_tools(
                    schedule.workspace_id, schedule.tenant_id, db,
                )

                if claude_tools:
                    messages = [{"role": "user", "content": user_prompt}]
                    response_text = call_claude_with_tools(
                        messages=messages, system=system_prompt,
                        tools=claude_tools, tool_lookup=tool_lookup,
                        db_session=db,
                    )
                else:
                    response_text = call_claude(user_prompt, system=system_prompt)

                elapsed_ms = int((time.time() - t0) * 1000)

                # Update run record
                run.response = response_text or ""
                run.status = "success"
                run.duration_ms = elapsed_ms

                # Update schedule
                schedule.last_run_at = datetime.utcnow()
                schedule.last_run_status = "success"
                schedule.run_count = (schedule.run_count or 0) + 1
                schedule.next_run_at = _compute_next_run(schedule)

                db.commit()
                print(f"  [Scheduler] {schedule_id[:8]} completed in {elapsed_ms}ms")

                # Log to analytics if available
                try:
                    from services.analytics import log_conversation
                    log_conversation(
                        db, tenant_id=schedule.tenant_id,
                        workspace_id=schedule.workspace_id,
                        query=schedule.prompt, answer=response_text or "",
                        channel="scheduled", user_id=None,
                        chunks_used=ctx.chunks_used, sources=ctx.sources,
                        response_time_ms=elapsed_ms,
                    )
                except Exception:
                    pass

            except Exception as e:
                elapsed_ms = int((time.time() - t0) * 1000)
                error_msg = str(e)[:500]
                traceback.print_exc()

                run.response = ""
                run.status = "error"
                run.error_message = error_msg
                run.duration_ms = elapsed_ms

                schedule.last_run_at = datetime.utcnow()
                schedule.last_run_status = "error"
                schedule.next_run_at = _compute_next_run(schedule)
                db.commit()

                print(f"  [Scheduler] {schedule_id[:8]} failed: {error_msg[:100]}")

        finally:
            db.close()
    finally:
        lock.release()


def _check_and_run_schedules():
    """Check all enabled schedules and run any that are due."""
    db = SessionLocal()
    try:
        now = datetime.utcnow()
        schedules = db.query(AgentSchedule).filter(
            AgentSchedule.is_enabled == True,
            AgentSchedule.last_run_status != "running",
            AgentSchedule.next_run_at <= now,
        ).all()

        for schedule in schedules:
            sid = schedule.id
            db.expunge(schedule)
            thread = threading.Thread(target=run_schedule, args=(sid,), daemon=True)
            thread.start()

        if schedules:
            print(f"  [Scheduler] Triggered {len(schedules)} schedule(s)")

    except Exception as e:
        print(f"  [Scheduler] Check error: {e}")
    finally:
        db.close()


async def start_schedule_loop():
    """
    Background loop that checks for due schedules every 60 seconds.
    Called from app.py on startup.
    """
    print("  [Scheduler] Background schedule loop started")
    while True:
        await asyncio.sleep(60)
        try:
            _check_and_run_schedules()
        except Exception as e:
            print(f"  [Scheduler] Loop error: {e}")
