"""
services/model_router.py -- Model registry and task-based routing.

Routes inference requests to the right model based on task type.
Supports OpenRouter for open source models, plus Anthropic and OpenAI direct.

Usage:
    from cane.inference.router import router as model_router

    text = model_router.call("agent_conversation", system="...", prompt="...")
    text = model_router.call("memory_significance", system="...", prompt="...", max_tokens=5)
"""
import json
import os
import urllib.request
import urllib.error

from cane.core.config import OPENROUTER_API_KEY, ANTHROPIC_API_KEY


# ── Model Registry ──

MODELS = {
    "trinity-large-thinking": {
        "provider": "openrouter",
        "model_id": "arcee-ai/trinity-large-thinking",
        "role": "primary_agent",
        "description": "400B MoE (13B active). Best open model for multi-turn agent coherence and tool use.",
        "strengths": ["agent_loops", "tool_calling", "instruction_following", "long_context"],
        "context_window": 128000,
        "cost_per_m_input": 0.30,
        "cost_per_m_output": 0.90,
    },
    "qwen3-235b": {
        "provider": "openrouter",
        "model_id": "qwen/qwen3-235b-a22b",
        "role": "secondary_agent",
        "description": "235B MoE (22B active). Strong reasoning and structured output.",
        "strengths": ["reasoning", "structured_output", "multilingual", "math"],
        "context_window": 131072,
        "cost_per_m_input": 0.12,
        "cost_per_m_output": 0.18,
    },
    "qwen-coder": {
        "provider": "openrouter",
        "model_id": "qwen/qwen2.5-coder-32b-instruct",
        "role": "coding",
        "description": "32B coding specialist.",
        "strengths": ["code_generation", "debugging", "tool_authoring"],
        "context_window": 131072,
        "cost_per_m_input": 0.07,
        "cost_per_m_output": 0.16,
    },
    "qwen-vl": {
        "provider": "openrouter",
        "model_id": "qwen/qwen2.5-vl-72b-instruct",
        "role": "multimodal",
        "description": "72B vision-language model.",
        "strengths": ["image_understanding", "ocr", "visual_reasoning"],
        "context_window": 32768,
        "cost_per_m_input": 0.40,
        "cost_per_m_output": 0.40,
    },
    "qwen3-30b": {
        "provider": "openrouter",
        "model_id": "qwen/qwen3-30b-a3b",
        "role": "utility",
        "description": "30B MoE (3B active). Ultra cheap for lightweight tasks.",
        "strengths": ["classification", "extraction", "quick_tasks"],
        "context_window": 131072,
        "cost_per_m_input": 0.05,
        "cost_per_m_output": 0.10,
    },
    "claude-sonnet": {
        "provider": "anthropic",
        "model_id": "claude-sonnet-4-5-20250929",
        "role": "judge",
        "description": "Claude Sonnet. Gold standard for evaluation judging.",
        "strengths": ["evaluation", "nuanced_scoring", "reasoning"],
        "context_window": 200000,
        "cost_per_m_input": 3.00,
        "cost_per_m_output": 15.00,
    },
    "claude-haiku": {
        "provider": "anthropic",
        "model_id": "claude-haiku-4-5-20251001",
        "role": "fast",
        "description": "Claude Haiku. Fast and cheap for routine tasks.",
        "strengths": ["speed", "classification", "extraction"],
        "context_window": 200000,
        "cost_per_m_input": 0.80,
        "cost_per_m_output": 4.00,
    },
}


# ── Default Task Routing ──

DEFAULT_ROUTING = {
    "agent_conversation": "trinity-large-thinking",
    "memory_significance": "qwen3-30b",
    "memory_cloud_update": "qwen3-235b",
    "memory_thread_summary": "qwen3-30b",
    "eval_judge": "claude-sonnet",
    "eval_judge_oss": "trinity-large-thinking",
    "personality_eval": "trinity-large-thinking",
    "personality_scoring": "qwen3-235b",
    "code_generation": "qwen-coder",
    "visual_analysis": "qwen-vl",
    "failure_rewrite": "trinity-large-thinking",
    "rag_response": "trinity-large-thinking",
}


# ── Router ──

class ModelRouter:
    """Routes inference requests to the appropriate model based on task type."""

    def get_model(self, task: str, model_override: str = None) -> dict:
        """Get the model config for a task, allowing overrides."""
        if model_override and model_override in MODELS:
            return MODELS[model_override]
        model_key = DEFAULT_ROUTING.get(task, "trinity-large-thinking")
        return MODELS.get(model_key, MODELS["trinity-large-thinking"])

    def call(
        self,
        task: str,
        prompt: str,
        system: str = "",
        model_override: str = None,
        max_tokens: int = 1000,
        temperature: float = 0.7,
    ) -> str:
        """Route a call to the appropriate model."""
        model = self.get_model(task, model_override)
        provider = model["provider"]

        if provider == "openrouter":
            return _call_openrouter(
                model=model["model_id"],
                system=system,
                prompt=prompt,
                max_tokens=max_tokens,
                temperature=temperature,
            )
        elif provider == "anthropic":
            from cane.inference.claude import call as claude_call
            return claude_call(
                prompt=prompt,
                system=system,
                model=model["model_id"],
                max_tokens=max_tokens,
                temperature=temperature,
            )
        else:
            # Fallback to OpenAI-compatible via judge_providers
            from cane.inference.providers import get_provider
            p = get_provider(provider=provider, model=model["model_id"])
            return p.call(prompt=prompt, system=system, max_tokens=max_tokens, temperature=temperature)

    def list_models(self) -> list[dict]:
        """List all available models with metadata."""
        return [
            {"key": k, **{f: v for f, v in m.items() if f != "model_id"}, "model_id": m["model_id"]}
            for k, m in MODELS.items()
        ]

    def list_tasks(self) -> dict:
        """List all task types and their default model."""
        return dict(DEFAULT_ROUTING)


# ── OpenRouter API ──

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


def _call_openrouter(
    model: str,
    system: str,
    prompt: str,
    max_tokens: int = 1000,
    temperature: float = 0.7,
) -> str:
    """Call a model via OpenRouter's API."""
    api_key = OPENROUTER_API_KEY
    if not api_key:
        raise RuntimeError("OPENROUTER_API_KEY not configured")

    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    payload = {
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://cane.fyi",
        "X-Title": "Softmax Gulch",
    }

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(OPENROUTER_URL, data=data, headers=headers, method="POST")

    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            result = json.loads(resp.read().decode("utf-8"))
            return result["choices"][0]["message"]["content"]
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")[:500]
        raise RuntimeError(f"OpenRouter API error ({e.code}): {body}")


# ── Singleton ──

router = ModelRouter()
