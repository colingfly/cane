"""
services/guest_cleanup.py -- Periodic cleanup of abandoned guest workspaces.

Deletes guest workspaces (and their docs, chunks, eval data, files) older than 7 days.
"""
import asyncio
import shutil
from datetime import datetime, timedelta

from database import SessionLocal
from db_models import Workspace, Document
from config import GUEST_TENANT_ID, UPLOAD_DIR
from services.chroma import text_col, image_col

CLEANUP_INTERVAL_HOURS = 24
GUEST_TTL_DAYS = 7


def cleanup_stale_guests():
    """Delete guest workspaces older than GUEST_TTL_DAYS."""
    db = SessionLocal()
    try:
        cutoff = datetime.utcnow() - timedelta(days=GUEST_TTL_DAYS)
        stale = db.query(Workspace).filter(
            Workspace.tenant_id == GUEST_TENANT_ID,
            Workspace.created_at < cutoff,
        ).all()

        if not stale:
            return

        for ws in stale:
            # Delete vector chunks
            for col in [text_col, image_col]:
                if not col:
                    continue
                try:
                    results = col.get(
                        where={"$and": [{"tenant_id": GUEST_TENANT_ID}, {"workspace_id": ws.id}]},
                    )
                    if results["ids"]:
                        col.delete(ids=results["ids"])
                except Exception:
                    pass

            # Delete documents
            db.query(Document).filter(Document.workspace_id == ws.id).delete()

            # Delete eval data
            try:
                from eval_models import Environment, EvalRun, EvalResult, TestCase, JudgeCriteria, JudgeCustomRule
                envs = db.query(Environment).filter(Environment.workspace_id == ws.id).all()
                for env in envs:
                    db.query(EvalResult).filter(EvalResult.run_id.in_(
                        db.query(EvalRun.id).filter(EvalRun.environment_id == env.id)
                    )).delete(synchronize_session=False)
                    db.query(EvalRun).filter(EvalRun.environment_id == env.id).delete()
                    db.query(TestCase).filter(TestCase.environment_id == env.id).delete()
                    db.query(JudgeCriteria).filter(JudgeCriteria.environment_id == env.id).delete()
                    db.query(JudgeCustomRule).filter(JudgeCustomRule.environment_id == env.id).delete()
                    db.delete(env)
            except Exception:
                pass

            db.delete(ws)

        db.commit()
        print(f"[GuestCleanup] Cleaned {len(stale)} stale guest workspace(s)")

    except Exception as e:
        db.rollback()
        print(f"[GuestCleanup] Error: {e}")
    finally:
        db.close()


async def start_guest_cleanup_loop():
    """Run cleanup periodically in the background."""
    while True:
        await asyncio.sleep(CLEANUP_INTERVAL_HOURS * 3600)
        try:
            cleanup_stale_guests()
        except Exception as e:
            print(f"[GuestCleanup] Loop error: {e}")
