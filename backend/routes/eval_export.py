"""
eval_export.py -- Dataset export endpoints for training data generation.

Exports eval results in standard fine-tuning formats:
  - SFT (supervised fine-tuning): high-scoring Q&A pairs
  - DPO (direct preference optimization): chosen/rejected pairs
  - OpenAI fine-tune: messages format for OpenAI API
  - Raw JSONL: full eval data with scores and reasoning

Enables the eval-to-training data pipeline:
  Run evals -> filter by quality -> export as training data -> fine-tune models
"""
import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from database import get_db
from auth import get_current_user
from db_models import User
from eval_models import Environment, EvalRun, EvalResult

router = APIRouter(prefix="/api/environments", tags=["eval-export"])


# ── Internal (JWT auth) export endpoints ──

@router.get("/{env_id}/runs/{run_id}/export")
def export_run(
    env_id: str,
    run_id: str,
    format: str = Query("sft", regex="^(sft|dpo|openai|raw)$"),
    min_score: float = Query(0, ge=0, le=100),
    max_score: float = Query(100, ge=0, le=100),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Export eval run results as training data.

    Formats:
      sft     - {prompt, completion} pairs (high-quality responses only)
      dpo     - {prompt, chosen, rejected} preference pairs
      openai  - OpenAI fine-tuning messages format
      raw     - Full eval data with all scores and metadata
    """
    env = db.query(Environment).filter(
        Environment.id == env_id,
        Environment.tenant_id == user.tenant_id,
        Environment.is_active == True,
    ).first()
    if not env:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Environment not found")

    run = db.query(EvalRun).filter(
        EvalRun.id == run_id,
        EvalRun.environment_id == env.id,
    ).first()
    if not run:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Run not found")

    if run.status != "completed":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Run must be completed before exporting")

    results = db.query(EvalResult).filter(
        EvalResult.eval_run_id == run.id,
    ).order_by(EvalResult.created_at).all()

    if not results:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Run has no results to export")

    # Filter by score range
    filtered = [r for r in results if r.overall_score is not None and min_score <= r.overall_score <= max_score]

    if format == "sft":
        return _export_sft(filtered, run, env)
    elif format == "dpo":
        return _export_dpo(results, run, env, min_score)
    elif format == "openai":
        return _export_openai(filtered, run, env)
    elif format == "raw":
        return _export_raw(filtered, run, env)


@router.get("/{env_id}/export/cross-run")
def export_cross_run_dpo(
    env_id: str,
    min_chosen_score: float = Query(80, ge=0, le=100),
    max_rejected_score: float = Query(60, ge=0, le=100),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Generate DPO preference pairs across multiple runs.
    Pairs high-scoring answers from one run with low-scoring answers from another
    for the same question.
    """
    env = db.query(Environment).filter(
        Environment.id == env_id,
        Environment.tenant_id == user.tenant_id,
        Environment.is_active == True,
    ).first()
    if not env:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Environment not found")

    # Get all completed runs
    runs = db.query(EvalRun).filter(
        EvalRun.environment_id == env.id,
        EvalRun.status == "completed",
    ).all()

    if len(runs) < 2:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Need at least 2 completed runs for cross-run DPO export")

    # Get all results grouped by question
    all_results = db.query(EvalResult).filter(
        EvalResult.eval_run_id.in_([r.id for r in runs]),
    ).all()

    # Group by question text
    by_question = {}
    for r in all_results:
        q = r.question.strip()
        if q not in by_question:
            by_question[q] = []
        by_question[q].append(r)

    # Generate preference pairs
    pairs = []
    for question, responses in by_question.items():
        chosen_list = [r for r in responses if r.overall_score and r.overall_score >= min_chosen_score]
        rejected_list = [r for r in responses if r.overall_score and r.overall_score <= max_rejected_score]

        if not chosen_list or not rejected_list:
            continue

        # Pick the best chosen and worst rejected
        best = max(chosen_list, key=lambda r: r.overall_score)
        worst = min(rejected_list, key=lambda r: r.overall_score)

        # Don't pair with itself
        if best.id == worst.id:
            continue

        pairs.append({
            "prompt": question,
            "chosen": best.agent_answer or "",
            "rejected": worst.agent_answer or "",
            "chosen_score": best.overall_score,
            "rejected_score": worst.overall_score,
        })

    lines = [json.dumps(p) for p in pairs]
    content = "\n".join(lines)

    return Response(
        content=content,
        media_type="application/jsonl",
        headers={
            "Content-Disposition": f'attachment; filename="dpo_cross_run_{env.name}_{datetime.utcnow().strftime("%Y%m%d")}.jsonl"',
        },
    )


@router.get("/{env_id}/export/stats")
def export_stats(
    env_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get dataset export statistics for an environment.
    Shows how many training examples are available at different score thresholds.
    """
    env = db.query(Environment).filter(
        Environment.id == env_id,
        Environment.tenant_id == user.tenant_id,
        Environment.is_active == True,
    ).first()
    if not env:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Environment not found")

    completed_runs = db.query(EvalRun).filter(
        EvalRun.environment_id == env.id,
        EvalRun.status == "completed",
    ).all()

    all_results = db.query(EvalResult).filter(
        EvalResult.eval_run_id.in_([r.id for r in completed_runs]),
    ).all()

    total = len(all_results)
    scored = [r for r in all_results if r.overall_score is not None]

    # Count at different thresholds
    thresholds = {
        "90+": len([r for r in scored if r.overall_score >= 90]),
        "80+": len([r for r in scored if r.overall_score >= 80]),
        "70+": len([r for r in scored if r.overall_score >= 70]),
        "60+": len([r for r in scored if r.overall_score >= 60]),
        "below_60": len([r for r in scored if r.overall_score < 60]),
    }

    # DPO pair potential (questions with both high and low scoring answers)
    by_question = {}
    for r in scored:
        q = r.question.strip()
        if q not in by_question:
            by_question[q] = {"high": 0, "low": 0}
        if r.overall_score >= 80:
            by_question[q]["high"] += 1
        elif r.overall_score < 60:
            by_question[q]["low"] += 1

    dpo_pairs = sum(1 for q in by_question.values() if q["high"] > 0 and q["low"] > 0)

    return {
        "total_results": total,
        "completed_runs": len(completed_runs),
        "score_distribution": thresholds,
        "dpo_pair_potential": dpo_pairs,
        "unique_questions": len(by_question),
        "sft_ready": thresholds["80+"],
        "environment_name": env.name,
    }


# ── Export format builders ──

def _export_sft(results, run, env):
    """
    SFT format: one example per high-quality response.
    {prompt, completion, metadata}
    """
    examples = []
    for r in results:
        examples.append({
            "prompt": r.question,
            "completion": r.agent_answer or "",
            "metadata": {
                "expected_answer": r.expected_answer or "",
                "score": r.overall_score,
                "status": r.status,
                "environment": env.name if env else "",
                "run_id": run.id,
            },
        })

    lines = [json.dumps(ex) for ex in examples]
    content = "\n".join(lines)

    return Response(
        content=content,
        media_type="application/jsonl",
        headers={
            "Content-Disposition": f'attachment; filename="sft_{datetime.utcnow().strftime("%Y%m%d_%H%M%S")}.jsonl"',
        },
    )


def _export_dpo(results, run, env, min_chosen_score=80):
    """
    DPO format: preference pairs from the same run.
    For each question, pairs pass results (chosen) against fail results (rejected).
    """
    # Group by question
    by_question = {}
    for r in results:
        q = r.question.strip()
        if q not in by_question:
            by_question[q] = []
        by_question[q].append(r)

    pairs = []
    for question, responses in by_question.items():
        # If we have multiple responses for the same question in one run,
        # pair them. Otherwise use expected_answer as the "chosen" reference.
        high = [r for r in responses if r.overall_score and r.overall_score >= min_chosen_score]
        low = [r for r in responses if r.overall_score and r.overall_score < 60]

        if high and low:
            best = max(high, key=lambda r: r.overall_score)
            worst = min(low, key=lambda r: r.overall_score)
            pairs.append({
                "prompt": question,
                "chosen": best.agent_answer or "",
                "rejected": worst.agent_answer or "",
                "chosen_score": best.overall_score,
                "rejected_score": worst.overall_score,
            })
        elif low:
            # Use expected answer as "chosen" if available
            for r in low:
                if r.expected_answer:
                    pairs.append({
                        "prompt": question,
                        "chosen": r.expected_answer,
                        "rejected": r.agent_answer or "",
                        "chosen_score": None,
                        "rejected_score": r.overall_score,
                        "chosen_source": "expected_answer",
                    })

    lines = [json.dumps(p) for p in pairs]
    content = "\n".join(lines)

    return Response(
        content=content,
        media_type="application/jsonl",
        headers={
            "Content-Disposition": f'attachment; filename="dpo_{datetime.utcnow().strftime("%Y%m%d_%H%M%S")}.jsonl"',
        },
    )


def _export_openai(results, run, env):
    """
    OpenAI fine-tuning format: messages array per example.
    Compatible with OpenAI's fine-tuning API.
    """
    examples = []
    system_prompt = run.agent_prompt or "You are a helpful assistant."

    for r in results:
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": r.question},
            {"role": "assistant", "content": r.agent_answer or ""},
        ]
        examples.append({"messages": messages})

    lines = [json.dumps(ex) for ex in examples]
    content = "\n".join(lines)

    return Response(
        content=content,
        media_type="application/jsonl",
        headers={
            "Content-Disposition": f'attachment; filename="openai_ft_{datetime.utcnow().strftime("%Y%m%d_%H%M%S")}.jsonl"',
        },
    )


def _export_raw(results, run, env):
    """
    Raw format: full eval data with all scores, reasoning, and metadata.
    Useful for custom training pipelines or analysis.
    """
    examples = []
    for r in results:
        examples.append({
            "question": r.question,
            "expected_answer": r.expected_answer or "",
            "agent_answer": r.agent_answer or "",
            "overall_score": r.overall_score,
            "criteria_scores": json.loads(r.criteria_scores) if r.criteria_scores else {},
            "judge_reasoning": r.judge_reasoning or "",
            "status": r.status,
            "response_time_ms": r.response_time_ms,
            "sources_used": json.loads(r.sources_used) if r.sources_used else [],
            "run_id": run.id,
            "environment_id": env.id if env else "",
            "environment_name": env.name if env else "",
        })

    lines = [json.dumps(ex) for ex in examples]
    content = "\n".join(lines)

    return Response(
        content=content,
        media_type="application/jsonl",
        headers={
            "Content-Disposition": f'attachment; filename="eval_raw_{datetime.utcnow().strftime("%Y%m%d_%H%M%S")}.jsonl"',
        },
    )
