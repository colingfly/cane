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

from database import get_db, SessionLocal
from auth import get_current_user
from db_models import User
from eval_models import Environment, EvalRun, EvalResult

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
    max_results: int = Query(500, ge=10, le=5000),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Generate a fine-tuning dataset from eval results.
    Pulls high-scoring responses across all completed runs.
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

    # Get high-scoring results across all runs
    results = db.query(EvalResult).filter(
        EvalResult.eval_run_id.in_([r.id for r in runs]),
        EvalResult.overall_score >= min_score,
    ).order_by(EvalResult.overall_score.desc()).limit(max_results).all()

    if not results:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            f"No results found with score >= {min_score}. Lower the threshold or run more evals.")

    # Deduplicate by question (keep highest scoring)
    seen_questions = {}
    deduped = []
    for r in results:
        q = r.question.strip()
        if q not in seen_questions or r.overall_score > seen_questions[q]:
            seen_questions[q] = r.overall_score
            deduped.append(r)

    # Get system prompt from the latest run
    latest_run = max(runs, key=lambda r: r.created_at)
    system_prompt = latest_run.agent_prompt or "You are a helpful assistant."

    # Build dataset
    if format == "openai":
        examples = []
        for r in deduped:
            examples.append({
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": r.question},
                    {"role": "assistant", "content": r.agent_answer or ""},
                ]
            })
    else:
        examples = []
        for r in deduped:
            examples.append({
                "prompt": r.question,
                "completion": r.agent_answer or "",
            })

    dataset_content = "\n".join(json.dumps(ex) for ex in examples)

    return {
        "dataset_preview": examples[:3],
        "total_examples": len(examples),
        "min_score_used": min_score,
        "source_runs": len(runs),
        "format": format,
        "system_prompt_preview": system_prompt[:200],
        "dataset_jsonl": dataset_content,
    }


# ── Submit fine-tune job to OpenAI ──

@router.post("/submit")
def submit_finetune(
    environment_id: str,
    model: str = Query("gpt-4o-mini-2024-07-18"),
    min_score: float = Query(80, ge=0, le=100),
    n_epochs: int = Query(3, ge=1, le=10),
    suffix: str = Query(""),
    background_tasks: BackgroundTasks = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Submit a fine-tuning job to OpenAI using high-scoring eval results.

    Flow:
    1. Generate training JSONL from eval results
    2. Upload file to OpenAI
    3. Create fine-tuning job
    4. Return job details for tracking
    """
    env = db.query(Environment).filter(
        Environment.id == environment_id,
        Environment.tenant_id == user.tenant_id,
        Environment.is_active == True,
    ).first()
    if not env:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Environment not found")

    # Generate training data
    runs = db.query(EvalRun).filter(
        EvalRun.environment_id == env.id,
        EvalRun.status == "completed",
    ).all()

    if not runs:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No completed eval runs")

    results = db.query(EvalResult).filter(
        EvalResult.eval_run_id.in_([r.id for r in runs]),
        EvalResult.overall_score >= min_score,
    ).order_by(EvalResult.overall_score.desc()).all()

    if len(results) < 10:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            f"Need at least 10 high-scoring examples (found {len(results)} with score >= {min_score}). "
                            "Run more evals or lower the score threshold.")

    # Deduplicate
    seen = {}
    deduped = []
    for r in results:
        q = r.question.strip()
        if q not in seen:
            seen[q] = True
            deduped.append(r)

    latest_run = max(runs, key=lambda r: r.created_at)
    system_prompt = latest_run.agent_prompt or "You are a helpful assistant."

    # Build JSONL
    examples = []
    for r in deduped:
        examples.append({
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": r.question},
                {"role": "assistant", "content": r.agent_answer or ""},
            ]
        })

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

    return {
        "job_id": ft_result.get("id"),
        "status": ft_result.get("status"),
        "model": ft_result.get("model"),
        "fine_tuned_model": ft_result.get("fine_tuned_model"),
        "training_file": file_id,
        "training_examples": len(examples),
        "n_epochs": n_epochs,
        "min_score_used": min_score,
        "environment_id": env.id,
        "environment_name": env.name,
        "created_at": ft_result.get("created_at"),
    }


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
