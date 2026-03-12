"""
eval_routes.py — API endpoints for the Environments system.

Phase 1: CRUD for environments, test cases, judge criteria, and custom rules.
Phase 2 will add: run execution, judge pipeline, auto-generate.
"""
import json
import urllib.request
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status, BackgroundTasks
from sqlalchemy.orm import Session

from database import get_db
from auth import get_current_user
from db_models import User, Workspace
from eval_models import (
    Environment, TestCase, JudgeCriteria, JudgeCustomRule, EvalRun, EvalResult,
)

router = APIRouter(prefix="/api/environments", tags=["environments"])


# ─── Default criteria seeded on new environments ───

DEFAULT_CRITERIA = [
    {"key": "accuracy", "label": "Accuracy", "description": "Answer correctness against source files", "weight": 40, "is_enabled": True, "sort_order": 0},
    {"key": "citation", "label": "Citation Quality", "description": "Properly references source material", "weight": 20, "is_enabled": True, "sort_order": 1},
    {"key": "tone", "label": "Tone & Style", "description": "Appropriate professional tone", "weight": 15, "is_enabled": True, "sort_order": 2},
    {"key": "hallucination", "label": "Hallucination Check", "description": "No fabricated information", "weight": 25, "is_enabled": True, "sort_order": 3},
    {"key": "completeness", "label": "Completeness", "description": "Covers all aspects of the question", "weight": 0, "is_enabled": False, "sort_order": 4},
    {"key": "conciseness", "label": "Conciseness", "description": "No unnecessary filler or repetition", "weight": 0, "is_enabled": False, "sort_order": 5},
]


# ─── Helpers ───

def _get_env(env_id: str, tenant_id: str, db: Session) -> Environment:
    """Fetch environment scoped to tenant, or 404."""
    env = db.query(Environment).filter(
        Environment.id == env_id,
        Environment.tenant_id == tenant_id,
        Environment.is_active == True,
    ).first()
    if not env:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Environment not found")
    return env


def _serialize_env(env: Environment, include_details=False) -> dict:
    """Convert Environment to JSON-safe dict."""
    data = {
        "id": env.id,
        "name": env.name,
        "description": env.description or "",
        "workspace_id": env.workspace_id,
        "workspace_name": env.workspace.name if env.workspace else "",
        "test_case_count": len(env.test_cases),
        "run_count": len(env.runs),
        "last_score": None,
        "webhook_url": env.webhook_url or "",
        "webhook_headers": env.webhook_headers or "{}",
        "webhook_enabled": bool(env.webhook_enabled),
        "created_at": env.created_at.isoformat() if env.created_at else None,
        "updated_at": env.updated_at.isoformat() if env.updated_at else None,
    }

    # Get most recent completed run score
    completed = [r for r in env.runs if r.status == "completed"]
    if completed:
        latest = max(completed, key=lambda r: r.created_at)
        data["last_score"] = latest.overall_score

    if include_details:
        data["test_cases"] = [_serialize_case(tc) for tc in sorted(env.test_cases, key=lambda x: x.sort_order)]
        data["criteria"] = [_serialize_criteria(c) for c in sorted(env.criteria, key=lambda x: x.sort_order)]
        data["custom_rules"] = [_serialize_rule(r) for r in sorted(env.custom_rules, key=lambda x: x.sort_order)]
        data["runs"] = [_serialize_run_summary(r) for r in sorted(env.runs, key=lambda x: x.created_at, reverse=True)[:10]]

    return data


def _serialize_case(tc: TestCase) -> dict:
    tags = []
    if tc.tags:
        try:
            tags = json.loads(tc.tags)
        except (json.JSONDecodeError, TypeError):
            tags = []
    return {
        "id": tc.id,
        "question": tc.question,
        "expected_answer": tc.expected_answer or "",
        "tags": tags,
        "sort_order": tc.sort_order,
    }


def _serialize_criteria(c: JudgeCriteria) -> dict:
    return {
        "id": c.id,
        "key": c.key,
        "label": c.label,
        "description": c.description or "",
        "weight": c.weight,
        "is_enabled": c.is_enabled,
        "sort_order": c.sort_order,
    }


def _serialize_rule(r: JudgeCustomRule) -> dict:
    return {
        "id": r.id,
        "rule_text": r.rule_text,
        "sort_order": r.sort_order,
    }


def _serialize_run_summary(r: EvalRun) -> dict:
    return {
        "id": r.id,
        "status": r.status,
        "total_cases": r.total_cases,
        "passed": r.passed,
        "warned": r.warned,
        "failed": r.failed,
        "overall_score": r.overall_score,
        "started_at": r.started_at.isoformat() if r.started_at else None,
        "completed_at": r.completed_at.isoformat() if r.completed_at else None,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


# ═══════════════════════════════════════════
#  ENVIRONMENTS CRUD
# ═══════════════════════════════════════════

@router.get("")
def list_environments(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all environments for the current tenant."""
    envs = db.query(Environment).filter(
        Environment.tenant_id == user.tenant_id,
        Environment.is_active == True,
    ).order_by(Environment.created_at.desc()).all()

    return {"environments": [_serialize_env(e) for e in envs]}


@router.post("", status_code=201)
def create_environment(
    name: str,
    workspace_id: str,
    description: str = "",
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new environment linked to an agent."""
    # Verify workspace belongs to tenant
    ws = db.query(Workspace).filter(
        Workspace.id == workspace_id,
        Workspace.tenant_id == user.tenant_id,
    ).first()
    if not ws:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Agent not found")

    env = Environment(
        tenant_id=user.tenant_id,
        workspace_id=workspace_id,
        name=name.strip(),
        description=description.strip(),
        created_by=user.id,
    )
    db.add(env)
    db.flush()  # get env.id

    # Seed default judge criteria
    for c in DEFAULT_CRITERIA:
        db.add(JudgeCriteria(
            environment_id=env.id,
            **c,
        ))

    db.commit()
    db.refresh(env)

    return _serialize_env(env, include_details=True)


@router.get("/{env_id}")
def get_environment(
    env_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get environment with all details."""
    env = _get_env(env_id, user.tenant_id, db)
    return _serialize_env(env, include_details=True)


@router.put("/{env_id}")
def update_environment(
    env_id: str,
    name: str = None,
    description: str = None,
    workspace_id: str = None,
    webhook_url: str = None,
    webhook_headers: str = None,
    webhook_enabled: bool = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update environment details."""
    env = _get_env(env_id, user.tenant_id, db)

    if name is not None:
        env.name = name.strip()
    if description is not None:
        env.description = description.strip()
    if webhook_url is not None:
        env.webhook_url = webhook_url.strip()
    if webhook_headers is not None:
        env.webhook_headers = webhook_headers.strip()
    if webhook_enabled is not None:
        env.webhook_enabled = webhook_enabled
    if workspace_id is not None:
        ws = db.query(Workspace).filter(
            Workspace.id == workspace_id,
            Workspace.tenant_id == user.tenant_id,
        ).first()
        if not ws:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Agent not found")
        env.workspace_id = workspace_id

    db.commit()
    db.refresh(env)
    return _serialize_env(env, include_details=True)


@router.delete("/{env_id}")
def delete_environment(
    env_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Soft-delete an environment."""
    env = _get_env(env_id, user.tenant_id, db)
    env.is_active = False
    db.commit()
    return {"ok": True}


# ═══════════════════════════════════════════
#  TEST CASES
# ═══════════════════════════════════════════

@router.post("/{env_id}/cases", status_code=201)
def add_test_case(
    env_id: str,
    question: str,
    expected_answer: str = "",
    tags: str = "[]",
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Add a test case to an environment."""
    env = _get_env(env_id, user.tenant_id, db)

    # Validate tags JSON
    try:
        parsed_tags = json.loads(tags) if tags else []
        if not isinstance(parsed_tags, list):
            parsed_tags = []
    except (json.JSONDecodeError, TypeError):
        parsed_tags = []

    max_order = max([tc.sort_order for tc in env.test_cases], default=-1) + 1

    tc = TestCase(
        environment_id=env.id,
        question=question.strip(),
        expected_answer=expected_answer.strip() if expected_answer else None,
        tags=json.dumps(parsed_tags),
        sort_order=max_order,
    )
    db.add(tc)
    db.commit()
    db.refresh(tc)

    return _serialize_case(tc)


@router.put("/{env_id}/cases/{case_id}")
def update_test_case(
    env_id: str,
    case_id: str,
    question: str = None,
    expected_answer: str = None,
    tags: str = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update a test case."""
    env = _get_env(env_id, user.tenant_id, db)
    tc = db.query(TestCase).filter(TestCase.id == case_id, TestCase.environment_id == env.id).first()
    if not tc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Test case not found")

    if question is not None:
        tc.question = question.strip()
    if expected_answer is not None:
        tc.expected_answer = expected_answer.strip() if expected_answer else None
    if tags is not None:
        try:
            parsed = json.loads(tags)
            tc.tags = json.dumps(parsed if isinstance(parsed, list) else [])
        except (json.JSONDecodeError, TypeError):
            pass

    db.commit()
    db.refresh(tc)
    return _serialize_case(tc)


@router.delete("/{env_id}/cases/{case_id}")
def delete_test_case(
    env_id: str,
    case_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a test case."""
    env = _get_env(env_id, user.tenant_id, db)
    tc = db.query(TestCase).filter(TestCase.id == case_id, TestCase.environment_id == env.id).first()
    if not tc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Test case not found")

    db.delete(tc)
    db.commit()
    return {"ok": True}


@router.post("/{env_id}/cases/bulk", status_code=201)
def bulk_add_test_cases(
    env_id: str,
    cases: str,  # JSON array of {question, expected_answer, tags}
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Import multiple test cases at once."""
    env = _get_env(env_id, user.tenant_id, db)

    try:
        case_list = json.loads(cases)
        if not isinstance(case_list, list):
            raise ValueError
    except (json.JSONDecodeError, ValueError, TypeError):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "cases must be a JSON array")

    max_order = max([tc.sort_order for tc in env.test_cases], default=-1) + 1
    added = []

    for i, c in enumerate(case_list):
        q = c.get("question", "").strip()
        if not q:
            continue

        tc = TestCase(
            environment_id=env.id,
            question=q,
            expected_answer=c.get("expected_answer", "").strip() or None,
            tags=json.dumps(c.get("tags", [])),
            sort_order=max_order + i,
        )
        db.add(tc)
        added.append(tc)

    db.commit()
    return {"added": len(added)}


@router.post("/{env_id}/cases/generate", status_code=201)
def generate_test_cases(
    env_id: str,
    count: int = Query(10, ge=3, le=30),
    difficulty: str = Query("mixed"),  # "easy", "mixed", "adversarial"
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Auto-generate test cases from the workspace's documents using an LLM."""
    env = _get_env(env_id, user.tenant_id, db)

    # Get the workspace and its system prompt
    ws = db.query(Workspace).filter(Workspace.id == env.workspace_id).first()
    if not ws:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Linked workspace not found")

    # Fetch document chunks from ChromaDB
    from services.chroma import text_col
    from services.search import build_tenant_where
    where = build_tenant_where(user.tenant_id, env.workspace_id)

    try:
        get_kwargs = {"include": ["documents", "metadatas"]}
        if where:
            get_kwargs["where"] = where
        results = text_col.get(**get_kwargs)
        docs = results.get("documents", [])
        metas = results.get("metadatas", [])
    except Exception as e:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"Failed to fetch documents: {e}")

    if not docs:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No documents found in this workspace. Upload files first.")

    # Build a representative sample of document content (cap at ~12k tokens worth)
    chunks_with_source = []
    for doc, meta in zip(docs, metas):
        text = (meta or {}).get("display_text", doc) or doc
        source = (meta or {}).get("source_file", "unknown")
        if text and len(text.strip()) > 30:
            chunks_with_source.append({"text": text.strip()[:1500], "source": source})

    # Cap total content to avoid exceeding context window
    selected = chunks_with_source[:80]
    content_block = "\n\n---\n\n".join(
        f"[Source: {c['source']}]\n{c['text']}" for c in selected
    )

    # Difficulty instructions
    diff_instructions = {
        "easy": "Generate straightforward factual questions that can be directly answered from the documents. Focus on clearly stated facts, names, dates, and definitions.",
        "mixed": "Generate a mix of: (1) straightforward factual questions, (2) synthesis questions requiring info from multiple parts, and (3) edge-case questions that test boundaries of what's in the docs. Include 2-3 adversarial questions that ask about plausible-sounding things NOT in the documents to test hallucination resistance.",
        "adversarial": "Focus heavily on edge cases and trick questions. Generate questions about plausible-sounding topics NOT covered in the documents, questions with subtle misconceptions baked in, questions requiring careful distinction between similar concepts, and questions where the answer is 'this isn't covered in the available materials'. At least half should test hallucination resistance.",
    }

    difficulty_prompt = diff_instructions.get(difficulty, diff_instructions["mixed"])

    system_prompt = ws.system_prompt or ""

    generation_prompt = f"""You are an expert QA test engineer. Your job is to generate high-quality evaluation test cases for an AI agent.

The agent has this system prompt:
<system_prompt>
{system_prompt[:2000]}
</system_prompt>

Here is the content from the agent's knowledge base documents:
<documents>
{content_block}
</documents>

Generate exactly {count} test cases. {difficulty_prompt}

For each test case, provide:
1. "question" — the question to ask the agent
2. "expected_answer" — a detailed expected answer (what a correct response should include)
3. "tags" — 1-3 relevant tags as an array

CRITICAL RULES:
- Expected answers should be specific and grounded in the document content
- For adversarial/hallucination questions, the expected answer should state that the information is not available in the documents
- Questions should be diverse — don't ask variations of the same thing
- Questions should reflect real user queries, not trivia

Return ONLY a JSON array with no other text:
[
  {{"question": "...", "expected_answer": "...", "tags": ["tag1", "tag2"]}},
  ...
]"""

    # Call Claude to generate
    from eval_engine import _call_claude, JUDGE_MODEL

    try:
        raw = _call_claude(generation_prompt, model=JUDGE_MODEL, max_tokens=4096)
    except Exception as e:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"LLM generation failed: {e}")

    # Parse response
    # Strip markdown fences if present
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
    cleaned = cleaned.strip()

    try:
        cases = json.loads(cleaned)
        if not isinstance(cases, list):
            raise ValueError("Response is not a list")
    except (json.JSONDecodeError, ValueError) as e:
        print(f"  [AutoGen] Failed to parse LLM response: {e}")
        print(f"  [AutoGen] Raw response: {raw[:500]}")
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Failed to parse generated test cases. Try again.")

    # Save to database
    max_order = max([tc.sort_order for tc in env.test_cases], default=-1) + 1
    added = []

    for i, c in enumerate(cases):
        q = c.get("question", "").strip()
        if not q:
            continue

        tc = TestCase(
            environment_id=env.id,
            question=q,
            expected_answer=c.get("expected_answer", "").strip() or None,
            tags=json.dumps(c.get("tags", []) if isinstance(c.get("tags"), list) else []),
            sort_order=max_order + i,
        )
        db.add(tc)
        added.append(tc)

    db.commit()

    print(f"  [AutoGen] Generated {len(added)} test cases for env={env_id} (requested={count}, difficulty={difficulty})")

    return {
        "generated": len(added),
        "cases": [_serialize_case(tc) for tc in added],
    }


# ═══════════════════════════════════════════
#  JUDGE CRITERIA
# ═══════════════════════════════════════════

@router.get("/{env_id}/criteria")
def get_criteria(
    env_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get all judge criteria for an environment."""
    env = _get_env(env_id, user.tenant_id, db)
    return {"criteria": [_serialize_criteria(c) for c in sorted(env.criteria, key=lambda x: x.sort_order)]}


@router.put("/{env_id}/criteria")
def update_criteria(
    env_id: str,
    criteria: str,  # JSON array of {id, weight, is_enabled}
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Bulk update criteria weights and enabled status."""
    env = _get_env(env_id, user.tenant_id, db)

    try:
        updates = json.loads(criteria)
        if not isinstance(updates, list):
            raise ValueError
    except (json.JSONDecodeError, ValueError, TypeError):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "criteria must be a JSON array")

    criteria_map = {c.id: c for c in env.criteria}

    for u in updates:
        cid = u.get("id")
        if cid not in criteria_map:
            continue
        c = criteria_map[cid]
        if "weight" in u:
            c.weight = max(0, min(100, int(u["weight"])))
        if "is_enabled" in u:
            c.is_enabled = bool(u["is_enabled"])

    db.commit()

    return {"criteria": [_serialize_criteria(c) for c in sorted(env.criteria, key=lambda x: x.sort_order)]}


# ═══════════════════════════════════════════
#  CUSTOM RULES
# ═══════════════════════════════════════════

@router.post("/{env_id}/rules", status_code=201)
def add_custom_rule(
    env_id: str,
    rule_text: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Add a custom judge rule."""
    env = _get_env(env_id, user.tenant_id, db)

    max_order = max([r.sort_order for r in env.custom_rules], default=-1) + 1

    rule = JudgeCustomRule(
        environment_id=env.id,
        rule_text=rule_text.strip(),
        sort_order=max_order,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)

    return _serialize_rule(rule)


@router.delete("/{env_id}/rules/{rule_id}")
def delete_custom_rule(
    env_id: str,
    rule_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a custom judge rule."""
    env = _get_env(env_id, user.tenant_id, db)
    rule = db.query(JudgeCustomRule).filter(
        JudgeCustomRule.id == rule_id,
        JudgeCustomRule.environment_id == env.id,
    ).first()
    if not rule:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Rule not found")

    db.delete(rule)
    db.commit()
    return {"ok": True}


# ═══════════════════════════════════════════
#  EVAL RUNS (read-only for Phase 1)
# ═══════════════════════════════════════════

@router.get("/{env_id}/runs")
def list_runs(
    env_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all eval runs for an environment."""
    env = _get_env(env_id, user.tenant_id, db)
    runs = sorted(env.runs, key=lambda r: r.created_at, reverse=True)
    return {"runs": [_serialize_run_summary(r) for r in runs]}


@router.post("/{env_id}/run", status_code=202)
def trigger_run(
    env_id: str,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Trigger a new evaluation run."""
    env = _get_env(env_id, user.tenant_id, db)

    # Validate: need test cases and criteria
    if not env.test_cases:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Add at least one test case before running")

    enabled_criteria = [c for c in env.criteria if c.is_enabled]
    if not enabled_criteria:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Enable at least one judge criterion")

    total_weight = sum(c.weight for c in enabled_criteria)
    if total_weight != 100:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Criteria weights must sum to 100 (currently {total_weight})")

    # Check for already-running eval
    active = [r for r in env.runs if r.status in ("pending", "running")]
    if active:
        raise HTTPException(status.HTTP_409_CONFLICT, "An evaluation is already running for this environment")

    # Snapshot the agent prompt
    ws = db.query(Workspace).filter(Workspace.id == env.workspace_id).first()
    agent_prompt = ws.system_prompt if ws else ""

    # Snapshot criteria
    criteria_snapshot = json.dumps([
        {"key": c.key, "label": c.label, "weight": c.weight, "is_enabled": c.is_enabled}
        for c in env.criteria
    ])

    # Create run
    run = EvalRun(
        environment_id=env.id,
        tenant_id=user.tenant_id,
        status="pending",
        total_cases=len(env.test_cases),
        agent_prompt=agent_prompt,
        criteria_snapshot=criteria_snapshot,
        triggered_by=user.id,
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    # Kick off in background
    from eval_engine import execute_eval_run
    from database import SessionLocal

    def _run_eval():
        """Run eval in a fresh DB session (background tasks need their own session)."""
        session = SessionLocal()
        try:
            execute_eval_run(run.id, session)
        finally:
            session.close()

    background_tasks.add_task(_run_eval)

    return {"run_id": run.id, "status": "pending", "total_cases": len(env.test_cases)}


@router.get("/{env_id}/runs/{run_id}")
def get_run_detail(
    env_id: str,
    run_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get full run details with all results."""
    env = _get_env(env_id, user.tenant_id, db)
    run = db.query(EvalRun).filter(
        EvalRun.id == run_id,
        EvalRun.environment_id == env.id,
    ).first()
    if not run:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Run not found")

    results = db.query(EvalResult).filter(
        EvalResult.eval_run_id == run.id
    ).order_by(EvalResult.created_at).all()

    return {
        **_serialize_run_summary(run),
        "agent_prompt": run.agent_prompt or "",
        "error_message": run.error_message,
        "results": [
            {
                "id": r.id,
                "question": r.question,
                "expected_answer": r.expected_answer or "",
                "agent_answer": r.agent_answer or "",
                "sources_used": json.loads(r.sources_used) if r.sources_used else [],
                "overall_score": r.overall_score,
                "criteria_scores": json.loads(r.criteria_scores) if r.criteria_scores else {},
                "judge_reasoning": r.judge_reasoning or "",
                "status": r.status,
                "response_time_ms": r.response_time_ms,
            }
            for r in results
        ],
    }


@router.delete("/{env_id}/runs/{run_id}")
def delete_run(
    env_id: str,
    run_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete an eval run and its results."""
    env = _get_env(env_id, user.tenant_id, db)
    run = db.query(EvalRun).filter(
        EvalRun.id == run_id,
        EvalRun.environment_id == env.id,
    ).first()
    if not run:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Run not found")

    # Delete results first (cascade should handle this but be explicit)
    db.query(EvalResult).filter(EvalResult.eval_run_id == run.id).delete()
    db.delete(run)
    db.commit()
    return {"deleted": True}


# ═══════════════════════════════════════════
#  WEBHOOK TEST
# ═══════════════════════════════════════════

@router.post("/{env_id}/webhook/test")
def test_webhook(
    env_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Send a test payload to the environment's configured webhook URL."""
    env = _get_env(env_id, user.tenant_id, db)

    webhook_url = env.webhook_url or ""
    if not webhook_url:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No webhook URL configured")

    # Parse custom headers
    try:
        headers = json.loads(env.webhook_headers or "{}")
    except (json.JSONDecodeError, TypeError):
        headers = {}
    headers.setdefault("Content-Type", "application/json")

    # Build sample payload
    payload = json.dumps({
        "event": "webhook_test",
        "environment_id": env.id,
        "environment_name": env.name,
        "workspace_id": env.workspace_id,
        "message": "This is a test webhook from Cane. If you see this, your webhook is configured correctly.",
        "sample_data": {
            "overall_score": 62.5,
            "total_cases": 10,
            "passed": 5,
            "warned": 2,
            "failed": 3,
            "failed_checks": [
                {
                    "question": "Validate this contract for required standard clauses.",
                    "score": 35.0,
                    "status": "fail",
                    "reasoning": "Missing indemnification and force majeure clauses.",
                },
            ],
        },
        "timestamp": datetime.utcnow().isoformat(),
    }).encode()

    try:
        req = urllib.request.Request(
            webhook_url, data=payload,
            headers=headers, method="POST",
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            return {"ok": True, "status_code": resp.status}
    except Exception as e:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Webhook failed: {str(e)[:200]}")