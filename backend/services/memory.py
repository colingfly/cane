"""
memory.py -- Agent Memory extraction, retrieval, and formatting.

Extracts key facts from conversations using Claude, stores them persistently,
and formats them for injection into future system prompts.
"""
import json
import threading
import traceback
from datetime import datetime

from database import SessionLocal
from memory_models import AgentMemory


EXTRACTION_PROMPT = """You are a memory extraction system. Given a conversation turn between a user and an AI assistant, extract key facts worth remembering for future conversations.

Extract ONLY information that would be genuinely useful to recall later. Focus on:
- User preferences (communication style, formatting choices, topics of interest)
- Personal facts (name, role, location, school, company, hobbies)
- Decisions made or conclusions reached
- Specific instructions about how they want things done

Rules:
- Be concise. Each memory should be one clear sentence.
- Do not extract generic or obvious facts.
- Do not extract information that is only relevant to the current question.
- If nothing worth remembering, return an empty array.

Return ONLY a valid JSON array. Each item: {"type": "preference|fact|context|instruction", "content": "...", "confidence": 0.8}

User said: {query}

Assistant responded: {answer}"""


def extract_memories_background(
    query: str,
    answer: str,
    workspace_id: str,
    tenant_id: str,
    user_id: str,
):
    """
    Spawn a background thread to extract and save memories.
    Non-blocking. Called after a conversation turn completes.
    """
    if not query or not answer or not workspace_id:
        return

    thread = threading.Thread(
        target=_extract_and_save,
        args=(query, answer, workspace_id, tenant_id, user_id),
        daemon=True,
    )
    thread.start()


def _extract_and_save(
    query: str,
    answer: str,
    workspace_id: str,
    tenant_id: str,
    user_id: str,
):
    """Extract memories from a conversation turn and save to DB."""
    db = SessionLocal()
    try:
        from services.claude import call

        # Call Claude to extract memories (use small/fast model)
        prompt = EXTRACTION_PROMPT.format(
            query=query[:1500],
            answer=answer[:1500],
        )

        raw = call(prompt, max_tokens=512, temperature=0.1)

        # Parse JSON response
        memories = _parse_extraction(raw)
        if not memories:
            return

        # Load existing memories for dedup
        existing = db.query(AgentMemory).filter(
            AgentMemory.workspace_id == workspace_id,
            AgentMemory.is_active == True,
        )
        if user_id:
            existing = existing.filter(
                (AgentMemory.user_id == user_id) | (AgentMemory.user_id.is_(None))
            )
        existing_contents = [m.content.lower().strip() for m in existing.all()]

        saved = 0
        for mem in memories:
            content = mem.get("content", "").strip()
            if not content or len(content) < 5:
                continue

            # Simple dedup: skip if substantially similar to existing
            if _is_duplicate(content, existing_contents):
                continue

            memory = AgentMemory(
                workspace_id=workspace_id,
                tenant_id=tenant_id,
                user_id=user_id,
                memory_type=mem.get("type", "fact"),
                content=content,
                source_query=query[:500],
                confidence=min(max(float(mem.get("confidence", 0.8)), 0.0), 1.0),
            )
            db.add(memory)
            existing_contents.append(content.lower().strip())
            saved += 1

        if saved:
            db.commit()
            print(f"  [Memory] Extracted {saved} memories for {workspace_id[:8]}")

    except Exception as e:
        print(f"  [Memory] Extraction error: {e}")
        traceback.print_exc()
    finally:
        db.close()


def _parse_extraction(raw: str) -> list[dict]:
    """Parse Claude's JSON array response, handling markdown code fences."""
    text = raw.strip()
    # Strip markdown code fences if present
    if text.startswith("```"):
        lines = text.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        text = "\n".join(lines).strip()

    try:
        result = json.loads(text)
        if isinstance(result, list):
            return result
    except json.JSONDecodeError:
        # Try to find a JSON array in the text
        start = text.find("[")
        end = text.rfind("]")
        if start >= 0 and end > start:
            try:
                return json.loads(text[start:end + 1])
            except json.JSONDecodeError:
                pass
    return []


def _is_duplicate(new_content: str, existing: list[str]) -> bool:
    """Check if a memory is substantially similar to existing ones."""
    new_lower = new_content.lower().strip()
    for existing_content in existing:
        # Exact match
        if new_lower == existing_content:
            return True
        # Substring containment (either direction)
        if len(new_lower) > 10 and len(existing_content) > 10:
            if new_lower in existing_content or existing_content in new_lower:
                return True
    return False


def get_memories(
    workspace_id: str,
    user_id: str = None,
    db=None,
    limit: int = 20,
) -> list[dict]:
    """
    Retrieve active memories for an agent, optionally filtered by user.
    Returns the most recent memories up to the limit.
    """
    should_close = False
    if db is None:
        db = SessionLocal()
        should_close = True

    try:
        q = db.query(AgentMemory).filter(
            AgentMemory.workspace_id == workspace_id,
            AgentMemory.is_active == True,
        )
        if user_id:
            # Get user-specific memories + global agent memories
            q = q.filter(
                (AgentMemory.user_id == user_id) | (AgentMemory.user_id.is_(None))
            )
        else:
            q = q.filter(AgentMemory.user_id.is_(None))

        memories = q.order_by(AgentMemory.created_at.desc()).limit(limit).all()

        return [
            {
                "id": m.id,
                "memory_type": m.memory_type,
                "content": m.content,
                "confidence": m.confidence,
                "created_at": m.created_at.isoformat() if m.created_at else None,
            }
            for m in memories
        ]
    finally:
        if should_close:
            db.close()


def format_memories_for_prompt(memories: list[dict]) -> str:
    """
    Format memories into a string for injection into the system prompt.
    Returns empty string if no memories.
    """
    if not memories:
        return ""

    lines = []
    for mem in memories:
        content = mem.get("content", "")
        if content:
            lines.append(f"- {content}")

    if not lines:
        return ""

    return (
        "\n\n=== Things you remember about this user from previous conversations ===\n"
        + "\n".join(lines)
        + "\n\nUse these memories naturally. Do not list them back unless asked. "
        + "If a memory conflicts with something the user says now, trust what they say now.\n"
    )
