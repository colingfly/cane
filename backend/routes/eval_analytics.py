"""
eval_analytics.py -- Comprehensive eval analytics and metrics endpoints.

Pillar 2 (Eval) tightening:
  - Score trends over time (mean, median, p5, p95 per run)
  - Regression detection (per-question delta between runs)
  - Category/tag breakdown (performance by test case tags)
  - Latency percentiles (p50, p95, p99 response times)
  - Failure pattern analysis (cluster why questions fail)
  - Consistency scoring (same question variance across runs)
  - Answer drift detection (detect answer changes over time)
"""
import json
import statistics
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from database import get_db
from auth import get_current_user
from db_models import User
from eval_models import Environment, EvalRun, EvalResult, TestCase

router = APIRouter(prefix="/api/environments", tags=["eval-analytics"])


def _get_env(env_id: str, tenant_id: str, db: Session) -> Environment:
    env = db.query(Environment).filter(
        Environment.id == env_id,
        Environment.tenant_id == tenant_id,
        Environment.is_active == True,
    ).first()
    if not env:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Environment not found")
    return env


def _percentile(data, p):
    """Compute percentile from sorted data."""
    if not data:
        return 0
    sorted_data = sorted(data)
    k = (len(sorted_data) - 1) * (p / 100)
    f = int(k)
    c = f + 1 if f + 1 < len(sorted_data) else f
    d = k - f
    return round(sorted_data[f] + d * (sorted_data[c] - sorted_data[f]), 1)


# ── Score Trends ──

@router.get("/{env_id}/analytics/trends")
def get_score_trends(
    env_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Score trends across all completed runs.
    Returns mean, median, p5, p95, pass/warn/fail counts per run over time.
    """
    env = _get_env(env_id, user.tenant_id, db)

    runs = db.query(EvalRun).filter(
        EvalRun.environment_id == env.id,
        EvalRun.status == "completed",
    ).order_by(EvalRun.created_at).all()

    trends = []
    for run in runs:
        results = db.query(EvalResult).filter(
            EvalResult.eval_run_id == run.id,
        ).all()

        scores = [r.overall_score for r in results if r.overall_score is not None]
        latencies = [r.response_time_ms for r in results if r.response_time_ms is not None]

        trend = {
            "run_id": run.id,
            "created_at": run.created_at.isoformat() if run.created_at else None,
            "overall_score": run.overall_score,
            "total_cases": run.total_cases,
            "passed": run.passed,
            "warned": run.warned,
            "failed": run.failed,
            "scores": {
                "mean": round(statistics.mean(scores), 1) if scores else 0,
                "median": round(statistics.median(scores), 1) if scores else 0,
                "p5": _percentile(scores, 5),
                "p95": _percentile(scores, 95),
                "min": round(min(scores), 1) if scores else 0,
                "max": round(max(scores), 1) if scores else 0,
                "std_dev": round(statistics.stdev(scores), 1) if len(scores) > 1 else 0,
            },
            "latency": {
                "p50": _percentile(latencies, 50),
                "p95": _percentile(latencies, 95),
                "p99": _percentile(latencies, 99),
                "mean": round(statistics.mean(latencies)) if latencies else 0,
            },
        }
        trends.append(trend)

    return {
        "environment_id": env.id,
        "environment_name": env.name,
        "total_runs": len(trends),
        "trends": trends,
    }


# ── Regression Detection ──

@router.get("/{env_id}/analytics/regressions")
def detect_regressions(
    env_id: str,
    base_run_id: str = Query(None, description="Run to compare against (defaults to second-latest)"),
    compare_run_id: str = Query(None, description="Run to check for regressions (defaults to latest)"),
    threshold: float = Query(10, ge=0, le=50, description="Score drop threshold to flag as regression"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Detect per-question regressions between two runs.
    Flags questions where score dropped by more than the threshold.
    """
    env = _get_env(env_id, user.tenant_id, db)

    completed_runs = db.query(EvalRun).filter(
        EvalRun.environment_id == env.id,
        EvalRun.status == "completed",
    ).order_by(EvalRun.created_at.desc()).all()

    if len(completed_runs) < 2:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            "Need at least 2 completed runs for regression detection")

    # Default: compare latest vs second-latest
    if not compare_run_id:
        compare_run = completed_runs[0]
    else:
        compare_run = next((r for r in completed_runs if r.id == compare_run_id), None)
        if not compare_run:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Compare run not found")

    if not base_run_id:
        base_run = completed_runs[1]
    else:
        base_run = next((r for r in completed_runs if r.id == base_run_id), None)
        if not base_run:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Base run not found")

    # Get results for both runs
    base_results = db.query(EvalResult).filter(EvalResult.eval_run_id == base_run.id).all()
    compare_results = db.query(EvalResult).filter(EvalResult.eval_run_id == compare_run.id).all()

    # Index by question text
    base_by_q = {r.question.strip(): r for r in base_results}
    compare_by_q = {r.question.strip(): r for r in compare_results}

    regressions = []
    improvements = []
    stable = []
    new_questions = []

    for question, compare_r in compare_by_q.items():
        base_r = base_by_q.get(question)

        if not base_r:
            new_questions.append({
                "question": question[:200],
                "score": compare_r.overall_score,
                "status": compare_r.status,
            })
            continue

        if base_r.overall_score is None or compare_r.overall_score is None:
            continue

        delta = compare_r.overall_score - base_r.overall_score
        entry = {
            "question": question[:200],
            "base_score": base_r.overall_score,
            "compare_score": compare_r.overall_score,
            "delta": round(delta, 1),
            "base_status": base_r.status,
            "compare_status": compare_r.status,
            "status_changed": base_r.status != compare_r.status,
        }

        if delta <= -threshold:
            regressions.append(entry)
        elif delta >= threshold:
            improvements.append(entry)
        else:
            stable.append(entry)

    # Sort regressions by severity (biggest drop first)
    regressions.sort(key=lambda x: x["delta"])
    improvements.sort(key=lambda x: x["delta"], reverse=True)

    return {
        "base_run": {
            "id": base_run.id,
            "score": base_run.overall_score,
            "created_at": base_run.created_at.isoformat() if base_run.created_at else None,
        },
        "compare_run": {
            "id": compare_run.id,
            "score": compare_run.overall_score,
            "created_at": compare_run.created_at.isoformat() if compare_run.created_at else None,
        },
        "score_delta": round((compare_run.overall_score or 0) - (base_run.overall_score or 0), 1),
        "threshold": threshold,
        "summary": {
            "regressions": len(regressions),
            "improvements": len(improvements),
            "stable": len(stable),
            "new_questions": len(new_questions),
        },
        "regressions": regressions,
        "improvements": improvements,
        "new_questions": new_questions,
    }


# ── Category/Tag Breakdown ──

@router.get("/{env_id}/analytics/categories")
def get_category_breakdown(
    env_id: str,
    run_id: str = Query(None, description="Specific run (defaults to latest)"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Performance breakdown by test case tags/categories.
    Shows mean score, pass rate, and count per tag.
    """
    env = _get_env(env_id, user.tenant_id, db)

    if run_id:
        run = db.query(EvalRun).filter(
            EvalRun.id == run_id, EvalRun.environment_id == env.id,
        ).first()
    else:
        run = db.query(EvalRun).filter(
            EvalRun.environment_id == env.id, EvalRun.status == "completed",
        ).order_by(EvalRun.created_at.desc()).first()

    if not run:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No completed runs found")

    results = db.query(EvalResult).filter(EvalResult.eval_run_id == run.id).all()

    # Load test cases to get tags
    test_cases = db.query(TestCase).filter(TestCase.environment_id == env.id).all()
    tc_tags = {}
    for tc in test_cases:
        tags = []
        if tc.tags:
            try:
                tags = json.loads(tc.tags)
            except (json.JSONDecodeError, TypeError):
                tags = []
        if not tags:
            tags = ["untagged"]
        tc_tags[tc.question.strip()] = tags

    # Group results by tag
    tag_stats = defaultdict(lambda: {"scores": [], "statuses": [], "latencies": []})
    for r in results:
        tags = tc_tags.get(r.question.strip(), ["untagged"])
        for tag in tags:
            if r.overall_score is not None:
                tag_stats[tag]["scores"].append(r.overall_score)
            tag_stats[tag]["statuses"].append(r.status)
            if r.response_time_ms is not None:
                tag_stats[tag]["latencies"].append(r.response_time_ms)

    categories = []
    for tag, data in sorted(tag_stats.items()):
        scores = data["scores"]
        statuses = data["statuses"]
        latencies = data["latencies"]

        categories.append({
            "tag": tag,
            "count": len(statuses),
            "mean_score": round(statistics.mean(scores), 1) if scores else 0,
            "median_score": round(statistics.median(scores), 1) if scores else 0,
            "min_score": round(min(scores), 1) if scores else 0,
            "max_score": round(max(scores), 1) if scores else 0,
            "pass_rate": round(sum(1 for s in statuses if s == "pass") / len(statuses) * 100, 1) if statuses else 0,
            "fail_rate": round(sum(1 for s in statuses if s == "fail") / len(statuses) * 100, 1) if statuses else 0,
            "avg_latency_ms": round(statistics.mean(latencies)) if latencies else 0,
        })

    # Sort by mean score ascending (worst first)
    categories.sort(key=lambda x: x["mean_score"])

    return {
        "run_id": run.id,
        "run_score": run.overall_score,
        "categories": categories,
    }


# ── Latency Analysis ──

@router.get("/{env_id}/analytics/latency")
def get_latency_analysis(
    env_id: str,
    run_id: str = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Detailed latency analysis with percentiles and slowest questions.
    """
    env = _get_env(env_id, user.tenant_id, db)

    if run_id:
        run = db.query(EvalRun).filter(
            EvalRun.id == run_id, EvalRun.environment_id == env.id,
        ).first()
    else:
        run = db.query(EvalRun).filter(
            EvalRun.environment_id == env.id, EvalRun.status == "completed",
        ).order_by(EvalRun.created_at.desc()).first()

    if not run:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No completed runs found")

    results = db.query(EvalResult).filter(EvalResult.eval_run_id == run.id).all()
    latencies = [r.response_time_ms for r in results if r.response_time_ms is not None]

    # Find slowest questions
    sorted_by_latency = sorted(
        [r for r in results if r.response_time_ms is not None],
        key=lambda r: r.response_time_ms, reverse=True,
    )

    slowest = [{
        "question": r.question[:200],
        "latency_ms": r.response_time_ms,
        "score": r.overall_score,
        "status": r.status,
    } for r in sorted_by_latency[:10]]

    # Latency by score bracket
    brackets = {"90+": [], "70-89": [], "50-69": [], "below_50": []}
    for r in results:
        if r.response_time_ms is None or r.overall_score is None:
            continue
        if r.overall_score >= 90:
            brackets["90+"].append(r.response_time_ms)
        elif r.overall_score >= 70:
            brackets["70-89"].append(r.response_time_ms)
        elif r.overall_score >= 50:
            brackets["50-69"].append(r.response_time_ms)
        else:
            brackets["below_50"].append(r.response_time_ms)

    latency_by_score = {}
    for bracket, lats in brackets.items():
        latency_by_score[bracket] = {
            "count": len(lats),
            "mean": round(statistics.mean(lats)) if lats else 0,
            "p50": _percentile(lats, 50),
            "p95": _percentile(lats, 95),
        }

    return {
        "run_id": run.id,
        "total_questions": len(results),
        "percentiles": {
            "p50": _percentile(latencies, 50),
            "p75": _percentile(latencies, 75),
            "p90": _percentile(latencies, 90),
            "p95": _percentile(latencies, 95),
            "p99": _percentile(latencies, 99),
        },
        "mean_ms": round(statistics.mean(latencies)) if latencies else 0,
        "total_ms": sum(latencies),
        "slowest": slowest,
        "latency_by_score": latency_by_score,
    }


# ── Failure Pattern Analysis ──

@router.get("/{env_id}/analytics/failure-patterns")
def get_failure_patterns(
    env_id: str,
    run_id: str = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Analyze failure patterns from judge reasoning.
    Categorizes failures by type: hallucination, incomplete, wrong, refusal, off-topic.
    """
    env = _get_env(env_id, user.tenant_id, db)

    if run_id:
        run = db.query(EvalRun).filter(
            EvalRun.id == run_id, EvalRun.environment_id == env.id,
        ).first()
    else:
        run = db.query(EvalRun).filter(
            EvalRun.environment_id == env.id, EvalRun.status == "completed",
        ).order_by(EvalRun.created_at.desc()).first()

    if not run:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No completed runs found")

    results = db.query(EvalResult).filter(EvalResult.eval_run_id == run.id).all()

    # Categorize failures by analyzing judge reasoning and criteria scores
    patterns = {
        "hallucination": {"count": 0, "questions": [], "description": "Agent fabricated information not in sources"},
        "incomplete": {"count": 0, "questions": [], "description": "Answer missing key information"},
        "inaccurate": {"count": 0, "questions": [], "description": "Answer contains factual errors"},
        "poor_citation": {"count": 0, "questions": [], "description": "Failed to reference source material"},
        "tone_issues": {"count": 0, "questions": [], "description": "Inappropriate tone or style"},
        "other": {"count": 0, "questions": [], "description": "Other failure reasons"},
    }

    for r in results:
        if r.status == "pass":
            continue

        reasoning = (r.judge_reasoning or "").lower()
        criteria = {}
        if r.criteria_scores:
            try:
                criteria = json.loads(r.criteria_scores)
            except (json.JSONDecodeError, TypeError):
                criteria = {}

        entry = {
            "question": r.question[:200],
            "score": r.overall_score,
            "status": r.status,
            "reasoning": r.judge_reasoning or "",
        }

        categorized = False

        # Check hallucination
        halluc_score = criteria.get("hallucination", 100)
        if isinstance(halluc_score, dict):
            halluc_score = halluc_score.get("score", 100)
        if halluc_score < 50 or "hallucin" in reasoning or "fabricat" in reasoning:
            patterns["hallucination"]["count"] += 1
            patterns["hallucination"]["questions"].append(entry)
            categorized = True

        # Check accuracy
        acc_score = criteria.get("accuracy", 100)
        if isinstance(acc_score, dict):
            acc_score = acc_score.get("score", 100)
        if acc_score < 50 or "inaccura" in reasoning or "incorrect" in reasoning or "wrong" in reasoning:
            patterns["inaccurate"]["count"] += 1
            patterns["inaccurate"]["questions"].append(entry)
            categorized = True

        # Check completeness
        comp_score = criteria.get("completeness", 100)
        if isinstance(comp_score, dict):
            comp_score = comp_score.get("score", 100)
        if comp_score < 50 or "incomplete" in reasoning or "missing" in reasoning or "partial" in reasoning:
            patterns["incomplete"]["count"] += 1
            patterns["incomplete"]["questions"].append(entry)
            categorized = True

        # Check citation
        cite_score = criteria.get("citation", 100)
        if isinstance(cite_score, dict):
            cite_score = cite_score.get("score", 100)
        if cite_score < 50 or "citation" in reasoning or "reference" in reasoning:
            patterns["poor_citation"]["count"] += 1
            patterns["poor_citation"]["questions"].append(entry)
            categorized = True

        # Check tone
        tone_score = criteria.get("tone", 100)
        if isinstance(tone_score, dict):
            tone_score = tone_score.get("score", 100)
        if tone_score < 50 or "tone" in reasoning or "unprofessional" in reasoning:
            patterns["tone_issues"]["count"] += 1
            patterns["tone_issues"]["questions"].append(entry)
            categorized = True

        if not categorized:
            patterns["other"]["count"] += 1
            patterns["other"]["questions"].append(entry)

    # Remove empty patterns and limit questions per pattern
    active_patterns = {}
    for key, data in patterns.items():
        if data["count"] > 0:
            data["questions"] = data["questions"][:5]  # Top 5 per pattern
            active_patterns[key] = data

    total_issues = sum(1 for r in results if r.status != "pass")

    return {
        "run_id": run.id,
        "total_questions": len(results),
        "total_issues": total_issues,
        "pass_rate": round((len(results) - total_issues) / len(results) * 100, 1) if results else 0,
        "patterns": active_patterns,
    }


# ── Consistency Analysis ──

@router.get("/{env_id}/analytics/consistency")
def get_consistency_analysis(
    env_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Consistency scoring: how stable are scores for the same question across runs.
    High variance = unreliable agent. Low variance = predictable behavior.
    """
    env = _get_env(env_id, user.tenant_id, db)

    runs = db.query(EvalRun).filter(
        EvalRun.environment_id == env.id,
        EvalRun.status == "completed",
    ).all()

    if len(runs) < 2:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            "Need at least 2 completed runs for consistency analysis")

    # Get all results across all runs
    all_results = db.query(EvalResult).filter(
        EvalResult.eval_run_id.in_([r.id for r in runs]),
    ).all()

    # Group by question
    by_question = defaultdict(list)
    for r in all_results:
        if r.overall_score is not None:
            by_question[r.question.strip()].append({
                "score": r.overall_score,
                "run_id": r.eval_run_id,
                "status": r.status,
            })

    questions = []
    all_variances = []

    for question, entries in by_question.items():
        if len(entries) < 2:
            continue

        scores = [e["score"] for e in entries]
        variance = round(statistics.variance(scores), 1)
        std_dev = round(statistics.stdev(scores), 1)
        score_range = round(max(scores) - min(scores), 1)
        all_variances.append(variance)

        # Status consistency
        statuses = [e["status"] for e in entries]
        status_changes = sum(1 for i in range(1, len(statuses)) if statuses[i] != statuses[i-1])

        questions.append({
            "question": question[:200],
            "runs_seen": len(entries),
            "mean_score": round(statistics.mean(scores), 1),
            "std_dev": std_dev,
            "variance": variance,
            "score_range": score_range,
            "min_score": round(min(scores), 1),
            "max_score": round(max(scores), 1),
            "status_changes": status_changes,
            "stability": "stable" if std_dev < 5 else ("moderate" if std_dev < 15 else "volatile"),
        })

    # Sort by variance descending (most inconsistent first)
    questions.sort(key=lambda x: x["variance"], reverse=True)

    # Overall consistency score (0-100, higher = more consistent)
    avg_variance = statistics.mean(all_variances) if all_variances else 0
    consistency_score = max(0, round(100 - avg_variance, 1))

    stable_count = sum(1 for q in questions if q["stability"] == "stable")
    volatile_count = sum(1 for q in questions if q["stability"] == "volatile")

    return {
        "environment_id": env.id,
        "runs_analyzed": len(runs),
        "questions_analyzed": len(questions),
        "consistency_score": consistency_score,
        "summary": {
            "stable": stable_count,
            "moderate": len(questions) - stable_count - volatile_count,
            "volatile": volatile_count,
        },
        "avg_std_dev": round(statistics.mean([q["std_dev"] for q in questions]), 1) if questions else 0,
        "most_inconsistent": questions[:10],
        "most_consistent": questions[-5:] if len(questions) >= 5 else [],
    }


# ── Answer Drift Detection ──

@router.get("/{env_id}/analytics/drift")
def detect_answer_drift(
    env_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Detect answer drift: when the agent's answers change significantly
    for the same question across runs. Tracks answer length changes,
    score trajectory, and status flips.
    """
    env = _get_env(env_id, user.tenant_id, db)

    runs = db.query(EvalRun).filter(
        EvalRun.environment_id == env.id,
        EvalRun.status == "completed",
    ).order_by(EvalRun.created_at).all()

    if len(runs) < 2:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            "Need at least 2 completed runs for drift detection")

    # Get all results indexed by (run_id, question)
    all_results = db.query(EvalResult).filter(
        EvalResult.eval_run_id.in_([r.id for r in runs]),
    ).all()

    # Group by question, ordered by run creation time
    run_order = {r.id: i for i, r in enumerate(runs)}
    by_question = defaultdict(list)
    for r in all_results:
        by_question[r.question.strip()].append(r)

    # Sort each question's results by run order
    for q in by_question:
        by_question[q].sort(key=lambda r: run_order.get(r.eval_run_id, 0))

    drifting = []
    for question, results in by_question.items():
        if len(results) < 2:
            continue

        # Track score trajectory
        scores = [r.overall_score for r in results if r.overall_score is not None]
        if len(scores) < 2:
            continue

        # Answer length changes
        lengths = [len(r.agent_answer or "") for r in results]
        length_change_pct = round(
            abs(lengths[-1] - lengths[0]) / max(lengths[0], 1) * 100, 1
        )

        # Score trajectory (positive = improving, negative = degrading)
        score_delta = round(scores[-1] - scores[0], 1)

        # Status flips
        statuses = [r.status for r in results]
        flips = sum(1 for i in range(1, len(statuses)) if statuses[i] != statuses[i-1])

        # Check if answer content changed significantly (simple length heuristic)
        has_drift = (
            abs(score_delta) >= 15 or
            flips >= 2 or
            length_change_pct >= 50
        )

        if has_drift:
            drifting.append({
                "question": question[:200],
                "first_score": scores[0],
                "latest_score": scores[-1],
                "score_delta": score_delta,
                "direction": "improving" if score_delta > 0 else ("degrading" if score_delta < 0 else "stable"),
                "status_flips": flips,
                "first_status": statuses[0],
                "latest_status": statuses[-1],
                "answer_length_change_pct": length_change_pct,
                "runs_tracked": len(results),
                "score_history": scores,
            })

    # Sort by absolute score delta (biggest changes first)
    drifting.sort(key=lambda x: abs(x["score_delta"]), reverse=True)

    improving = [d for d in drifting if d["direction"] == "improving"]
    degrading = [d for d in drifting if d["direction"] == "degrading"]

    return {
        "environment_id": env.id,
        "runs_analyzed": len(runs),
        "total_questions_tracked": len(by_question),
        "drifting_questions": len(drifting),
        "summary": {
            "improving": len(improving),
            "degrading": len(degrading),
            "stable": len(by_question) - len(drifting),
        },
        "drifting": drifting[:20],
    }


# ── Criteria Deep Dive ──

@router.get("/{env_id}/analytics/criteria-breakdown")
def get_criteria_breakdown(
    env_id: str,
    run_id: str = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Deep dive into individual criteria performance across all questions.
    Shows which criteria are consistently weak.
    """
    env = _get_env(env_id, user.tenant_id, db)

    if run_id:
        run = db.query(EvalRun).filter(
            EvalRun.id == run_id, EvalRun.environment_id == env.id,
        ).first()
    else:
        run = db.query(EvalRun).filter(
            EvalRun.environment_id == env.id, EvalRun.status == "completed",
        ).order_by(EvalRun.created_at.desc()).first()

    if not run:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No completed runs found")

    results = db.query(EvalResult).filter(EvalResult.eval_run_id == run.id).all()

    # Aggregate criteria scores
    criteria_data = defaultdict(list)
    for r in results:
        if not r.criteria_scores:
            continue
        try:
            scores = json.loads(r.criteria_scores)
        except (json.JSONDecodeError, TypeError):
            continue

        for key, val in scores.items():
            score = val.get("score", val) if isinstance(val, dict) else val
            if isinstance(score, (int, float)):
                criteria_data[key].append(score)

    breakdown = []
    for key, scores in sorted(criteria_data.items()):
        breakdown.append({
            "criteria_key": key,
            "count": len(scores),
            "mean": round(statistics.mean(scores), 1) if scores else 0,
            "median": round(statistics.median(scores), 1) if scores else 0,
            "min": round(min(scores), 1) if scores else 0,
            "max": round(max(scores), 1) if scores else 0,
            "std_dev": round(statistics.stdev(scores), 1) if len(scores) > 1 else 0,
            "below_60_pct": round(sum(1 for s in scores if s < 60) / len(scores) * 100, 1) if scores else 0,
            "above_80_pct": round(sum(1 for s in scores if s >= 80) / len(scores) * 100, 1) if scores else 0,
        })

    # Sort by mean (weakest first)
    breakdown.sort(key=lambda x: x["mean"])

    return {
        "run_id": run.id,
        "total_questions": len(results),
        "criteria": breakdown,
    }


# ── Full Dashboard Endpoint (combines key metrics) ──

@router.get("/{env_id}/analytics/dashboard")
def get_analytics_dashboard(
    env_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Combined dashboard with key metrics from all analytics.
    Single call for the frontend analytics overview.
    """
    env = _get_env(env_id, user.tenant_id, db)

    runs = db.query(EvalRun).filter(
        EvalRun.environment_id == env.id,
        EvalRun.status == "completed",
    ).order_by(EvalRun.created_at.desc()).all()

    if not runs:
        return {
            "environment_id": env.id,
            "environment_name": env.name,
            "has_data": False,
            "total_runs": 0,
        }

    latest_run = runs[0]
    latest_results = db.query(EvalResult).filter(
        EvalResult.eval_run_id == latest_run.id
    ).all()

    # Score trend (last 10 runs)
    score_trend = [{
        "run_id": r.id,
        "score": r.overall_score,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "passed": r.passed,
        "warned": r.warned,
        "failed": r.failed,
    } for r in reversed(runs[:10])]

    # Latest run latency
    latencies = [r.response_time_ms for r in latest_results if r.response_time_ms is not None]
    scores = [r.overall_score for r in latest_results if r.overall_score is not None]

    # Regression count (if 2+ runs)
    regression_count = 0
    if len(runs) >= 2:
        prev_run = runs[1]
        prev_results = db.query(EvalResult).filter(
            EvalResult.eval_run_id == prev_run.id
        ).all()
        prev_by_q = {r.question.strip(): r.overall_score for r in prev_results if r.overall_score is not None}
        for r in latest_results:
            prev_score = prev_by_q.get(r.question.strip())
            if prev_score is not None and r.overall_score is not None:
                if r.overall_score < prev_score - 10:
                    regression_count += 1

    # Failure count by criteria
    criteria_failures = defaultdict(int)
    for r in latest_results:
        if r.status == "pass" or not r.criteria_scores:
            continue
        try:
            cs = json.loads(r.criteria_scores)
            for key, val in cs.items():
                score = val.get("score", val) if isinstance(val, dict) else val
                if isinstance(score, (int, float)) and score < 60:
                    criteria_failures[key] += 1
        except (json.JSONDecodeError, TypeError):
            pass

    # Top failure criteria
    top_failures = sorted(criteria_failures.items(), key=lambda x: x[1], reverse=True)[:5]

    return {
        "environment_id": env.id,
        "environment_name": env.name,
        "has_data": True,
        "total_runs": len(runs),
        "latest_run": {
            "id": latest_run.id,
            "score": latest_run.overall_score,
            "passed": latest_run.passed,
            "warned": latest_run.warned,
            "failed": latest_run.failed,
            "total_cases": latest_run.total_cases,
            "created_at": latest_run.created_at.isoformat() if latest_run.created_at else None,
        },
        "score_stats": {
            "mean": round(statistics.mean(scores), 1) if scores else 0,
            "median": round(statistics.median(scores), 1) if scores else 0,
            "p5": _percentile(scores, 5),
            "p95": _percentile(scores, 95),
        },
        "latency_stats": {
            "p50": _percentile(latencies, 50),
            "p95": _percentile(latencies, 95),
            "mean": round(statistics.mean(latencies)) if latencies else 0,
        },
        "regressions_detected": regression_count,
        "score_trend": score_trend,
        "top_failure_criteria": [{"criteria": k, "count": v} for k, v in top_failures],
        "pass_rate": round(latest_run.passed / latest_run.total_cases * 100, 1) if latest_run.total_cases else 0,
    }
