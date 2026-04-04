"""
finetune_routes.py -- Fine-tuning pipeline management.

Manages the eval-to-fine-tune loop:
1. Generate training data from eval runs
2. Submit fine-tune jobs to OpenAI (or compatible providers)
3. Track job status and model lineage
4. Re-evaluate fine-tuned models to measure improvement

Supports: OpenAI fine-tuning API, Together AI, Fireworks AI
"""
import json
import os
import uuid
import time
import urllib.request
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status, BackgroundTasks
from sqlalchemy.orm import Session

from sqlalchemy import text as sa_text

from cane.core.database import get_db, SessionLocal
from cane.auth.jwt import get_current_user
from cane.core.models import User, Workspace
from cane.eval.models import Environment, EvalRun, EvalResult, MiningJob, MinedExample

router = APIRouter(prefix="/api/finetune", tags=["finetune"])


# ── Fine-tune job tracking (in-memory for now, DB table later) ──
# Using eval_models for now. Will add a proper table via migration.

# ── Helpers ──

def _get_openai_key():
    """Get OpenAI API key from environment."""
    key = os.getenv("OPENAI_API_KEY", "")
    if not key:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            "OPENAI_API_KEY not configured. Set it in your environment variables.")
    return key


def _openai_request(endpoint: str, method: str = "GET", data: dict = None, files: dict = None):
    """Make a request to the OpenAI API."""
    api_key = _get_openai_key()
    url = f"https://api.openai.com/v1{endpoint}"

    headers = {"Authorization": f"Bearer {api_key}"}

    if files:
        # Multipart upload for file
        import io
        boundary = f"----boundary{uuid.uuid4().hex}"
        headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"

        body_parts = []
        for key, (filename, content, content_type) in files.items():
            body_parts.append(f"--{boundary}\r\n")
            body_parts.append(f'Content-Disposition: form-data; name="{key}"; filename="{filename}"\r\n')
            body_parts.append(f"Content-Type: {content_type}\r\n\r\n")
            body_parts.append(content)
            body_parts.append("\r\n")

        if data:
            for key, value in data.items():
                body_parts.append(f"--{boundary}\r\n")
                body_parts.append(f'Content-Disposition: form-data; name="{key}"\r\n\r\n')
                body_parts.append(str(value))
                body_parts.append("\r\n")

        body_parts.append(f"--{boundary}--\r\n")
        body_bytes = "".join(body_parts).encode("utf-8")

    elif data:
        headers["Content-Type"] = "application/json"
        body_bytes = json.dumps(data).encode("utf-8")
    else:
        body_bytes = None

    req = urllib.request.Request(url, data=body_bytes, headers=headers, method=method)

    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8", errors="replace")
        try:
            error_data = json.loads(error_body)
            msg = error_data.get("error", {}).get("message", error_body[:300])
        except (json.JSONDecodeError, KeyError):
            msg = error_body[:300]
        raise HTTPException(e.code, f"OpenAI API error: {msg}")


# ── Generate training data from eval runs ──

@router.post("/generate-dataset")
def generate_dataset(
    environment_id: str,
    format: str = Query("openai", regex="^(sft|openai)$"),
    min_score: float = Query(80, ge=0, le=100),
    include_mined: bool = Query(True),
    max_results: int = Query(500, ge=10, le=5000),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Generate a fine-tuning dataset from eval results + mined corrections.

    Two data sources, merged and deduplicated:
    1. High-scoring eval results (agent got it right, reinforce that behavior)
    2. Mined corrections from failure mining (agent got it wrong, LLM rewrote
       the answer -- this is the highest-value training signal)

    The mined corrections teach the model to handle its hardest failure modes.
    Combined with the high-scoring examples, this produces a balanced dataset
    that reinforces strengths and patches weaknesses.
    """
    env = db.query(Environment).filter(
        Environment.id == environment_id,
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

    if not runs:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No completed eval runs found")

    # Get system prompt from the latest run
    latest_run = max(runs, key=lambda r: r.created_at)
    system_prompt = latest_run.agent_prompt or "You are a helpful assistant."

    # ── Source 1: High-scoring eval results ──
    results = db.query(EvalResult).filter(
        EvalResult.eval_run_id.in_([r.id for r in runs]),
        EvalResult.overall_score >= min_score,
    ).order_by(EvalResult.overall_score.desc()).limit(max_results).all()

    # Deduplicate by question (keep highest scoring)
    seen_questions = {}
    examples = []
    eval_count = 0

    for r in results:
        q = r.question.strip()
        if q in seen_questions:
            continue
        seen_questions[q] = r.overall_score
        eval_count += 1
        if format == "openai":
            examples.append({
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": r.question},
                    {"role": "assistant", "content": r.agent_answer or ""},
                ],
                "_source": "eval_pass",
            })
        else:
            examples.append({
                "prompt": r.question,
                "completion": r.agent_answer or "",
                "_source": "eval_pass",
            })

    # ── Source 2: Mined corrections (the good stuff) ──
    mined_count = 0
    if include_mined:
        mining_jobs = db.query(MiningJob).filter(
            MiningJob.environment_id == env.id,
            MiningJob.status == "completed",
        ).all()

        if mining_jobs:
            mined_examples = db.query(MinedExample).filter(
                MinedExample.mining_job_id.in_([j.id for j in mining_jobs]),
                MinedExample.improved_answer.isnot(None),
                MinedExample.improved_answer != "",
            ).all()

            for ex in mined_examples:
                q = (ex.prompt or "").strip()
                if not q or not ex.improved_answer:
                    continue
                # Mined corrections override eval results for the same question
                # because they represent a better answer for a known failure
                if q in seen_questions:
                    examples = [e for e in examples if _get_question(e, format) != q]
                seen_questions[q] = 100.0
                mined_count += 1
                if format == "openai":
                    examples.append({
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": q},
                            {"role": "assistant", "content": ex.improved_answer},
                        ],
                        "_source": "mined_correction",
                    })
                else:
                    examples.append({
                        "prompt": q,
                        "completion": ex.improved_answer,
                        "_source": "mined_correction",
                    })

    if not examples:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"No training data found. Need eval results with score >= {min_score} or mined corrections.",
        )

    # Strip internal metadata for export, keep for preview
    preview = examples[:5]
    export_examples = [{k: v for k, v in ex.items() if k != "_source"} for ex in examples]
    dataset_content = "\n".join(json.dumps(ex) for ex in export_examples)

    return {
        "dataset_preview": preview,
        "total_examples": len(examples),
        "from_eval_passes": eval_count,
        "from_mined_corrections": mined_count,
        "min_score_used": min_score,
        "source_runs": len(runs),
        "format": format,
        "system_prompt_preview": system_prompt[:200],
        "dataset_jsonl": dataset_content,
    }


def _get_question(example: dict, format: str) -> str:
    """Extract question text from a training example."""
    if format == "openai":
        msgs = example.get("messages", [])
        for m in msgs:
            if m.get("role") == "user":
                return m.get("content", "").strip()
    return example.get("prompt", "").strip()


# ── Submit fine-tune job to OpenAI ──

@router.post("/submit")
def submit_finetune(
    environment_id: str,
    model: str = Query("gpt-4o-mini-2024-07-18"),
    min_score: float = Query(80, ge=0, le=100),
    include_mined: bool = Query(True),
    n_epochs: int = Query(3, ge=1, le=10),
    suffix: str = Query(""),
    auto_deploy: bool = Query(False),
    background_tasks: BackgroundTasks = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Submit a fine-tuning job to OpenAI using eval results + mined corrections.

    Flow:
    1. Generate training JSONL (high-scoring evals + mined failure corrections)
    2. Upload file to OpenAI
    3. Create fine-tuning job
    4. Track lineage
    5. Optionally auto-deploy when complete
    """
    env = db.query(Environment).filter(
        Environment.id == environment_id,
        Environment.tenant_id == user.tenant_id,
        Environment.is_active == True,
    ).first()
    if not env:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Environment not found")

    # Generate training data using the unified dataset builder
    runs = db.query(EvalRun).filter(
        EvalRun.environment_id == env.id,
        EvalRun.status == "completed",
    ).all()

    if not runs:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No completed eval runs")

    latest_run = max(runs, key=lambda r: r.created_at)
    system_prompt = latest_run.agent_prompt or "You are a helpful assistant."

    # ── Build unified dataset: eval passes + mined corrections ──
    seen = {}
    examples = []

    # Source 1: High-scoring eval results
    results = db.query(EvalResult).filter(
        EvalResult.eval_run_id.in_([r.id for r in runs]),
        EvalResult.overall_score >= min_score,
    ).order_by(EvalResult.overall_score.desc()).all()

    for r in results:
        q = r.question.strip()
        if q not in seen:
            seen[q] = True
            examples.append({
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": r.question},
                    {"role": "assistant", "content": r.agent_answer or ""},
                ]
            })

    # Source 2: Mined corrections (override eval results for same question)
    mined_count = 0
    if include_mined:
        mining_jobs = db.query(MiningJob).filter(
            MiningJob.environment_id == env.id,
            MiningJob.status == "completed",
        ).all()
        if mining_jobs:
            mined_examples = db.query(MinedExample).filter(
                MinedExample.mining_job_id.in_([j.id for j in mining_jobs]),
                MinedExample.improved_answer.isnot(None),
                MinedExample.improved_answer != "",
            ).all()
            for ex in mined_examples:
                q = (ex.prompt or "").strip()
                if not q or not ex.improved_answer:
                    continue
                if q in seen:
                    examples = [e for e in examples if e["messages"][1]["content"].strip() != q]
                seen[q] = True
                mined_count += 1
                examples.append({
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": q},
                        {"role": "assistant", "content": ex.improved_answer},
                    ]
                })

    if len(examples) < 10:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            f"Need at least 10 training examples (found {len(examples)}). "
                            "Run more evals, mine failures, or lower the score threshold.")

    jsonl_content = "\n".join(json.dumps(ex) for ex in examples)

    # Step 1: Upload training file to OpenAI
    api_key = _get_openai_key()
    file_name = f"cane_ft_{env.name.replace(' ', '_')}_{datetime.utcnow().strftime('%Y%m%d')}.jsonl"

    # Use requests-style upload via urllib
    boundary = f"----cane{uuid.uuid4().hex}"
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="purpose"\r\n\r\n'
        f"fine-tune\r\n"
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{file_name}"\r\n'
        f"Content-Type: application/jsonl\r\n\r\n"
        f"{jsonl_content}\r\n"
        f"--{boundary}--\r\n"
    )

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": f"multipart/form-data; boundary={boundary}",
    }

    try:
        req = urllib.request.Request(
            "https://api.openai.com/v1/files",
            data=body.encode("utf-8"),
            headers=headers,
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            file_result = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Failed to upload training file: {str(e)[:200]}")

    file_id = file_result.get("id")
    if not file_id:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "OpenAI did not return a file ID")

    # Step 2: Create fine-tuning job
    ft_data = {
        "training_file": file_id,
        "model": model,
        "hyperparameters": {"n_epochs": n_epochs},
    }
    if suffix:
        ft_data["suffix"] = suffix
    else:
        ft_data["suffix"] = env.name.replace(" ", "-").lower()[:18]

    try:
        ft_result = _openai_request("/fine_tuning/jobs", method="POST", data=ft_data)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Failed to create fine-tune job: {str(e)[:200]}")

    # Track lineage in our DB
    try:
        lineage_id = str(uuid.uuid4())
        db.execute(sa_text("""
            INSERT INTO finetune_jobs (id, tenant_id, environment_id, openai_job_id,
                base_model, fine_tuned_model, training_file_id, training_examples,
                n_epochs, min_score, status, created_by, created_at,
                auto_deploy, workspace_id, mined_examples_count)
            VALUES (:id, :tenant_id, :env_id, :job_id, :model, :ft_model,
                :file_id, :examples, :epochs, :min_score, :status, :user_id, :now,
                :auto_deploy, :workspace_id, :mined_count)
        """), {
            "id": lineage_id,
            "tenant_id": user.tenant_id,
            "env_id": env.id,
            "job_id": ft_result.get("id", ""),
            "model": model,
            "ft_model": ft_result.get("fine_tuned_model", ""),
            "file_id": file_id,
            "examples": len(examples),
            "epochs": n_epochs,
            "min_score": min_score,
            "status": ft_result.get("status", "pending"),
            "user_id": user.id,
            "now": datetime.utcnow(),
            "auto_deploy": auto_deploy,
            "workspace_id": env.workspace_id,
            "mined_count": mined_count,
        })
        db.commit()
    except Exception as e:
        print(f"  [Finetune] Lineage tracking failed (non-fatal): {e}")

    return {
        "job_id": ft_result.get("id"),
        "status": ft_result.get("status"),
        "model": ft_result.get("model"),
        "fine_tuned_model": ft_result.get("fine_tuned_model"),
        "training_file": file_id,
        "training_examples": len(examples),
        "from_mined_corrections": mined_count,
        "n_epochs": n_epochs,
        "min_score_used": min_score,
        "auto_deploy": auto_deploy,
        "environment_id": env.id,
        "environment_name": env.name,
        "workspace_id": env.workspace_id,
        "created_at": ft_result.get("created_at"),
    }


# ── Fine-tune lineage (local DB tracking) ──

@router.get("/lineage")
def get_finetune_lineage(
    environment_id: str = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get fine-tune job lineage with environment connections.
    Shows which eval suites produced which fine-tuned models.
    """
    query = """
        SELECT fj.id, fj.environment_id, fj.openai_job_id, fj.base_model,
               fj.fine_tuned_model, fj.training_file_id, fj.training_examples,
               fj.n_epochs, fj.min_score, fj.status, fj.created_at,
               e.name as env_name
        FROM finetune_jobs fj
        LEFT JOIN environments e ON e.id = fj.environment_id
        WHERE fj.tenant_id = :tenant_id
    """
    params = {"tenant_id": user.tenant_id}

    if environment_id:
        query += " AND fj.environment_id = :env_id"
        params["env_id"] = environment_id

    query += " ORDER BY fj.created_at DESC LIMIT 50"

    rows = db.execute(sa_text(query), params).fetchall()

    jobs = []
    for row in rows:
        jobs.append({
            "id": row[0],
            "environment_id": row[1],
            "openai_job_id": row[2],
            "base_model": row[3],
            "fine_tuned_model": row[4] or "",
            "training_file_id": row[5],
            "training_examples": row[6],
            "n_epochs": row[7],
            "min_score": row[8],
            "status": row[9],
            "created_at": row[10].isoformat() if row[10] else None,
            "environment_name": row[11] or "",
        })

    return {"jobs": jobs, "total": len(jobs)}


# ── Check fine-tune job status ──

@router.get("/jobs/{job_id}")
def get_finetune_status(
    job_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Check the status of an OpenAI fine-tuning job."""
    result = _openai_request(f"/fine_tuning/jobs/{job_id}")

    return {
        "job_id": result.get("id"),
        "status": result.get("status"),
        "model": result.get("model"),
        "fine_tuned_model": result.get("fine_tuned_model"),
        "training_file": result.get("training_file"),
        "trained_tokens": result.get("trained_tokens"),
        "error": result.get("error"),
        "created_at": result.get("created_at"),
        "finished_at": result.get("finished_at"),
    }


# ── List fine-tune jobs ──

@router.get("/jobs")
def list_finetune_jobs(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List recent OpenAI fine-tuning jobs."""
    result = _openai_request("/fine_tuning/jobs?limit=20")
    jobs = result.get("data", [])

    return {
        "jobs": [
            {
                "job_id": j.get("id"),
                "status": j.get("status"),
                "model": j.get("model"),
                "fine_tuned_model": j.get("fine_tuned_model"),
                "training_file": j.get("training_file"),
                "trained_tokens": j.get("trained_tokens"),
                "created_at": j.get("created_at"),
                "finished_at": j.get("finished_at"),
            }
            for j in jobs
        ],
    }


# ── Cancel fine-tune job ──

@router.post("/jobs/{job_id}/cancel")
def cancel_finetune(
    job_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Cancel a running fine-tuning job."""
    result = _openai_request(f"/fine_tuning/jobs/{job_id}/cancel", method="POST")
    return {
        "job_id": result.get("id"),
        "status": result.get("status"),
    }


# ── Get fine-tune events (training progress) ──

@router.get("/jobs/{job_id}/events")
def get_finetune_events(
    job_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get training events/progress for a fine-tuning job."""
    result = _openai_request(f"/fine_tuning/jobs/{job_id}/events?limit=50")
    events = result.get("data", [])

    return {
        "events": [
            {
                "type": e.get("type"),
                "message": e.get("message"),
                "created_at": e.get("created_at"),
                "data": e.get("data"),
            }
            for e in events
        ],
    }


# ── Quick test: compare base vs fine-tuned model ──

@router.post("/compare")
def compare_models(
    question: str,
    base_model: str = Query("gpt-4o-mini"),
    fine_tuned_model: str = Query(""),
    system_prompt: str = Query("You are a helpful assistant."),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Compare responses from base model vs fine-tuned model side by side.
    Useful for quick A/B testing before running a full eval.
    """
    if not fine_tuned_model:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "fine_tuned_model is required")

    api_key = _get_openai_key()

    def _call_openai(model_name, prompt, system):
        data = {
            "model": model_name,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ],
            "max_tokens": 1024,
            "temperature": 0.2,
        }
        start = time.time()
        result = _openai_request("/chat/completions", method="POST", data=data)
        elapsed = int((time.time() - start) * 1000)
        content = result.get("choices", [{}])[0].get("message", {}).get("content", "")
        return {"answer": content, "response_time_ms": elapsed}

    base_result = _call_openai(base_model, question, system_prompt)
    ft_result = _call_openai(fine_tuned_model, question, system_prompt)

    return {
        "question": question,
        "base_model": {
            "model": base_model,
            "answer": base_result["answer"],
            "response_time_ms": base_result["response_time_ms"],
        },
        "fine_tuned_model": {
            "model": fine_tuned_model,
            "answer": ft_result["answer"],
            "response_time_ms": ft_result["response_time_ms"],
        },
    }


# ── Deploy fine-tuned model to a workspace ──

@router.post("/deploy")
def deploy_model(
    workspace_id: str,
    model: str = Query(..., description="Fine-tuned model ID (e.g. ft:gpt-4o-mini:cane:abc123)"),
    provider: str = Query("openai", description="Model provider (openai, anthropic, openai-compatible)"),
    api_key: str = Query(None, description="Provider API key (uses env var if not set)"),
    base_url: str = Query(None, description="Custom base URL for openai-compatible providers"),
    trigger_eval: bool = Query(False, description="Run eval after deploy to measure improvement"),
    background_tasks: BackgroundTasks = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Deploy a fine-tuned model to a workspace/agent.

    After deployment, the agent uses the fine-tuned model for inference
    instead of the global Claude model. This closes the loop:
    eval -> mine failures -> fine-tune -> deploy -> re-eval.
    """
    ws = db.query(Workspace).filter(
        Workspace.id == workspace_id,
        Workspace.tenant_id == user.tenant_id,
    ).first()
    if not ws:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workspace not found")

    # Validate provider
    from cane.inference.providers import PROVIDERS, PROVIDER_ALIASES
    resolved = PROVIDER_ALIASES.get(provider.lower(), provider.lower())
    if resolved not in PROVIDERS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown provider: {provider}")

    # Build config JSON
    config = {}
    if api_key:
        config["api_key"] = api_key
    if base_url:
        config["base_url"] = base_url

    # Save the previous model for rollback info
    previous = {
        "provider": ws.inference_provider,
        "model": ws.inference_model,
    }

    ws.inference_provider = resolved
    ws.inference_model = model
    ws.inference_config = json.dumps(config) if config else None
    db.commit()

    result = {
        "workspace_id": ws.id,
        "workspace_name": ws.name,
        "deployed_model": model,
        "provider": resolved,
        "previous_model": previous,
        "eval_triggered": False,
    }

    # Optionally trigger eval to measure improvement
    if trigger_eval and background_tasks:
        env = db.query(Environment).filter(
            Environment.workspace_id == workspace_id,
            Environment.tenant_id == user.tenant_id,
            Environment.is_active == True,
        ).first()
        if env:
            from cane.eval.engine import execute_eval_run
            run = EvalRun(
                environment_id=env.id,
                tenant_id=user.tenant_id,
                total_cases=db.query(EvalResult).filter(False).count(),  # placeholder
                agent_prompt=ws.system_prompt or "",
                triggered_by=user.id,
            )
            # Count test cases properly
            from cane.eval.models import TestCase
            run.total_cases = db.query(TestCase).filter(
                TestCase.environment_id == env.id
            ).count()
            db.add(run)
            db.commit()
            background_tasks.add_task(execute_eval_run, run.id, SessionLocal())
            result["eval_triggered"] = True
            result["eval_run_id"] = run.id

    print(f"  [Finetune] Deployed {model} ({resolved}) to workspace {ws.name}")
    return result


@router.post("/undeploy")
def undeploy_model(
    workspace_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Remove a deployed fine-tuned model from a workspace.
    The agent reverts to the global Claude model.
    """
    ws = db.query(Workspace).filter(
        Workspace.id == workspace_id,
        Workspace.tenant_id == user.tenant_id,
    ).first()
    if not ws:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workspace not found")

    previous = {
        "provider": ws.inference_provider,
        "model": ws.inference_model,
    }

    ws.inference_provider = None
    ws.inference_model = None
    ws.inference_config = None
    db.commit()

    print(f"  [Finetune] Undeployed model from workspace {ws.name}")
    return {
        "workspace_id": ws.id,
        "workspace_name": ws.name,
        "previous_model": previous,
        "status": "reverted to default model",
    }


@router.get("/deployment")
def get_deployment_status(
    workspace_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Check what model is deployed to a workspace."""
    ws = db.query(Workspace).filter(
        Workspace.id == workspace_id,
        Workspace.tenant_id == user.tenant_id,
    ).first()
    if not ws:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workspace not found")

    has_custom = bool(ws.inference_model)
    return {
        "workspace_id": ws.id,
        "workspace_name": ws.name,
        "has_custom_model": has_custom,
        "inference_provider": ws.inference_provider,
        "inference_model": ws.inference_model,
        "default_model": "claude-haiku-4-5-20251001",
    }


# ── Eval comparison: measure improvement after fine-tuning ──

@router.get("/eval-history")
def get_eval_history(
    workspace_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get eval score history for a workspace across all runs.
    Shows whether fine-tuned models are actually improving performance.
    """
    envs = db.query(Environment).filter(
        Environment.workspace_id == workspace_id,
        Environment.tenant_id == user.tenant_id,
    ).all()

    if not envs:
        return {"runs": [], "trend": None}

    runs = db.query(EvalRun).filter(
        EvalRun.environment_id.in_([e.id for e in envs]),
        EvalRun.status == "completed",
    ).order_by(EvalRun.created_at.asc()).all()

    # Get workspace to check current model
    ws = db.query(Workspace).filter(Workspace.id == workspace_id).first()

    history = []
    for r in runs:
        history.append({
            "run_id": r.id,
            "score": r.overall_score,
            "passed": r.passed,
            "warned": r.warned,
            "failed": r.failed,
            "reliability_score": r.reliability_score,
            "reliability_grade": r.reliability_grade,
            "latency_p95_ms": r.latency_p95_ms,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        })

    # Compute trend
    trend = None
    if len(history) >= 2:
        scores = [h["score"] for h in history if h["score"] is not None]
        if len(scores) >= 2:
            first_half = scores[:len(scores) // 2]
            second_half = scores[len(scores) // 2:]
            avg_first = sum(first_half) / len(first_half)
            avg_second = sum(second_half) / len(second_half)
            delta = round(avg_second - avg_first, 1)
            trend = {
                "direction": "improving" if delta > 0 else "regressing" if delta < 0 else "stable",
                "delta_pp": delta,
                "first_half_avg": round(avg_first, 1),
                "second_half_avg": round(avg_second, 1),
            }

    return {
        "workspace_id": workspace_id,
        "current_model": ws.inference_model if ws else None,
        "runs": history,
        "total_runs": len(history),
        "trend": trend,
    }


@router.post("/sync-job")
def sync_finetune_job(
    job_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Sync a fine-tune job status from OpenAI and update lineage.
    If the job succeeded and auto_deploy is set, deploys the model.
    """
    # Get OpenAI status
    result = _openai_request(f"/fine_tuning/jobs/{job_id}")
    openai_status = result.get("status", "")
    ft_model = result.get("fine_tuned_model", "")

    # Update our lineage record
    try:
        db.execute(sa_text("""
            UPDATE finetune_jobs
            SET status = :status, fine_tuned_model = :ft_model, updated_at = :now
            WHERE openai_job_id = :job_id AND tenant_id = :tenant_id
        """), {
            "status": openai_status,
            "ft_model": ft_model or "",
            "now": datetime.utcnow(),
            "job_id": job_id,
            "tenant_id": user.tenant_id,
        })
        db.commit()
    except Exception as e:
        print(f"  [Finetune] Lineage sync failed: {e}")

    # Auto-deploy if job succeeded
    deployed = False
    if openai_status == "succeeded" and ft_model:
        row = db.execute(sa_text("""
            SELECT auto_deploy, workspace_id FROM finetune_jobs
            WHERE openai_job_id = :job_id AND tenant_id = :tenant_id
        """), {"job_id": job_id, "tenant_id": user.tenant_id}).fetchone()

        if row and row[0] and row[1]:
            ws = db.query(Workspace).filter(
                Workspace.id == row[1],
                Workspace.tenant_id == user.tenant_id,
            ).first()
            if ws:
                ws.inference_provider = "openai"
                ws.inference_model = ft_model
                db.commit()
                deployed = True
                print(f"  [Finetune] Auto-deployed {ft_model} to workspace {ws.name}")

    return {
        "job_id": job_id,
        "status": openai_status,
        "fine_tuned_model": ft_model,
        "auto_deployed": deployed,
    }
