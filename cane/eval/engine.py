"""
eval_engine.py -- LLM-as-a-Judge evaluation pipeline.

Executes an eval run:
1. For each test case, query the agent (reuses the existing search + Claude pipeline)
2. Send (question, expected_answer, agent_answer) to a judge model
3. Score per criteria, aggregate, classify pass/warn/fail
4. Compute latency stats, schema validation, and reliability score
5. Finalize the run with summary stats
"""
import json
import statistics
import time
import urllib.request
from datetime import datetime

from sqlalchemy.orm import Session

from cane.core.config import ANTHROPIC_API_KEY, CLAUDE_MODEL
from cane.eval.models import Environment, EvalRun, EvalResult, TestCase, JudgeCriteria, JudgeCustomRule

# Judge uses a stronger model than the agent (default when no per-env config)
JUDGE_MODEL = "claude-sonnet-4-5-20250929"


def _get_judge_provider(env: Environment, provider_override: str = None, model_override: str = None):
    """
    Build a judge provider from the environment's config.
    Falls back to Anthropic + JUDGE_MODEL if nothing is configured.
    """
    from cane.inference.providers import get_provider

    provider_name = provider_override or getattr(env, "judge_provider", None) or "anthropic"
    model_name = model_override or getattr(env, "judge_model", None) or JUDGE_MODEL

    # Parse optional config (api_key, base_url)
    extra = {}
    raw_config = getattr(env, "judge_config", None)
    if raw_config:
        try:
            parsed = json.loads(raw_config)
            if parsed.get("api_key"):
                extra["api_key"] = parsed["api_key"]
            if parsed.get("base_url"):
                extra["base_url"] = parsed["base_url"]
        except (json.JSONDecodeError, TypeError):
            pass

    return get_provider(provider=provider_name, model=model_name, **extra)


# ─── Reliability helpers ───

def _compute_latency_stats(results: list) -> dict:
    """Compute p50/p95/p99/max/mean latency from a list of EvalResult objects."""
    times = [r.response_time_ms for r in results if r.response_time_ms and r.response_time_ms > 0]
    if not times:
        return {}
    times_sorted = sorted(times)
    n = len(times_sorted)
    return {
        "p50_ms": int(times_sorted[int(n * 0.5)]) if n else 0,
        "p95_ms": int(times_sorted[min(int(n * 0.95), n - 1)]) if n else 0,
        "p99_ms": int(times_sorted[min(int(n * 0.99), n - 1)]) if n else 0,
        "max_ms": int(times_sorted[-1]) if n else 0,
        "mean_ms": int(statistics.mean(times)) if n else 0,
    }


def _validate_schema(answer: str, schema: dict) -> tuple:
    """Validate an agent answer against a JSON schema. Returns (valid, errors)."""
    try:
        import jsonschema
    except ImportError:
        return (None, [])

    try:
        data = json.loads(answer)
    except (json.JSONDecodeError, TypeError):
        return (False, ["Response is not valid JSON"])

    try:
        jsonschema.validate(data, schema)
        return (True, [])
    except jsonschema.ValidationError as e:
        return (False, [e.message])
    except jsonschema.SchemaError as e:
        return (None, [f"Invalid schema: {e.message}"])


def _compute_reliability(results: list, latency_stats: dict, accuracy_score: float,
                         schema_pass: int, schema_fail: int,
                         latency_target_ms: int = None) -> tuple:
    """
    Compute composite reliability score across three pillars:
    - Correctness (LLM judge accuracy score)
    - Structural (JSON schema pass rate)
    - Performance (latency vs target)

    Returns (score, grade).
    """
    has_schema = (schema_pass + schema_fail) > 0
    has_latency = latency_target_ms is not None and latency_stats.get("p95_ms")

    # Correctness pillar (always available)
    correctness = accuracy_score

    # Structural pillar
    structural = 0.0
    if has_schema:
        total = schema_pass + schema_fail
        structural = (schema_pass / total * 100) if total > 0 else 0

    # Performance pillar
    performance = 0.0
    if has_latency:
        p95 = latency_stats["p95_ms"]
        if p95 <= latency_target_ms:
            performance = 100.0
        elif p95 <= latency_target_ms * 2:
            performance = max(0, 100 - ((p95 - latency_target_ms) / latency_target_ms * 100))
        else:
            performance = 0.0

    # Weight selection based on what data is available
    if has_schema and has_latency:
        score = correctness * 0.50 + structural * 0.25 + performance * 0.25
    elif has_schema:
        score = correctness * 0.60 + structural * 0.40
    elif has_latency:
        score = correctness * 0.70 + performance * 0.30
    else:
        score = correctness

    score = round(score, 1)

    # Grade
    if score >= 90:
        grade = "A"
    elif score >= 75:
        grade = "B"
    elif score >= 60:
        grade = "C"
    elif score >= 40:
        grade = "D"
    else:
        grade = "F"

    return (score, grade)


# ─── Claude API call ───

def _call_claude(prompt: str, system: str = "", model: str = None, max_tokens: int = 1024) -> str:
    """Call Claude API. Returns text response."""
    from cane.inference.claude import call
    return call(prompt, system=system, model=model, max_tokens=max_tokens, temperature=0.2)


# ─── Agent answer (reuses existing search pipeline) ───

def _get_agent_answer(question: str, workspace_id: str, tenant_id: str, system_prompt: str) -> dict:
    """
    Query the agent the same way the /ask endpoint does:
    search ChromaDB for relevant chunks, then call Claude with the agent's prompt.
    Returns {answer, sources, response_time_ms}
    """
    # Import from refactored services
    from cane.rag.chroma import text_col
    from cane.rag.search import search_text, build_tenant_where, clean_transcript
    from cane.rag.quality import is_quality_chunk

    start = time.time()

    where = build_tenant_where(tenant_id, workspace_id)

    # Search for relevant chunks
    text_results = search_text(question, 10, where)
    chunks = text_results.get("results", [])
    print(f"  [Eval] Search for '{question[:50]}...' → {len(chunks)} text hits, workspace={workspace_id}")

    # Also grab all chunks if small corpus (same logic as /ask)
    try:
        get_kwargs = {"include": ["documents", "metadatas"]}
        if where:
            get_kwargs["where"] = where
        tenant_chunks = text_col.get(**get_kwargs)
        tenant_doc_count = len(tenant_chunks.get("documents", []))

        if 0 < tenant_doc_count <= 200:
            seen = {c.get("text", "")[:100] for c in chunks}
            initial = len(chunks)
            docs = tenant_chunks.get("documents", [])
            metas = tenant_chunks.get("metadatas", [])
            for doc, meta in zip(docs, metas):
                display = (meta or {}).get("display_text", doc) or doc
                display = clean_transcript(display.strip()) if display else ""
                if display and len(display) >= 20 and display[:100] not in seen:
                    seen.add(display[:100])
                    chunks.append({
                        "text": display[:2000],
                        "source_file": (meta or {}).get("source_file", ""),
                        "page": (meta or {}).get("page", 0),
                    })
            print(f"  [Eval] Small corpus fallback: {tenant_doc_count} total chunks, added {len(chunks) - initial} supplementary")
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
    from cane.core.config import RAG_BASE_RULES
    base_rules = RAG_BASE_RULES

    if system_prompt:
        sys = system_prompt + "\n\nAdditional retrieval rules:" + base_rules
    else:
        sys = "You are a helpful assistant. Answer the question using ONLY the provided document excerpts." + base_rules

    user_prompt = f"Question: {question}\n\nDocument Excerpts:\n{context}\n\nProvide a clear answer based on the above."

    # Use workspace's deployed model if available, otherwise default
    from cane.core.models import Workspace
    from cane.core.database import SessionLocal
    ws = None
    try:
        _db = SessionLocal()
        ws = _db.query(Workspace).filter(Workspace.id == workspace_id).first() if workspace_id else None
        _db.close()
    except Exception:
        pass

    if ws and ws.inference_model:
        from cane.inference.routing import infer
        answer = infer(user_prompt, system=sys, workspace=ws)
    else:
        answer = _call_claude(user_prompt, system=sys, model=CLAUDE_MODEL)

    elapsed = int((time.time() - start) * 1000)
    return {
        "answer": answer,
        "sources": sources,
        "response_time_ms": elapsed,
    }


# ─── Agent answer WITH tools (webhook/MCP) ───

def _get_agent_answer_with_tools(question: str, workspace_id: str, tenant_id: str, system_prompt: str, db: Session) -> dict:
    """
    Query the agent using its configured tools (webhooks, MCP, etc.).
    Same flow as the /ask endpoint -- Claude can call tools, get results, and reason over them.
    Returns {answer, sources, response_time_ms}
    """
    import time as _time
    from cane.tools.registry import get_all_tools
    from cane.tools.executor import call_claude_with_tools

    start = _time.time()

    # Load agent tools
    claude_tools, tool_lookup = get_all_tools(workspace_id, tenant_id, db)
    if not claude_tools:
        # Fall back to RAG-only if no tools configured
        return _get_agent_answer(question, workspace_id, tenant_id, system_prompt)

    print(f"  [Eval] Tool-enabled run: {len(claude_tools)} tools for workspace={workspace_id}")

    # Also include RAG context if available
    context_block = ""
    try:
        from cane.rag.search import search_text, build_tenant_where
        where = build_tenant_where(tenant_id, workspace_id)
        text_results = search_text(question, 5, where)
        chunks = text_results.get("results", [])
        if chunks:
            context_block = "\n\nRelevant documents:\n" + "\n---\n".join(
                c.get("text", "")[:500] for c in chunks if c.get("text")
            )
    except Exception:
        pass

    # Build messages
    user_content = question
    if context_block:
        user_content += context_block

    messages = [{"role": "user", "content": user_content}]

    # Check if tool chaining is enabled
    from cane.core.models import Workspace
    ws = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    chaining = getattr(ws, "tool_chaining_enabled", False) if ws else False
    max_iter = 5 if chaining else 3

    # For eval: enhance system prompt to produce clean output with real data
    eval_system = (system_prompt or "You are a helpful assistant.") + (
        "\n\nCRITICAL EVAL INSTRUCTIONS:"
        "\n- This is an automated evaluation. Your response will be scored by a judge."
        "\n- Do NOT narrate your process. No 'I will fetch', 'Let me check', 'I have initiated'."
        "\n- Do NOT describe what tools you called or what data you are collecting."
        "\n- ONLY output the final structured deliverable (e.g. the briefing)."
        "\n- COPY-PASTE specific data from tool results into your answer:"
        "\n  * Exact CVE IDs from tool output (e.g. CVE-2025-1234)"
        "\n  * Exact URLs, domain names, IP addresses from tool output"
        "\n  * Exact post titles and Reddit URLs from tool output"
        "\n  * Exact malware family names and tags from tool output"
        "\n- If a tool returned 15 CVEs, pick the 5 most critical and list them BY THEIR EXACT IDs."
        "\n- If a tool returned Reddit posts, cite the EXACT titles and URLs."
        "\n- NEVER write generic phrases like 'multiple threats detected' or 'various CVEs found'."
        "\n- NEVER say 'the data collection is in progress' or 'tools have been executed'."
        "\n- The judge gives 0 points for vague summaries and fabricated data."
        "\n- The judge gives high scores for specific, verifiable, real data from tool results."
    )

    try:
        answer = call_claude_with_tools(
            messages=messages,
            system=eval_system,
            tools=claude_tools,
            tool_lookup=tool_lookup,
            db_session=db,
            max_iterations=max_iter,
        )
    except Exception as e:
        print(f"  [Eval] Tool execution error: {e}")
        answer = f"Tool execution error: {str(e)}"

    elapsed = int((_time.time() - start) * 1000)
    return {
        "answer": answer,
        "sources": [],
        "response_time_ms": elapsed,
    }


# ─── External agent answer (eval-as-a-service) ───

def _extract_by_path(data, path: str):
    """Extract a value from a nested dict using dot notation: 'data.response.text'"""
    if not path:
        return str(data) if data else ""
    parts = path.split(".")
    current = data
    for part in parts:
        if isinstance(current, dict):
            current = current.get(part, "")
        else:
            return str(current)
    return str(current) if current else ""


def _get_external_agent_answer(question: str, target_url: str, target_method: str,
                                target_headers: str, target_payload_template: str,
                                target_response_path: str) -> dict:
    """
    Query an external agent via HTTP endpoint.
    Replaces {{question}} in the payload template and extracts the answer
    from the response using dot-notation path.
    Returns {answer, sources, response_time_ms} (same shape as _get_agent_answer).
    """
    start = time.time()

    try:
        # Build payload from template
        payload_str = target_payload_template.replace("{{question}}", question)
        payload_bytes = payload_str.encode("utf-8")

        # Parse headers
        try:
            headers = json.loads(target_headers) if target_headers else {}
        except (json.JSONDecodeError, TypeError):
            headers = {}
        headers.setdefault("Content-Type", "application/json")

        method = (target_method or "POST").upper()

        req = urllib.request.Request(
            target_url,
            data=payload_bytes if method == "POST" else None,
            headers=headers,
            method=method,
        )

        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read().decode("utf-8")

        # Parse response and extract answer
        try:
            resp_data = json.loads(body)
            answer = _extract_by_path(resp_data, target_response_path)
        except json.JSONDecodeError:
            # If response is plain text, use it directly
            answer = body.strip()

        if not answer:
            answer = "(External agent returned an empty response)"

        elapsed = int((time.time() - start) * 1000)
        print(f"  [Eval] External agent responded in {elapsed}ms ({len(answer)} chars)")

        return {
            "answer": answer,
            "sources": [],
            "response_time_ms": elapsed,
        }

    except Exception as e:
        elapsed = int((time.time() - start) * 1000)
        print(f"  [Eval] External agent error: {e}")
        return {
            "answer": f"Error calling external agent: {str(e)}",
            "sources": [],
            "response_time_ms": elapsed,
        }


# ─── Judge scoring ───

JUDGE_SYSTEM = """You are an expert evaluator assessing an AI agent's response quality.
You will score the response on specific criteria, each from 0 to 100.
Be strict but fair. Base your evaluation on the expected answer and the actual response.

CRITICAL CONTEXT: The agent being evaluated has access to LIVE data feeds and APIs.
This means the agent can return REAL, current data that may be newer than your training data.
- CVE IDs from 2025 and 2026 (e.g. CVE-2026-32138) are REAL and valid if they follow proper CVE format.
- URLs from abuse.ch, NVD (nvd.nist.gov), Reddit, and news sources are REAL live data.
- Do NOT flag data as "hallucinated" just because you haven't seen it in your training data.
- Only flag hallucination if the data is internally inconsistent, uses impossible formats,
  or the agent clearly made up generic/vague info instead of citing specific data.

Scoring guidelines:
- 90-100: Excellent. Accurate, complete, well-cited with specific data from tools.
- 70-89: Good. Mostly correct, minor gaps. Cites real data points.
- 50-69: Partial. Some correct info but significant gaps or missing citations.
- 30-49: Poor. Major gaps, vague summaries instead of specific data.
- 0-29: Failing. No real data, completely generic, or used impossible data formats.

IMPORTANT: Only mark hallucination below 30 if the agent invented data with IMPOSSIBLE formats
(e.g., CVE IDs that don't match CVE-YYYY-NNNNN pattern) or made internally contradictory claims.
If the agent directly contradicts the expected answer on key structural requirements, accuracy must be below 40.

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


def _judge_response(question, expected_answer, agent_answer, criteria, custom_rules, provider=None) -> dict:
    """Call the judge model to score one agent response."""
    prompt = _build_judge_prompt(question, expected_answer, agent_answer, criteria, custom_rules)

    if provider:
        raw = provider.call(prompt=prompt, system=JUDGE_SYSTEM, max_tokens=1024, temperature=0.2)
    else:
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

    # Load environment explicitly (don't rely on lazy relationship in background task)
    env = db.query(Environment).filter(Environment.id == env_id).first()
    if not env:
        run.status = "failed"
        run.error_message = "Environment not found"
        db.commit()
        return

    workspace_id = env.workspace_id or ""
    print(f"  [Eval] Starting run {run_id} -- env={env_id}, workspace={workspace_id}, tenant={run.tenant_id}")

    # Check if workspace has tools (enables tool-calling eval mode)
    use_tools = False
    if workspace_id:
        from cane.tools.models import AgentTool
        tool_count = db.query(AgentTool).filter(
            AgentTool.workspace_id == workspace_id,
            AgentTool.is_enabled == True,
        ).count()
        use_tools = tool_count > 0
        if use_tools:
            print(f"  [Eval] Tool-enabled mode: {tool_count} tools found")

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

    # Snapshot target config for reproducibility
    is_external = getattr(env, "target_type", "internal") == "external" and getattr(env, "target_url", "")
    if is_external:
        run.target_snapshot = json.dumps({
            "target_type": "external",
            "target_url": env.target_url,
            "target_method": getattr(env, "target_method", "POST"),
            "target_payload_template": getattr(env, "target_payload_template", '{"message": "{{question}}"}'),
            "target_response_path": getattr(env, "target_response_path", "response"),
        })
        print(f"  [Eval] Target: external -> {env.target_url}")
    else:
        print(f"  [Eval] Target: internal agent (workspace={workspace_id})")

    # Build judge provider (multi-model support)
    try:
        judge_provider = _get_judge_provider(env)
        judge_label = f"{getattr(env, 'judge_provider', 'anthropic') or 'anthropic'}/{judge_provider.model}"
        print(f"  [Eval] Judge: {judge_label}")
    except Exception as e:
        print(f"  [Eval] Judge provider init failed ({e}), falling back to default")
        judge_provider = None

    # Mark running
    run.status = "running"
    run.started_at = datetime.utcnow()
    db.commit()

    try:
        results = []

        for tc in test_cases:
            print(f"  [Eval] Running test case: {tc.question[:60]}...")

            # Step 1: Get agent answer (internal or external)
            try:
                if is_external:
                    agent_result = _get_external_agent_answer(
                        question=tc.question,
                        target_url=env.target_url,
                        target_method=getattr(env, "target_method", "POST"),
                        target_headers=getattr(env, "target_headers", "{}"),
                        target_payload_template=getattr(env, "target_payload_template", '{"message": "{{question}}"}'),
                        target_response_path=getattr(env, "target_response_path", "response"),
                    )
                elif use_tools:
                    agent_result = _get_agent_answer_with_tools(
                        question=tc.question,
                        workspace_id=workspace_id,
                        tenant_id=run.tenant_id,
                        system_prompt=run.agent_prompt or "",
                        db=db,
                    )
                else:
                    agent_result = _get_agent_answer(
                        question=tc.question,
                        workspace_id=workspace_id,
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
                    provider=judge_provider,
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

            # Schema validation (if environment has a response_schema)
            schema_valid = None
            schema_errors = []
            response_schema_raw = getattr(env, "response_schema", None)
            if response_schema_raw:
                try:
                    response_schema = json.loads(response_schema_raw) if isinstance(response_schema_raw, str) else response_schema_raw
                    schema_valid, schema_errors = _validate_schema(agent_result["answer"], response_schema)
                except (json.JSONDecodeError, TypeError):
                    pass

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
                schema_valid=schema_valid,
                schema_errors=json.dumps(schema_errors) if schema_errors else None,
            )
            db.add(result)
            results.append(result)

            # Commit after each result so polling picks up progress
            run.passed = sum(1 for r in results if r.status == "pass")
            run.warned = sum(1 for r in results if r.status == "warn")
            run.failed = sum(1 for r in results if r.status == "fail")
            db.commit()

            print(f"  [Eval] Score: {overall} ({status}) — {len(results)}/{len(test_cases)} done")

        # Step 4: Finalize run
        run.passed = sum(1 for r in results if r.status == "pass")
        run.warned = sum(1 for r in results if r.status == "warn")
        run.failed = sum(1 for r in results if r.status == "fail")
        run.overall_score = round(
            sum(r.overall_score for r in results) / len(results), 1
        ) if results else 0

        # Step 5: Compute reliability layer
        latency_stats = _compute_latency_stats(results)
        if latency_stats:
            run.latency_p50_ms = latency_stats.get("p50_ms")
            run.latency_p95_ms = latency_stats.get("p95_ms")
            run.latency_p99_ms = latency_stats.get("p99_ms")
            run.latency_max_ms = latency_stats.get("max_ms")
            run.latency_mean_ms = latency_stats.get("mean_ms")

        s_pass = sum(1 for r in results if r.schema_valid is True)
        s_fail = sum(1 for r in results if r.schema_valid is False)
        if s_pass + s_fail > 0:
            run.schema_pass = s_pass
            run.schema_fail = s_fail

        latency_target = getattr(env, "latency_target_ms", None)
        reliability_score, reliability_grade = _compute_reliability(
            results=results,
            latency_stats=latency_stats,
            accuracy_score=run.overall_score or 0,
            schema_pass=s_pass,
            schema_fail=s_fail,
            latency_target_ms=latency_target,
        )
        run.reliability_score = reliability_score
        run.reliability_grade = reliability_grade

        run.status = "completed"
        run.completed_at = datetime.utcnow()
        db.commit()

        grade_str = f" | Reliability: {reliability_score} ({reliability_grade})" if reliability_score else ""
        print(f"  [Eval] Run complete: {run.overall_score} ({run.passed}P/{run.warned}W/{run.failed}F){grade_str}")

        # Fire webhook if configured and there are failures
        _fire_webhook(run, env, results)

    except Exception as e:
        print(f"  [Eval] Run failed: {e}")
        import traceback
        traceback.print_exc()
        run.status = "failed"
        run.error_message = str(e)
        run.completed_at = datetime.utcnow()
        db.commit()


def _fire_webhook(run: EvalRun, env: Environment, results: list):
    """
    Fire a webhook notification when an eval run completes with failures.
    Only fires if the environment has webhook_enabled=True and webhook_url set.
    Follows the same pattern as schedule_runner.py conditional webhooks.
    """
    if not getattr(env, "webhook_enabled", False):
        return
    webhook_url = getattr(env, "webhook_url", "") or ""
    if not webhook_url:
        return
    if run.failed == 0:
        print(f"  [Eval] Webhook skipped: no failures (all {run.passed} passed)")
        return

    try:
        # Parse custom headers
        raw_headers = getattr(env, "webhook_headers", "{}") or "{}"
        try:
            headers = json.loads(raw_headers)
        except (json.JSONDecodeError, TypeError):
            headers = {}
        headers.setdefault("Content-Type", "application/json")

        # Build payload with failed check details
        failed_checks = []
        for r in results:
            if r.status == "fail":
                failed_checks.append({
                    "question": r.question,
                    "score": r.overall_score,
                    "status": r.status,
                    "reasoning": r.judge_reasoning or "",
                })

        webhook_data = {
            "event": "eval_run_completed",
            "environment_id": env.id,
            "environment_name": env.name,
            "workspace_id": env.workspace_id,
            "run_id": run.id,
            "overall_score": run.overall_score,
            "total_cases": run.total_cases,
            "passed": run.passed,
            "warned": run.warned,
            "failed": run.failed,
            "failed_checks": failed_checks,
            "timestamp": datetime.utcnow().isoformat(),
        }

        # Include reliability data if available
        if run.reliability_score is not None:
            webhook_data["reliability_score"] = run.reliability_score
            webhook_data["reliability_grade"] = run.reliability_grade
        if run.latency_p95_ms is not None:
            webhook_data["latency_p95_ms"] = run.latency_p95_ms
        if run.schema_pass is not None:
            webhook_data["schema_pass"] = run.schema_pass
            webhook_data["schema_fail"] = run.schema_fail

        payload = json.dumps(webhook_data).encode()

        req = urllib.request.Request(
            webhook_url, data=payload,
            headers=headers, method="POST",
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            print(f"  [Eval] Webhook sent: {resp.status} ({run.failed} failed checks)")

    except Exception as e:
        print(f"  [Eval] Webhook failed: {e}")