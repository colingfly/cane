"""
streaming.py — SSE streaming for Cane Ask endpoint.

Provides:
  - stream_claude(): Generator that yields SSE events from Claude API
  - Conversation history management

Now uses the Anthropic SDK's native streaming — no more manual SSE parsing.
"""
import json
from services.claude import client
from config import CLAUDE_MODEL


# ── Conversation memory (in-memory, per-session) ──
_conversation_history: dict[str, list] = {}


def get_conversation_history(session_id: str) -> list:
    """Get conversation history for a session."""
    if session_id and session_id in _conversation_history:
        return list(_conversation_history[session_id])
    return []


def save_conversation_turn(session_id: str, query: str, answer: str):
    """Save a Q&A turn to conversation history."""
    if not session_id or not answer:
        return
    if session_id not in _conversation_history:
        _conversation_history[session_id] = []
    hist = _conversation_history[session_id]
    hist.append({"role": "user", "content": query})
    hist.append({"role": "assistant", "content": answer})
    # Keep only last 5 turns (10 messages)
    if len(hist) > 10:
        _conversation_history[session_id] = hist[-10:]


def stream_claude(user_prompt: str, system: str = "", messages: list = None):
    """
    Stream Claude API response as SSE data lines.
    Yields strings like: 'data: {"type":"text","text":"Hello"}\n\n'
    """
    if not client:
        yield _sse({"type": "error", "error": "No API key"})
        return

    msg_list = messages or [{"role": "user", "content": user_prompt}]

    try:
        import anthropic
        with client.messages.stream(
            model=CLAUDE_MODEL,
            max_tokens=1024,
            temperature=0.3,
            system=system or anthropic.NOT_GIVEN,
            messages=msg_list,
        ) as stream:
            for text in stream.text_stream:
                if text:
                    yield _sse({"type": "text", "text": text})
    except Exception as e:
        yield _sse({"type": "error", "error": str(e)})


def _sse(data: dict) -> str:
    """Format a dict as an SSE data line."""
    return f"data: {json.dumps(data)}\n\n"
