"""
services/claude.py — Centralized Anthropic API client.

Single client instance with automatic retries. All modules import from here
instead of building their own urllib calls.

Usage:
    from services.claude import client, call, stream

    # Simple call
    text = call("What is 2+2?", system="You are a math tutor.", model="claude-sonnet-4-5-20250929")

    # Streaming
    for event in stream("Tell me a story", system="You are a storyteller."):
        print(event.type)  # content_block_delta, message_stop, etc.

    # With tools
    response = client.messages.create(model=..., messages=..., tools=...)
"""
import anthropic
from config import ANTHROPIC_API_KEY, CLAUDE_MODEL

# ── Singleton client ──
# The SDK handles retries, connection pooling, and timeouts automatically.
client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY) if ANTHROPIC_API_KEY else None


def call(
    prompt: str,
    system: str = "",
    model: str = None,
    max_tokens: int = 1024,
    temperature: float = 0.3,
    messages: list = None,
) -> str:
    """
    Call Claude and return the text response.

    Args:
        prompt: User message (ignored if `messages` is provided).
        system: System prompt.
        model: Model to use (defaults to CLAUDE_MODEL from config).
        max_tokens: Max response tokens.
        temperature: Sampling temperature.
        messages: Full message list (overrides prompt).

    Returns:
        The text content of Claude's response.
    """
    if not client:
        raise RuntimeError("ANTHROPIC_API_KEY not configured")

    msg_list = messages or [{"role": "user", "content": prompt}]

    response = client.messages.create(
        model=model or CLAUDE_MODEL,
        max_tokens=max_tokens,
        temperature=temperature,
        system=system or anthropic.NOT_GIVEN,
        messages=msg_list,
    )

    return "".join(
        block.text for block in response.content if block.type == "text"
    ).strip()


def call_with_tools(
    messages: list,
    system: str,
    tools: list,
    model: str = None,
    max_tokens: int = 4096,
    temperature: float = 0.3,
) -> anthropic.types.Message:
    """
    Call Claude with tool definitions. Returns the raw Message object
    so callers can inspect stop_reason and content blocks.
    """
    if not client:
        raise RuntimeError("ANTHROPIC_API_KEY not configured")

    return client.messages.create(
        model=model or CLAUDE_MODEL,
        max_tokens=max_tokens,
        temperature=temperature,
        system=system,
        messages=messages,
        tools=tools,
    )


def stream(
    prompt: str = "",
    system: str = "",
    model: str = None,
    max_tokens: int = 1024,
    temperature: float = 0.3,
    messages: list = None,
):
    """
    Stream Claude's response. Yields SDK event objects.

    Usage:
        with stream("Hello") as events:
            for event in events:
                if event.type == "content_block_delta" and event.delta.type == "text_delta":
                    print(event.delta.text, end="")
    """
    if not client:
        raise RuntimeError("ANTHROPIC_API_KEY not configured")

    msg_list = messages or [{"role": "user", "content": prompt}]

    return client.messages.stream(
        model=model or CLAUDE_MODEL,
        max_tokens=max_tokens,
        temperature=temperature,
        system=system or anthropic.NOT_GIVEN,
        messages=msg_list,
    )
