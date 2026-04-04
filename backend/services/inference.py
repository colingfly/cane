"""
services/inference.py -- Multi-provider inference for agent responses.

When a workspace has a fine-tuned model deployed (inference_provider + inference_model),
this module routes the call to the right provider instead of defaulting to Claude.

Supports: Anthropic (default), OpenAI (fine-tuned models), OpenAI-compatible endpoints.

Usage:
    from services.inference import infer, infer_stream

    # Uses workspace's deployed model if set, otherwise falls back to Claude
    text = infer(prompt, system=system, workspace=ws)

    # Streaming
    for chunk in infer_stream(prompt, system=system, workspace=ws):
        yield chunk  # SSE-formatted string
"""
import json
import os
from typing import Optional

from config import CLAUDE_MODEL


def _get_workspace_provider(workspace):
    """Build a provider from a workspace's inference config. Returns None if no override."""
    if not workspace or not workspace.inference_model:
        return None

    provider_name = workspace.inference_provider or "openai"
    model = workspace.inference_model

    # Parse optional config (api_key, base_url)
    extra = {}
    if workspace.inference_config:
        try:
            parsed = json.loads(workspace.inference_config)
            if parsed.get("api_key"):
                extra["api_key"] = parsed["api_key"]
            if parsed.get("base_url"):
                extra["base_url"] = parsed["base_url"]
        except (json.JSONDecodeError, TypeError):
            pass

    from services.judge_providers import get_provider
    return get_provider(provider=provider_name, model=model, **extra)


def infer(
    prompt: str,
    system: str = "",
    workspace=None,
    model: str = None,
    max_tokens: int = 1024,
    temperature: float = 0.3,
    messages: list = None,
) -> str:
    """
    Call the appropriate LLM for a workspace.

    If the workspace has a deployed fine-tuned model, uses that provider.
    Otherwise falls back to the default Claude model.
    """
    provider = _get_workspace_provider(workspace)

    if provider:
        # Use the deployed fine-tuned model
        return provider.call(
            prompt=prompt if not messages else messages[-1].get("content", prompt),
            system=system,
            max_tokens=max_tokens,
            temperature=temperature,
        )

    # Default: use Claude
    from services.claude import call
    return call(
        prompt=prompt,
        system=system,
        model=model,
        max_tokens=max_tokens,
        temperature=temperature,
        messages=messages,
    )


def infer_stream(
    prompt: str = "",
    system: str = "",
    workspace=None,
    messages: list = None,
    max_tokens: int = 1024,
    temperature: float = 0.3,
):
    """
    Stream LLM response as SSE data lines.

    If workspace has a deployed model, streams from that provider.
    Otherwise streams from Claude.

    Yields strings like: 'data: {"type":"text","text":"Hello"}\n\n'
    """
    provider = _get_workspace_provider(workspace)

    if provider:
        yield from _stream_openai_compatible(provider, prompt, system, messages, max_tokens, temperature)
    else:
        yield from _stream_claude(prompt, system, messages, max_tokens, temperature)


def _stream_claude(prompt, system, messages, max_tokens, temperature):
    """Stream from Claude using the Anthropic SDK."""
    from services.claude import client
    if not client:
        yield _sse({"type": "error", "error": "No API key"})
        return

    import anthropic
    msg_list = messages or [{"role": "user", "content": prompt}]
    try:
        with client.messages.stream(
            model=CLAUDE_MODEL,
            max_tokens=max_tokens,
            temperature=temperature,
            system=system or anthropic.NOT_GIVEN,
            messages=msg_list,
        ) as stream:
            for text in stream.text_stream:
                if text:
                    yield _sse({"type": "text", "text": text})
    except Exception as e:
        yield _sse({"type": "error", "error": str(e)})


def _stream_openai_compatible(provider, prompt, system, messages, max_tokens, temperature):
    """Stream from OpenAI or OpenAI-compatible provider."""
    try:
        from openai import OpenAI
    except ImportError:
        yield _sse({"type": "error", "error": "openai package required for fine-tuned model streaming"})
        return

    # Build the OpenAI client from provider config
    client = provider._client if hasattr(provider, '_client') else None
    if not client:
        yield _sse({"type": "error", "error": "Provider client not available"})
        return

    msg_list = []
    if system:
        msg_list.append({"role": "system", "content": system})
    if messages:
        msg_list.extend(messages)
    else:
        msg_list.append({"role": "user", "content": prompt})

    try:
        stream = client.chat.completions.create(
            model=provider.model,
            messages=msg_list,
            max_tokens=max_tokens,
            temperature=temperature,
            stream=True,
        )
        for chunk in stream:
            delta = chunk.choices[0].delta if chunk.choices else None
            if delta and delta.content:
                yield _sse({"type": "text", "text": delta.content})
    except Exception as e:
        yield _sse({"type": "error", "error": str(e)})


def get_model_display(workspace) -> str:
    """Get the display name of the model a workspace is using."""
    if workspace and workspace.inference_model:
        provider = workspace.inference_provider or "openai"
        return f"{provider}/{workspace.inference_model}"
    return CLAUDE_MODEL


def _sse(data: dict) -> str:
    """Format a dict as an SSE data line."""
    return f"data: {json.dumps(data)}\n\n"
