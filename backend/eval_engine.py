"""
eval_engine.py — LLM-as-a-Judge evaluation pipeline.

Executes an eval run:
1. For each test case, query the agent (reuses the existing search + Claude pipeline)
2. Send (question, expected_answer, agent_answer) to a judge model
3. Score per criteria, aggregate, classify pass/warn/fail
4. Finalize the run with summary stats
"""
import json
import time
import urllib.request
from datetime import datetime

from sqlalchemy.orm import Session

from config import ANTHROPIC_API_KEY, CLAUDE_MODEL
from eval_models import EvalRun, EvalResult, TestCase, JudgeCriteria, JudgeCustomRule

# Judge uses a stronger model than the agent
JUDGE_MODEL = "claude-sonnet-4-5-20250929"


# ─── Claude API call ───

def _call_claude(prompt: str, system: str = "", model: str = None, max_tokens: int = 1024) -> str:
    """Call Claude API. Returns text response."""
    if not ANTHROPIC_API_KEY:
        raise RuntimeError("ANTHROPIC_API_KEY not configured")

    payload = {
        "model": model or CLAUDE_MODEL,
        "max_tokens": max_tokens,
        "temperature": 0.2,
        "system": system,
        "messages": [{"role": "user", "content": prompt}],
    }

    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=data,
        headers={
            "Content-Type": "application/json",
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
        },
        method="POST",
    )

    with urllib.request.urlopen(req, timeout=60) as resp:
        result = json.loads(resp.read())
        content = result.get("content", [])
        return "".join(
            block.get("text", "") for block in content if block.get("type") == "text"
        ).strip()


# ─── Agent answer (reuses existing search pipeline) ───

def _get_agent_answer(question: str, workspace_id: str, tenant_id: str, system_prompt: str) -> dict:
    """
    Query the agent the same way the /ask endpoint does:
    search ChromaDB for relevant chunks, then call Claude with the agent's prompt.
    Returns {answer, sources, response_time_ms}
    """
    # Import from the running app — these are module-level in app.py
    from app import text_col, _search_text, _build_tenant_where, _clean_transcript
    from chunk_quality import is_quality_chunk

    start = time.time()

    where = _build_tenant_where(tenant_id, workspace_id)

    # Search for relevant chunks
    text_results = _search_text(question, 10, where)
    chunks = text_results.get("results", [])

    # Also grab all chunks if small corpus (same logic as /ask)
    try:
        get_kwargs = {"include": ["documents", "metadatas"]}
        if where:
            get_kwargs["where"] = where
        tenant_chunks = text_col.get(**get_kwargs)
        tenant_doc_count = len(tenant_chunks.get("documents", []))

        if 0 < tenant_doc_count <= 200:
            seen = {c.get("text", "")[:100] for c in chunks}
            docs = tenant_chunks.get("documents", [])
            metas = tenant_chunks.get("metadatas", [])
            for doc, meta in zip(docs, metas):
                display = (meta or {}).get("display_text", doc) or doc
                display = _clean_transcript(display.strip()) if display else ""
                if display and len(display) >= 20 and display[:100] not in seen:
                    seen.add(display[:100])
                    chunks.append({
                        "text": display[:500],
                        "source_file": (meta or {}).get("source_file", ""),
                        "page": (meta or {}).get("page", 0),
                    })
    except Exception:
        pass

    if not chunks:
        elapsed = int((time.time() - start) * 1000)
        return {
            "answer": "I could not find any relevant information in the available files to answer this question.",
            "sources": [],
            "response_time_ms": elapsed,
        }

    # Build context
    context = "\n\n---\n\n".join(c.get("text", "") for c in chunks if c.get("text"))
    sources = list(set(c.get("source_file", "") for c in chunks if c.get("source_file")))

    # Build prompt (same pattern as /ask)
    from config import RAG_BASE_RULES
    base_rules = RAG_BASE_RULES

    if system_prompt:
        sys = system_prompt + "\n\nAdditional retrieval rules:" + base_rules
    else:
        sys = "You are a helpful assistant. Answer the question using ONLY the provided document excerpts." + base_rules

    user_prompt = f"Question: {question}\n\nDocument Excerpts:\n{context}\n\nProvide a clear answer based on the above."

    answer = _call_claude(user_prompt, system=sys, model=CLAUDE_MODEL)

    elapsed = int((time.time() - start) * 1000)
    return {
        "answer": answer,
        "sources": sources,
        "response_time_ms": elapsed,
    }


# ─── Judge scoring ───

JUDGE_SYSTEM = """You are an expert evaluator assessing an AI agent's response quality.
You will score the response on specific criteria, each from 0 to 100.
Be strict but fair. Base your evaluation on the expected answer and the actual response.

Scoring guidelines:
- 90-100: Excellent. Accurate, complete, well-cited.
- 70-89: Good. Mostly correct, minor gaps.
- 50-69: Partial. Some correct info but significant gaps or minor errors.
- 30-49: Poor. Major inaccuracies or mostly incomplete.
- 0-29: Failing. Wrong, hallucinated, or completely missed.

IMPORTANT: If the agent fabricated information not supported by the sources, any hallucination-related score must be below 30.
If the agent directly contradicts the expected answer on key facts, accuracy must be below 40.

Respond ONLY with valid JSON, no markdown, no backticks."""


def _build_judge_prompt(question, expected_answer, agent_answer, criteria, custom_rules):
    """Build the judge prompt for scoring one test case."""
    criteria_desc = "\n".join(
        f"- {c['key']}: {c['label']} — {c['description']}"
        for c in criteria
    )

    rules_text = ""
    if custom_rules:
        rules_text = "\n\nCustom Rules (the judge MUST consider these):\n" + "\n".join(
            f"- {r}" for r in custom_rules
        )

    expected_section = f"\n\nExpected Answer:\n{expected_answer}" if expected_answer else ""

    criteria_json = ", ".join(f'"{c["key"]}": {{"score": <0-100>, "reasoning": "<1-2 sentences>"}}' for c in criteria)

    return f"""Evaluate this AI agent's response.

Question:
{question}
{expected_section}

Agent's Response:
{agent_answer}

Evaluation Criteria:
{criteria_desc}
{rules_text}

Return this exact JSON structure:
{{
  "criteria_scores": {{
    {criteria_json}
  }},
  "overall_reasoning": "<Brief 1-2 sentence summary>"
}}"""


def _judge_response(question, expected_answer, agent_answer, criteria, custom_rules) -> dict:
    """Call the judge model to score one agent response."""
    prompt = _build_judge_prompt(question, expected_answer, agent_answer, criteria, custom_rules)

    raw = _call_claude(prompt, system=JUDGE_SYSTEM, model=JUDGE_MODEL, max_tokens=1024)

    # Parse JSON — strip any markdown fences
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[-1]
    if cleaned.endswith("```"):
        cleaned = cleaned.rsplit("```", 1)[0]
    cleaned = cleaned.strip()

    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError:
        # Fallback: return neutral scores
        return {
            "criteria_scores": {c["key"]: {"score": 50, "reasoning": "Judge response could not be parsed"} for c in criteria},
            "overall_reasoning": "Evaluation parsing failed",
        }

    return parsed


def _compute_overall(criteria_scores: dict, criteria_weights: list) -> float:
    """Compute weighted overall score."""
    total_weight = sum(c["weight"] for c in criteria_weights if c["is_enabled"])
    if total_weight == 0:
        return 0.0

    weighted = 0.0
    for c in criteria_weights:
        if not c["is_enabled"]:
            continue
        key = c["key"]
        score_data = criteria_scores.get(key, {})
        score = score_data.get("score", 50) if isinstance(score_data, dict) else score_data
        weighted += score * (c["weight"] / total_weight)

    return round(weighted, 1)


def _classify(score: float) -> str:
    if score >= 80:
        return "pass"
    if score >= 60:
        return "warn"
    return "fail"


# ─── Run execution ───

def execute_eval_run(run_id: str, db: Session):
    """
    Execute a full evaluation run. Called as a background task.
    """
    run = db.query(EvalRun).filter(EvalRun.id == run_id).first()
    if not run:
        return

    env_id = run.environment_id

    # Load test cases
    test_cases = db.query(TestCase).filter(
        TestCase.environment_id == env_id
    ).order_by(TestCase.sort_order).all()

    # Load criteria
    criteria_rows = db.query(JudgeCriteria).filter(
        JudgeCriteria.environment_id == env_id,
        JudgeCriteria.is_enabled == True,
    ).all()

    criteria = [
        {"key": c.key, "label": c.label, "description": c.description or "", "weight": c.weight, "is_enabled": True}
        for c in criteria_rows
    ]

    # Load custom rules
    rules = db.query(JudgeCustomRule).filter(
        JudgeCustomRule.environment_id == env_id
    ).all()
    custom_rules = [r.rule_text for r in rules]

    # Mark running
    run.status = "running"
    run.started_at = datetime.utcnow()
    db.commit()

    try:
        results = []

        for tc in test_cases:
            print(f"  [Eval] Running test case: {tc.question[:60]}...")

            # Step 1: Get agent answer
            try:
                agent_result = _get_agent_answer(
                    question=tc.question,
                    workspace_id=run.environment.workspace_id if run.environment else "",
                    tenant_id=run.tenant_id,
                    system_prompt=run.agent_prompt or "",
                )
            except Exception as e:
                print(f"  [Eval] Agent error: {e}")
                agent_result = {
                    "answer": f"Error getting agent response: {str(e)}",
                    "sources": [],
                    "response_time_ms": 0,
                }

            # Step 2: Judge the response
            try:
                judge_result = _judge_response(
                    question=tc.question,
                    expected_answer=tc.expected_answer or "",
                    agent_answer=agent_result["answer"],
                    criteria=criteria,
                    custom_rules=custom_rules,
                )
            except Exception as e:
                print(f"  [Eval] Judge error: {e}")
                judge_result = {
                    "criteria_scores": {c["key"]: {"score": 50, "reasoning": "Judge error"} for c in criteria},
                    "overall_reasoning": f"Judge failed: {str(e)}",
                }

            # Step 3: Compute scores
            criteria_scores = judge_result.get("criteria_scores", {})
            overall = _compute_overall(criteria_scores, criteria)
            status = _classify(overall)

            # Flatten scores for storage
            flat_scores = {}
            for key, val in criteria_scores.items():
                flat_scores[key] = val.get("score", 50) if isinstance(val, dict) else val

            # Create result
            result = EvalResult(
                eval_run_id=run.id,
                test_case_id=tc.id,
                question=tc.question,
                expected_answer=tc.expected_answer,
                agent_answer=agent_result["answer"],
                sources_used=json.dumps(agent_result.get("sources", [])),
                overall_score=overall,
                criteria_scores=json.dumps(flat_scores),
                judge_reasoning=judge_result.get("overall_reasoning", ""),
                status=status,
                response_time_ms=agent_result.get("response_time_ms", 0),
            )
            db.add(result)
            db.flush()
            results.append(result)

            print(f"  [Eval] Score: {overall} ({status})")

        # Step 4: Finalize run
        run.passed = sum(1 for r in results if r.status == "pass")
        run.warned = sum(1 for r in results if r.status == "warn")
        run.failed = sum(1 for r in results if r.status == "fail")
        run.overall_score = round(
            sum(r.overall_score for r in results) / len(results), 1
        ) if results else 0
        run.status = "completed"
        run.completed_at = datetime.utcnow()
        db.commit()

        print(f"  [Eval] Run complete: {run.overall_score} ({run.passed}P/{run.warned}W/{run.failed}F)")

    except Exception as e:
        print(f"  [Eval] Run failed: {e}")
        import traceback
        traceback.print_exc()
        run.status = "failed"
        run.error_message = str(e)
        run.completed_at = datetime.utcnow()
        db.commit()