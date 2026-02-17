"""
streaming.py — SSE streaming for Cane Ask endpoint.

Provides:
  - _stream_claude(): Generator that yields SSE events from Claude API
  - Conversation history management
"""
import json
import urllib.request
from config import ANTHROPIC_API_KEY, CLAUDE_MODEL


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
    if not ANTHROPIC_API_KEY:
        yield _sse({"type": "error", "error": "No API key"})
        return

    msg_list = messages or [{"role": "user", "content": user_prompt}]

    payload = {
        "model": CLAUDE_MODEL,
        "max_tokens": 1024,
        "temperature": 0.3,
        "stream": True,
        "system": system,
        "messages": msg_list,
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

    try:
        resp = urllib.request.urlopen(req, timeout=60)
        buffer = ""
        for raw_line in resp:
            line = raw_line.decode("utf-8", errors="replace")
            buffer += line
            while "\n" in buffer:
                event_line, buffer = buffer.split("\n", 1)
                event_line = event_line.strip()
                if not event_line:
                    continue
                if event_line.startswith("data: "):
                    json_str = event_line[6:]
                    if json_str.strip() == "[DONE]":
                        return
                    try:
                        evt = json.loads(json_str)
                        evt_type = evt.get("type", "")
                        if evt_type == "content_block_delta":
                            delta = evt.get("delta", {})
                            if delta.get("type") == "text_delta":
                                text = delta.get("text", "")
                                if text:
                                    yield _sse({"type": "text", "text": text})
                        elif evt_type == "message_stop":
                            return
                    except json.JSONDecodeError:
                        continue
    except Exception as e:
        yield _sse({"type": "error", "error": str(e)})


def _sse(data: dict) -> str:
    """Format a dict as an SSE data line."""
    return f"data: {json.dumps(data)}\n\n"
