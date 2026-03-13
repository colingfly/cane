"""
failure_mining.py -- Automated failure mining and training data generation.

Takes low-scoring eval results, classifies failure types, uses a strong LLM
to generate improved answers, and outputs DPO/SFT training pairs.

This closes the feedback loop:
  Agents run -> Eval scores responses -> Failures are mined ->
  LLM rewrites bad answers -> Training data is generated -> Models improve
"""
import json
from datetime import datetime

from sqlalchemy.orm import Session

from eval_engine import JUDGE_MODEL, _call_claude
from eval_models import Environment, EvalRun, EvalResult, MiningJob, MinedExample


# ── Failure type constants ──

FAILURE_TYPES = [
    "hallucination",
    "incomplete",
    "off_topic",
    "wrong_format",
    "factual_error",
    "other",
]


# ── Failure classification ──

CLASSIFY_SYSTEM = """You are a failure classifier for AI agent responses.
Given judge reasoning about why an agent response scored poorly, classify the
primary failure type into exactly ONE category. Respond with ONLY the category
name, nothing else.

Categories:
- hallucination: The agent fabricated information not supported by sources
- incomplete: The answer is partially correct but missing key information
- off_topic: The answer does not address the question asked
- wrong_format: The answer has correct info but wrong structure or format
- factual_error: The answer contains incorrect facts that contradict sources
- other: Does not clearly fit the above categories"""


def classify_failure(judge_reasoning: str) -> str:
    """Classify a failure into one of the standard failure types."""
    if not judge_reasoning:
        return "other"

    try:
        raw = _call_claude(
            prompt=f"Judge reasoning:\n{judge_reasoning}\n\nCategory:",
            system=CLASSIFY_SYSTEM,
            model=JUDGE_MODEL,
            max_tokens=20,
        )
        category = raw.strip().lower().replace("-", "_").replace(" ", "_")
        if category in FAILURE_TYPES:
            return category
    except Exception:
        pass

    return "other"


# ── Improved answer generation ──

REWRITE_SYSTEM = """You are an expert AI response improver. You will receive a question
that an AI agent answered poorly, along with the judge's criticism and optionally
the expected answer and source documents.

Your job is to write an improved answer that addresses ALL of the judge's criticisms.

Rules:
- If source documents are provided, ground your answer ONLY in those sources
- If an expected answer is provided, ensure your answer covers the same key points
- Address every specific criticism from the judge
- Be accurate, complete, and well-structured
- Do not fabricate information beyond what the sources support
- Match the appropriate tone and format for the question

Respond with valid JSON only:
{"improved_answer": "<your improved answer>", "reasoning": "<brief explanation of what you fixed>", "confidence": <0-100 integer>}"""


def generate_improved_answer(
    question: str,
    bad_answer: str,
    expected_answer: str = None,
    judge_reasoning: str = None,
    sources_context: str = None,
    model: str = None,
) -> dict:
    """Generate an improved answer using LLM rewrite. Returns dict with improved_answer, reasoning, confidence."""
    parts = [
        f"Question: {question}",
        f"\nOriginal (Bad) Answer: {bad_answer}",
    ]

    if judge_reasoning:
        parts.append(f"\nJudge's Criticism: {judge_reasoning}")

    if expected_answer:
        parts.append(f"\nExpected Answer: {expected_answer}")

    if sources_context:
        # Truncate sources to avoid token limits
        truncated = sources_context[:4000]
        parts.append(f"\nSource Documents:\n{truncated}")

    parts.append("\nWrite an improved answer (JSON only):")

    prompt = "\n".join(parts)

    try:
        raw = _call_claude(
            prompt=prompt,
            system=REWRITE_SYSTEM,
            model=model or JUDGE_MODEL,
            max_tokens=1024,
        )

        # Parse JSON -- strip markdown fences if present
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[-1]
        if cleaned.endswith("```"):
            cleaned = cleaned.rsplit("```", 1)[0]
        cleaned = cleaned.strip()

        result = json.loads(cleaned)
        return {
            "improved_answer": result.get("improved_answer", cleaned),
            "reasoning": result.get("reasoning", ""),
            "confidence": result.get("confidence", None),
        }
    except (json.JSONDecodeError, Exception):
        # Fallback: treat entire response as the improved answer
        return {
            "improved_answer": raw.strip() if raw else "",
            "reasoning": "",
            "confidence": None,
        }


# ── Main execution ──

def execute_mining_job(job_id: str, db: Session):
    """
    Execute a failure mining job. Called as a background task.

    For each failing eval result:
      1. Classify the failure type
      2. Generate an improved answer via LLM
      3. Store as a MinedExample (DPO training pair)
    """
    job = db.query(MiningJob).filter(MiningJob.id == job_id).first()
    if not job:
        return

    try:
        # Parse config
        config = json.loads(job.config) if job.config else {}
        min_score = config.get("min_score", 0)
        max_score = config.get("max_score", 60)
        strategy = config.get("strategy", "llm_rewrite")
        model = config.get("model", None)
        max_examples = config.get("max_examples", 100)

        # Parse source run IDs
        source_run_ids = json.loads(job.source_run_ids) if job.source_run_ids else []

        # If no specific runs, get all completed runs for this environment
        if not source_run_ids:
            runs = db.query(EvalRun).filter(
                EvalRun.environment_id == job.environment_id,
                EvalRun.status == "completed",
            ).all()
            source_run_ids = [r.id for r in runs]

        if not source_run_ids:
            job.status = "failed"
            job.error_message = "No completed eval runs found"
            db.commit()
            return

        # Mark as running
        job.status = "running"
        db.commit()

        # Query failing results
        failures = db.query(EvalResult).filter(
            EvalResult.eval_run_id.in_(source_run_ids),
            EvalResult.overall_score.isnot(None),
            EvalResult.overall_score >= min_score,
            EvalResult.overall_score <= max_score,
            EvalResult.status.in_(["fail", "warn"]),
        ).order_by(EvalResult.overall_score.asc()).all()

        job.total_failures = len(failures)
        db.commit()

        if not failures:
            job.status = "completed"
            job.completed_at = datetime.utcnow()
            job.error_message = "No failures found matching criteria"
            db.commit()
            return

        # Cap the number of examples to process
        failures = failures[:max_examples]

        # Process each failure
        mined_count = 0
        for result in failures:
            try:
                # 1. Classify the failure type
                failure_type = classify_failure(result.judge_reasoning)

                # 2. Build sources context from sources_used
                sources_context = None
                if result.sources_used:
                    try:
                        sources = json.loads(result.sources_used)
                        if sources:
                            sources_context = "Sources referenced: " + ", ".join(str(s) for s in sources)
                    except (json.JSONDecodeError, TypeError):
                        pass

                # 3. Generate improved answer
                rewrite = generate_improved_answer(
                    question=result.question,
                    bad_answer=result.agent_answer or "",
                    expected_answer=result.expected_answer,
                    judge_reasoning=result.judge_reasoning,
                    sources_context=sources_context,
                    model=model,
                )

                # 4. Estimate improved score from confidence
                confidence = rewrite.get("confidence")
                estimated_score = float(confidence) if confidence is not None else None

                # 5. Create MinedExample
                example = MinedExample(
                    mining_job_id=job.id,
                    eval_result_id=result.id,
                    failure_type=failure_type,
                    original_answer=result.agent_answer or "",
                    improved_answer=rewrite["improved_answer"],
                    improvement_reasoning=rewrite["reasoning"],
                    prompt=result.question,
                    expected_answer=result.expected_answer,
                    sources_context=sources_context,
                    original_score=result.overall_score,
                    estimated_improved_score=estimated_score,
                    export_format="dpo",
                )
                db.add(example)
                mined_count += 1
                job.total_mined = mined_count
                db.commit()

                print(f"  [Mining] {mined_count}/{len(failures)} - {failure_type} - score {result.overall_score}")

            except Exception as e:
                print(f"  [Mining] Error processing result {result.id}: {e}")
                continue

        # Finalize
        job.status = "completed"
        job.completed_at = datetime.utcnow()
        db.commit()
        print(f"  [Mining] Job {job.id} completed: {mined_count} examples mined from {len(failures)} failures")

    except Exception as e:
        job.status = "failed"
        job.error_message = str(e)[:500]
        db.commit()
        print(f"  [Mining] Job {job.id} failed: {e}")


# ── Export helpers ──

def export_mined_examples(job_id: str, db: Session, format: str = "dpo") -> str:
    """Export mined examples as JSONL string."""
    examples = db.query(MinedExample).filter(
        MinedExample.mining_job_id == job_id,
    ).order_by(MinedExample.created_at).all()

    lines = []
    for ex in examples:
        if format == "dpo":
            line = {
                "prompt": ex.prompt or "",
                "chosen": ex.improved_answer or "",
                "rejected": ex.original_answer or "",
                "chosen_score": ex.estimated_improved_score,
                "rejected_score": ex.original_score,
                "failure_type": ex.failure_type,
                "improvement_reasoning": ex.improvement_reasoning or "",
            }
        else:  # sft
            line = {
                "prompt": ex.prompt or "",
                "completion": ex.improved_answer or "",
                "metadata": {
                    "failure_type": ex.failure_type,
                    "original_score": ex.original_score,
                    "source": "failure_mining",
                    "improvement_reasoning": ex.improvement_reasoning or "",
                },
            }
        lines.append(json.dumps(line))

    return "\n".join(lines)
