"""
root_cause_analysis.py -- AI-powered root cause analysis for eval failures.

Goes beyond failure classification (hallucination, incomplete, etc.) to identify
the underlying reasons agents fail and generate actionable recommendations.

Example insights:
- "Agent lacks documentation about refund policies (3 of 5 failures reference refunds)"
- "System prompt does not instruct the agent to cite sources (4 hallucination failures)"
- "Agent response quality degrades for multi-part questions (avg score 42 vs 78 for simple)"
"""
import json
from datetime import datetime

from sqlalchemy.orm import Session

from cane.eval.engine import JUDGE_MODEL, _call_claude
from cane.eval.models import (
    Environment, EvalRun, EvalResult, TestCase,
    JudgeCriteria, JudgeCustomRule,
)


# ---- RCA Analysis System Prompt ----

RCA_SYSTEM = """You are an expert AI systems debugger. You analyze patterns across
multiple failed eval results to identify the ROOT CAUSES of why an AI agent is
performing poorly.

You receive a batch of failing test cases with:
- The question asked
- The agent's answer
- The expected answer (if available)
- The judge's reasoning and score
- The judge criteria used

Your job is to find PATTERNS across failures and identify actionable root causes.
Do not just restate that the agent failed. Dig deeper:
- Is the agent missing specific knowledge domains?
- Is the system prompt missing instructions?
- Are there patterns in question types that fail?
- Is the agent fabricating information consistently?
- Are source documents incomplete or outdated?

Respond with valid JSON only, no markdown fences:
{
  "root_causes": [
    {
      "id": "<short-kebab-case-id>",
      "title": "<concise title, max 80 chars>",
      "severity": "<critical|high|medium|low>",
      "category": "<knowledge_gap|prompt_issue|source_gap|behavior_pattern|data_quality>",
      "description": "<2-3 sentence explanation of the root cause>",
      "evidence": ["<specific question or pattern that supports this>"],
      "recommendation": "<specific actionable fix>"
    }
  ],
  "summary": "<1-2 sentence executive summary of findings>",
  "top_recommendation": "<single most impactful action to take>"
}"""


RCA_TARGETED_SYSTEM = """You are an expert AI systems debugger. You analyze a single
failing eval result in depth to determine exactly why the agent produced a bad answer.

You receive:
- The question asked
- The agent's answer
- The expected answer
- The judge's reasoning and score
- The judge criteria

Perform a deep analysis:
1. What specific information is wrong or missing?
2. Why might the agent have produced this response?
3. What would need to change to fix this?

Respond with valid JSON only, no markdown fences:
{
  "diagnosis": "<detailed explanation of what went wrong>",
  "likely_cause": "<knowledge_gap|prompt_issue|source_gap|hallucination|reasoning_error|context_overflow>",
  "contributing_factors": ["<factor1>", "<factor2>"],
  "fix_actions": [
    {"action": "<what to do>", "priority": "<high|medium|low>", "effort": "<quick|moderate|significant>"}
  ],
  "confidence": <0-100>
}"""


# ---- Build analysis prompt ----

def _build_batch_prompt(failures: list, criteria_names: list, env_name: str) -> str:
    """Build the prompt for batch root cause analysis."""
    parts = [
        f"Environment: {env_name}",
        f"Judge criteria: {', '.join(criteria_names)}",
        f"Total failing results analyzed: {len(failures)}",
        "",
    ]

    for i, f in enumerate(failures[:30]):  # Cap at 30 to stay within context
        parts.append(f"--- Failure {i+1} (score: {f['score']}) ---")
        parts.append(f"Question: {f['question']}")
        if f.get("expected_answer"):
            parts.append(f"Expected: {f['expected_answer'][:500]}")
        parts.append(f"Agent answer: {f['agent_answer'][:500]}")
        parts.append(f"Judge reasoning: {f['judge_reasoning']}")
        if f.get("criteria_scores"):
            parts.append(f"Criteria scores: {f['criteria_scores']}")
        parts.append("")

    parts.append("Analyze these failures. Find root causes and patterns. Return JSON only.")
    return "\n".join(parts)


def _build_targeted_prompt(failure: dict, criteria_names: list) -> str:
    """Build the prompt for single-result deep analysis."""
    parts = [
        f"Judge criteria: {', '.join(criteria_names)}",
        "",
        f"Question: {failure['question']}",
    ]
    if failure.get("expected_answer"):
        parts.append(f"Expected answer: {failure['expected_answer']}")
    parts.append(f"Agent answer: {failure['agent_answer']}")
    parts.append(f"Judge reasoning: {failure['judge_reasoning']}")
    parts.append(f"Overall score: {failure['score']}")
    if failure.get("criteria_scores"):
        parts.append(f"Criteria scores: {failure['criteria_scores']}")
    parts.append("")
    parts.append("Perform deep root cause analysis. Return JSON only.")
    return "\n".join(parts)


# ---- Parse LLM response ----

def _parse_json_response(raw: str) -> dict:
    """Parse a JSON response, stripping markdown fences if present."""
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[-1]
    if cleaned.endswith("```"):
        cleaned = cleaned.rsplit("```", 1)[0]
    cleaned = cleaned.strip()
    return json.loads(cleaned)


# ---- Main entry points ----

def run_batch_rca(environment_id: str, db: Session, run_ids: list = None,
                  max_score: float = 60, max_failures: int = 30) -> dict:
    """
    Run root cause analysis across multiple failing eval results.

    Args:
        environment_id: The eval environment to analyze.
        db: Database session.
        run_ids: Optional list of specific run IDs. Defaults to all completed runs.
        max_score: Analyze results scoring at or below this threshold.
        max_failures: Max number of failures to include in analysis.

    Returns:
        dict with root_causes, summary, and metadata.
    """
    env = db.query(Environment).filter(Environment.id == environment_id).first()
    if not env:
        return {"error": "Environment not found"}

    # Get run IDs
    if not run_ids:
        runs = db.query(EvalRun).filter(
            EvalRun.environment_id == environment_id,
            EvalRun.status == "completed",
        ).order_by(EvalRun.completed_at.desc()).limit(10).all()
        run_ids = [r.id for r in runs]

    if not run_ids:
        return {"error": "No completed eval runs found"}

    # Load criteria names
    criteria_rows = db.query(JudgeCriteria).filter(
        JudgeCriteria.environment_id == environment_id,
        JudgeCriteria.is_enabled == True,
    ).all()
    criteria_names = [c.label for c in criteria_rows]

    # Query failing results
    results = db.query(EvalResult).filter(
        EvalResult.eval_run_id.in_(run_ids),
        EvalResult.overall_score.isnot(None),
        EvalResult.overall_score <= max_score,
    ).order_by(EvalResult.overall_score.asc()).limit(max_failures).all()

    if not results:
        return {
            "root_causes": [],
            "summary": "No failures found below the score threshold.",
            "top_recommendation": "All results are scoring above the threshold. Consider lowering it.",
            "total_analyzed": 0,
            "environment_name": env.name,
        }

    # Build failure dicts
    failures = []
    for r in results:
        failures.append({
            "question": r.question or "",
            "expected_answer": r.expected_answer or "",
            "agent_answer": r.agent_answer or "",
            "judge_reasoning": r.judge_reasoning or "",
            "score": r.overall_score,
            "criteria_scores": r.criteria_scores or "",
            "result_id": r.id,
        })

    # Call Claude for analysis
    prompt = _build_batch_prompt(failures, criteria_names, env.name)

    try:
        raw = _call_claude(
            prompt=prompt,
            system=RCA_SYSTEM,
            model=JUDGE_MODEL,
            max_tokens=2048,
        )
        analysis = _parse_json_response(raw)
    except (json.JSONDecodeError, Exception) as e:
        return {
            "root_causes": [],
            "summary": f"Analysis failed: {str(e)}",
            "top_recommendation": "Try again or reduce the number of failures to analyze.",
            "total_analyzed": len(failures),
            "environment_name": env.name,
        }

    # Compute score distribution stats
    scores = [f["score"] for f in failures]
    avg_score = round(sum(scores) / len(scores), 1) if scores else 0

    return {
        "root_causes": analysis.get("root_causes", []),
        "summary": analysis.get("summary", ""),
        "top_recommendation": analysis.get("top_recommendation", ""),
        "total_analyzed": len(failures),
        "avg_failure_score": avg_score,
        "score_range": [min(scores), max(scores)] if scores else [0, 0],
        "run_ids_analyzed": run_ids,
        "environment_name": env.name,
        "analyzed_at": datetime.utcnow().isoformat(),
    }


def run_targeted_rca(result_id: str, db: Session) -> dict:
    """
    Run deep root cause analysis on a single eval result.

    Args:
        result_id: The specific EvalResult to analyze.
        db: Database session.

    Returns:
        dict with diagnosis, likely_cause, fix_actions, etc.
    """
    result = db.query(EvalResult).filter(EvalResult.id == result_id).first()
    if not result:
        return {"error": "Eval result not found"}

    # Get the run to find the environment
    run = db.query(EvalRun).filter(EvalRun.id == result.eval_run_id).first()
    if not run:
        return {"error": "Eval run not found"}

    # Load criteria names
    criteria_rows = db.query(JudgeCriteria).filter(
        JudgeCriteria.environment_id == run.environment_id,
        JudgeCriteria.is_enabled == True,
    ).all()
    criteria_names = [c.label for c in criteria_rows]

    failure = {
        "question": result.question or "",
        "expected_answer": result.expected_answer or "",
        "agent_answer": result.agent_answer or "",
        "judge_reasoning": result.judge_reasoning or "",
        "score": result.overall_score,
        "criteria_scores": result.criteria_scores or "",
    }

    prompt = _build_targeted_prompt(failure, criteria_names)

    try:
        raw = _call_claude(
            prompt=prompt,
            system=RCA_TARGETED_SYSTEM,
            model=JUDGE_MODEL,
            max_tokens=1024,
        )
        analysis = _parse_json_response(raw)
    except (json.JSONDecodeError, Exception) as e:
        return {
            "diagnosis": f"Analysis failed: {str(e)}",
            "likely_cause": "unknown",
            "contributing_factors": [],
            "fix_actions": [],
            "confidence": 0,
            "result_id": result_id,
        }

    return {
        "diagnosis": analysis.get("diagnosis", ""),
        "likely_cause": analysis.get("likely_cause", "unknown"),
        "contributing_factors": analysis.get("contributing_factors", []),
        "fix_actions": analysis.get("fix_actions", []),
        "confidence": analysis.get("confidence", 0),
        "result_id": result_id,
        "question": result.question,
        "score": result.overall_score,
        "analyzed_at": datetime.utcnow().isoformat(),
    }
