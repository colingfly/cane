"""
streaming.py — SSE streaming for Cane Ask endpoint.

Provides:
  - stream_claude(): Generator that yields SSE events from Claude API
  - Conversation history management

Now uses the Anthropic SDK's native streaming — no more manual SSE parsing.
"""
import json
from cane.inference.claude import client
from cane.core.config import CLAUDE_MODEL


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


def persist_conversation_turn(
    session_id, workspace_id, tenant_id, user_id,
    query, answer, sources=None, chunks_used=0,
    response_time_ms=None, channel="internal",
):
    """
    Persist a conversation turn to the database.
    Fire-and-forget: never raises, opens its own DB session.
    """
    if not workspace_id or not query or not answer:
        return
    try:
        from cane.core.database import SessionLocal
        from cane.agents.conversation_models import Conversation, ConversationMessage
        from datetime import datetime

        db = SessionLocal()
        try:
            # Find existing conversation by session_id + workspace_id
            conv = None
            if session_id:
                conv = db.query(Conversation).filter(
                    Conversation.session_id == session_id,
                    Conversation.workspace_id == workspace_id,
                ).first()

            if not conv:
                # Create new conversation
                conv = Conversation(
                    workspace_id=workspace_id,
                    tenant_id=tenant_id,
                    user_id=user_id,
                    session_id=session_id or "",
                    title=query[:80],
                    channel=channel,
                    message_count=0,
                )
                db.add(conv)
                db.flush()

            # Add user message
            user_msg = ConversationMessage(
                conversation_id=conv.id,
                role="user",
                content=query,
                chunks_used=0,
            )
            db.add(user_msg)

            # Add assistant message
            import json as _json
            sources_json = _json.dumps(sources or [])
            asst_msg = ConversationMessage(
                conversation_id=conv.id,
                role="assistant",
                content=answer,
                sources=sources_json,
                chunks_used=chunks_used,
                response_time_ms=response_time_ms,
            )
            db.add(asst_msg)

            conv.message_count = (conv.message_count or 0) + 2
            conv.updated_at = datetime.utcnow()
            db.commit()
        finally:
            db.close()
    except Exception as e:
        print(f"  [Conversations] Persist failed: {e}")


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
