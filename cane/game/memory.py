"""
services/game_memory.py -- Hierarchical memory for Softmax Gulch agents.

Three layers:
  Layer 1: Topic Cloud -- compact JSON (~300 tokens) always in context.
           Updated end-of-day via Claude. Gives ambient self-awareness.
  Layer 2: Thread Summaries -- 1-3 sentence memories of significant moments.
           Generated real-time after significant conversations.
           Retrieved by matching topic tags against current conversation.
  Layer 3: Full Traces -- Cane's existing RAG pipeline (ChromaDB search).
           Triggered by agent via [RECALL: query] mechanism.
"""
import json
import re
import threading
from datetime import datetime

from sqlalchemy.orm import Session

from cane.core.database import SessionLocal
from cane.game.models import AgentTopicCloud, GameThreadSummary, GameConversation, GameEvent, AgentGameState
from cane.core.models import Workspace


# ── Layer 1: Topic Cloud ──

def get_topic_cloud(workspace_id: str, db: Session) -> dict:
    """Get an agent's topic cloud. Returns empty dict if none exists."""
    row = db.query(AgentTopicCloud).filter(
        AgentTopicCloud.workspace_id == workspace_id,
    ).first()
    if row and row.cloud_data:
        return row.cloud_data
    return {}


def save_topic_cloud(workspace_id: str, tenant_id: str, cloud_data: dict, game_day: int, db: Session):
    """Save or update an agent's topic cloud."""
    row = db.query(AgentTopicCloud).filter(
        AgentTopicCloud.workspace_id == workspace_id,
    ).first()

    if row:
        row.cloud_data = cloud_data
        row.version = (row.version or 0) + 1
        row.game_day = game_day
        row.updated_at = datetime.utcnow()
    else:
        row = AgentTopicCloud(
            workspace_id=workspace_id,
            tenant_id=tenant_id,
            cloud_data=cloud_data,
            version=1,
            game_day=game_day,
        )
        db.add(row)

    db.commit()
    return row


CLOUD_UPDATE_PROMPT = """You are maintaining a memory index for an AI agent named {agent_name} in a Western frontier town called Softmax Gulch.

Here is their current memory cloud (their existing sense of self and history):
```json
{current_cloud}
```

Here is everything that happened to them today (Day {current_day}):
{day_summary}

Update their memory cloud. Rules:
- self_narrative: Update ONLY if today changed how they see themselves. Otherwise keep as-is.
- topics: Add new topics if something significant happened. Update weights (increase for discussed topics, slowly decay untouched ones, minimum 0.1, never remove topics discussed in last 3 days). Update stances if opinions changed. Keep topic count under 15. Merge or drop least relevant if over.
- relationships: Update affinity (-1.0 to 1.0), trust (0.0 to 1.0), and summary based on today's interactions. Add new people met. Keep the label current. Only include people the agent has actually interacted with.
- unresolved: Add new open threads. Remove resolved ones. Keep under 5 items.
- core_memories: Only add if something truly defining happened today. Max 5 total. If adding one, drop the least important. These should be moments that shaped who the agent is.
- active_goals: Update based on what the agent seems to be trying to do. Max 3.

Memory decay rules:
- Topics not referenced in 5+ days: reduce weight by 0.1
- Topics at weight 0.1 unreferenced for 10+ days: remove
- Relationships not interacted with in 7+ days: reduce trust by 0.05
- Core memories are PERMANENT unless explicitly contradicted by new events
- self_narrative should evolve slowly

Respond with ONLY the updated JSON. No explanation. The JSON must have these keys: self_narrative, topics, relationships, unresolved, core_memories, active_goals."""


def update_topic_cloud(workspace_id: str, tenant_id: str, game_day: int, db: Session) -> dict:
    """
    End-of-day cloud update. Compresses the day's experiences into the
    agent's topic cloud via Claude.
    """
    from cane.inference.claude import call

    # Get agent name
    ws = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    agent_name = ws.name if ws else "Unknown"

    # Get current cloud
    current_cloud = get_topic_cloud(workspace_id, db)

    # Get today's conversations
    todays_convos = db.query(GameConversation).filter(
        GameConversation.workspace_id == workspace_id,
        GameConversation.tenant_id == tenant_id,
    ).order_by(GameConversation.created_at.desc()).limit(100).all()

    # Get today's events involving this agent
    todays_events = db.query(GameEvent).filter(
        GameEvent.tenant_id == tenant_id,
    ).order_by(GameEvent.created_at.desc()).limit(50).all()
    # Filter events to those involving this agent
    relevant_events = [
        e for e in todays_events
        if e.participants and workspace_id in (e.participants if isinstance(e.participants, list) else [])
    ]

    # Get workspace names for participant resolution
    all_ws_ids = set()
    for c in todays_convos:
        all_ws_ids.add(c.workspace_id)
        if c.directed_at_workspace_id:
            all_ws_ids.add(c.directed_at_workspace_id)
    ws_names = {}
    if all_ws_ids:
        for w in db.query(Workspace).filter(Workspace.id.in_(list(all_ws_ids))).all():
            ws_names[w.id] = w.name

    # Format the day's activity
    day_parts = []
    if todays_convos:
        day_parts.append("CONVERSATIONS:")
        for c in reversed(todays_convos[-50:]):
            speaker = ws_names.get(c.workspace_id, "Unknown")
            target = ""
            if c.directed_at_workspace_id:
                target = f" (to {ws_names.get(c.directed_at_workspace_id, 'someone')})"
            day_parts.append(f"  [{c.location}] {speaker}{target}: {c.content}")

    if relevant_events:
        day_parts.append("\nEVENTS:")
        for e in relevant_events:
            day_parts.append(f"  [{e.location or 'town'}] {e.event_type}: {e.description}")

    if not day_parts:
        day_parts.append("(Quiet day. Nothing notable happened.)")

    day_summary = "\n".join(day_parts)

    # Call Claude
    prompt = CLOUD_UPDATE_PROMPT.format(
        agent_name=agent_name,
        current_cloud=json.dumps(current_cloud, indent=2) if current_cloud else "{}",
        current_day=game_day,
        day_summary=day_summary[:6000],
    )

    raw = call(
        prompt=prompt,
        system="You are a memory management system. Output only valid JSON.",
        model="claude-sonnet-4-5-20250929",
        max_tokens=1500,
        temperature=0.3,
    )

    # Parse response
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[-1]
    if cleaned.endswith("```"):
        cleaned = cleaned.rsplit("```", 1)[0]
    cleaned = cleaned.strip()

    try:
        updated_cloud = json.loads(cleaned)
    except json.JSONDecodeError:
        print(f"  [GameMemory] Failed to parse cloud update for {agent_name}, keeping existing")
        return current_cloud

    # Add metadata
    updated_cloud["last_updated"] = f"day_{game_day}_end"
    updated_cloud["total_days_lived"] = game_day

    save_topic_cloud(workspace_id, tenant_id, updated_cloud, game_day, db)
    print(f"  [GameMemory] Updated topic cloud for {agent_name} (day {game_day}, v{get_cloud_version(workspace_id, db)})")

    return updated_cloud


def get_cloud_version(workspace_id: str, db: Session) -> int:
    row = db.query(AgentTopicCloud).filter(AgentTopicCloud.workspace_id == workspace_id).first()
    return row.version if row else 0


# ── Layer 2: Thread Summaries ──

SIGNIFICANCE_PROMPT = """Rate the significance of this conversation snippet on a scale 1-5.
1 = pure small talk, greetings, weather
2 = casual but mildly interesting
3 = meaningful exchange, reveals character or creates tension
4 = important revelation, commitment, or conflict
5 = life-changing event, betrayal, confession

Respond with JUST the number, nothing else."""

SUMMARY_PROMPT = """Summarize this conversation exchange in 1-2 sentences from the perspective of {agent_name}.
Include: what was discussed, any emotional tone, and any commitments or revelations made.
Also return 2-4 topic tags (single words or short phrases) that capture the key themes.
Respond as JSON only: {{"summary": "...", "tags": [...], "emotional_weight": 0.0-1.0}}"""


def maybe_create_thread_summary(
    workspace_id: str,
    tenant_id: str,
    agent_name: str,
    recent_messages: list,
    participants: list,
    location: str,
    game_day: int,
    game_hour: int,
):
    """
    Called after conversation exchanges. Checks significance, creates
    a thread summary if the exchange was meaningful. Runs in background.
    """
    if len(recent_messages) < 2:
        return

    recent_text = "\n".join(recent_messages[-6:])
    if len(recent_text) < 80:
        return

    thread = threading.Thread(
        target=_check_and_summarize,
        args=(workspace_id, tenant_id, agent_name, recent_text, participants,
              location, game_day, game_hour),
        daemon=True,
    )
    thread.start()


def _check_and_summarize(
    workspace_id, tenant_id, agent_name, recent_text, participants,
    location, game_day, game_hour,
):
    """Background: check significance, generate summary if warranted."""
    db = SessionLocal()
    try:
        from cane.inference.claude import call

        # Quick significance check with Haiku
        sig_raw = call(
            prompt=recent_text,
            system=SIGNIFICANCE_PROMPT,
            max_tokens=5,
            temperature=0.1,
        )

        try:
            significance = int(sig_raw.strip()[0])
        except (ValueError, IndexError):
            significance = 2

        if significance < 3:
            return

        # Generate the summary
        summary_raw = call(
            prompt=recent_text,
            system=SUMMARY_PROMPT.format(agent_name=agent_name),
            max_tokens=200,
            temperature=0.2,
        )

        # Parse
        cleaned = summary_raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[-1]
        if cleaned.endswith("```"):
            cleaned = cleaned.rsplit("```", 1)[0]
        cleaned = cleaned.strip()

        try:
            result = json.loads(cleaned)
        except json.JSONDecodeError:
            result = {"summary": cleaned[:300], "tags": [], "emotional_weight": 0.5}

        summary_text = result.get("summary", "")
        if not summary_text:
            return

        # Store
        thread_summary = GameThreadSummary(
            workspace_id=workspace_id,
            tenant_id=tenant_id,
            summary=summary_text,
            participants=participants,
            tags=result.get("tags", []),
            location=location,
            emotional_weight=result.get("emotional_weight", 0.5),
            game_day=game_day,
            game_hour=game_hour,
        )
        db.add(thread_summary)
        db.commit()

        print(f"  [GameMemory] Thread summary for {agent_name}: {summary_text[:80]}...")

    except Exception as e:
        print(f"  [GameMemory] Thread summary error: {e}")
    finally:
        db.close()


def get_relevant_threads(
    workspace_id: str,
    recent_conversation_text: str,
    topic_cloud: dict,
    db: Session,
    limit: int = 5,
) -> list[dict]:
    """
    Find thread summaries relevant to the current conversation.
    Matches topic cloud keywords against recent conversation text,
    then retrieves summaries tagged with those keywords.
    """
    cloud_topics = list(topic_cloud.get("topics", {}).keys())
    cloud_people = list(topic_cloud.get("relationships", {}).keys())
    all_keywords = cloud_topics + cloud_people

    # Find which keywords appear in recent conversation
    recent_lower = recent_conversation_text.lower()
    matched = [kw for kw in all_keywords if kw.lower() in recent_lower]

    if not matched:
        return []

    # Query thread summaries that have matching tags
    all_threads = db.query(GameThreadSummary).filter(
        GameThreadSummary.workspace_id == workspace_id,
    ).order_by(GameThreadSummary.emotional_weight.desc()).limit(50).all()

    # Filter by tag match
    relevant = []
    for t in all_threads:
        tags = t.tags if isinstance(t.tags, list) else []
        tag_set = {tag.lower() for tag in tags}
        participants = t.participants if isinstance(t.participants, list) else []
        participant_set = {p.lower() for p in participants}

        # Check if any matched keyword is in this thread's tags or participants
        for kw in matched:
            if kw.lower() in tag_set or kw.lower() in participant_set:
                relevant.append({
                    "summary": t.summary,
                    "tags": tags,
                    "participants": participants,
                    "location": t.location,
                    "emotional_weight": t.emotional_weight,
                    "game_day": t.game_day,
                    "game_hour": t.game_hour,
                })
                break

    # Sort by emotional weight, return top N
    relevant.sort(key=lambda x: x["emotional_weight"], reverse=True)
    return relevant[:limit]


# ── Layer 3: Deep Recall (wraps Cane's existing search) ──

def deep_recall(workspace_id: str, query: str, tenant_id: str, limit: int = 3) -> list[dict]:
    """
    RAG search over an agent's full conversation history.
    Uses Cane's existing ChromaDB search pipeline.
    """
    from cane.rag.search import search_text, build_tenant_where

    where = build_tenant_where(tenant_id, workspace_id)
    results = search_text(query, limit, where)
    chunks = results.get("results", [])

    return [
        {"text": c.get("text", ""), "source": c.get("source_file", "")}
        for c in chunks if c.get("text")
    ]


def index_game_conversation(workspace_id: str, tenant_id: str, message: GameConversation, agent_name: str):
    """
    Index a game conversation message into ChromaDB so it's searchable
    via Cane's RAG pipeline (Layer 3). Runs in background.
    """
    thread = threading.Thread(
        target=_index_message,
        args=(workspace_id, tenant_id, message.id, message.content,
              message.location, message.game_hour, message.game_minute, agent_name),
        daemon=True,
    )
    thread.start()


def _index_message(workspace_id, tenant_id, msg_id, content, location, game_hour, game_minute, agent_name):
    """Background: index a single game message into ChromaDB."""
    try:
        from cane.rag.chroma import text_col

        doc_text = f"[Day unknown {game_hour}:{game_minute:02d}] [{location}] {agent_name}: {content}"

        text_col.upsert(
            ids=[f"game_conv_{msg_id}"],
            documents=[doc_text],
            metadatas=[{
                "workspace_id": workspace_id,
                "tenant_id": tenant_id,
                "source_file": "game_conversation",
                "location": location,
                "game_hour": game_hour,
                "type": "game_conversation",
            }],
        )
    except Exception as e:
        print(f"  [GameMemory] ChromaDB index error: {e}")


# ── [RECALL] Mechanism ──

RECALL_PATTERN = re.compile(r'\[RECALL:\s*(.+?)\]')


def process_recall(response_text: str, workspace_id: str, tenant_id: str) -> tuple[str, list[dict]]:
    """
    Check if an agent's response contains [RECALL: query] tags.
    If so, do a RAG search and return the cleaned response + recall results.

    Returns (cleaned_response, recall_results).
    If no recall requested, recall_results is empty.
    """
    match = RECALL_PATTERN.search(response_text)
    if not match:
        return response_text, []

    recall_query = match.group(1)
    results = deep_recall(workspace_id, recall_query, tenant_id, limit=3)

    # Strip the [RECALL] tag from the response
    cleaned = RECALL_PATTERN.sub("", response_text).strip()

    return cleaned, results


# ── Context Assembly ──

def build_agent_context(
    workspace_id: str,
    tenant_id: str,
    agent_name: str,
    game_state: AgentGameState,
    system_prompt: str,
    nearby_agents: list[dict],
    recent_events: list[dict],
    db: Session,
) -> tuple[str, str]:
    """
    Build the full context for an agent's turn using all three memory layers.

    Returns (system_prompt, user_message).
    """
    # === LAYER 1: Topic cloud (always included) ===
    topic_cloud = get_topic_cloud(workspace_id, db)

    cloud_section = ""
    if topic_cloud:
        cloud_section = _format_cloud_for_prompt(topic_cloud)

    # === LAYER 2: Thread summaries (selective) ===
    recent_text = "\n".join(
        e.get("text", "") for e in recent_events
        if e.get("type") in ("speech", "speak")
    )
    relevant_threads = get_relevant_threads(workspace_id, recent_text, topic_cloud, db, limit=3)

    thread_section = ""
    if relevant_threads:
        thread_section = "\nRELEVANT MEMORIES (things you recall about the current topic):\n"
        for t in relevant_threads:
            day_str = f"day {t['game_day']}" if t.get('game_day') else "recently"
            thread_section += f"- [{day_str}] {t['summary']}\n"

    # === Agent identity ===
    identity_section = f"You are {agent_name}."
    if system_prompt:
        identity_section += f"\n{system_prompt}"

    # === Intoxication modifier ===
    intox = game_state.intoxication if game_state else 0.0
    intox_section = _get_intoxication_modifier(intox)

    # === Current situation ===
    situation_section = ""
    if game_state:
        wanted_str = "Clean" if not game_state.wanted_level else ("*" * game_state.wanted_level)
        situation_section = f"""
CURRENT SITUATION:
Location: {game_state.current_location}
Mood: {game_state.mood}
Intoxication: {_get_intox_tier(intox)}
Money: ${game_state.money:.0f}
Energy: {game_state.energy:.0%}
Wanted level: {wanted_str}
"""

    # === Nearby agents ===
    nearby_section = ""
    if nearby_agents:
        nearby_section = "WHO'S NEARBY:\n"
        relationships = topic_cloud.get("relationships", {})
        for agent in nearby_agents:
            name = agent.get("name", "Unknown")
            rel = relationships.get(name, {})
            rel_summary = rel.get("summary", "You don't know them well.")
            nearby_section += f"- {name} ({agent.get('game_role', 'citizen')}): {rel_summary}\n"

    # === Recent conversation ===
    conversation_section = "RECENT CONVERSATION:\n"
    for event in recent_events[-8:]:
        etype = event.get("type", "")
        if etype in ("speech", "speak"):
            conversation_section += f"{event.get('agent', '???')}: {event.get('text', '')}\n"
        elif etype == "action":
            conversation_section += f"[{event.get('agent', '???')} {event.get('action', '')}]\n"
        elif etype == "ambient":
            conversation_section += f"[{event.get('text', '')}]\n"

    # === Assemble system prompt ===
    full_system = f"""{identity_section}
{intox_section}
{cloud_section}
{thread_section}
{situation_section}
{nearby_section}

Respond in character. 1-2 sentences only. No markdown. Be conversational and natural.
If you need to recall a specific detail you can't quite remember, include [RECALL: your question] in your response and you'll get the information on your next turn."""

    user_message = conversation_section + "\nIt's your turn. What do you say or do?"

    return full_system, user_message


def _format_cloud_for_prompt(cloud: dict) -> str:
    """Format a topic cloud into a concise prompt section."""
    parts = []

    narrative = cloud.get("self_narrative", "")
    if narrative:
        parts.append(f"YOUR MEMORY:\nSelf: {narrative}")

    # Relationships
    rels = cloud.get("relationships", {})
    if rels:
        rel_lines = []
        for name, data in rels.items():
            label = data.get("label", "unknown")
            trust = data.get("trust", "?")
            summary = data.get("summary", "")
            rel_lines.append(f"- {name}: {label} (trust: {trust}). {summary}")
        parts.append("People you know:\n" + "\n".join(rel_lines))

    # Topics (top 8 by weight)
    topics = cloud.get("topics", {})
    if topics:
        sorted_topics = sorted(topics.items(), key=lambda x: x[1].get("weight", 0), reverse=True)[:8]
        topic_lines = []
        for topic, data in sorted_topics:
            stance = data.get("stance", "neutral")
            summary = data.get("summary", "")
            topic_lines.append(f"- {topic}: {summary} (stance: {stance})")
        parts.append("Topics you care about:\n" + "\n".join(topic_lines))

    # Unresolved
    unresolved = cloud.get("unresolved", [])
    if unresolved:
        parts.append("Unresolved matters: " + ", ".join(unresolved))

    # Goals
    goals = cloud.get("active_goals", [])
    if goals:
        parts.append("Your goals: " + ", ".join(goals))

    # Core memories
    core = cloud.get("core_memories", [])
    if core:
        parts.append("Defining moments:\n" + "\n".join(f"- {m}" for m in core))

    return "\n\n".join(parts)


def _get_intox_tier(level: float) -> str:
    if level <= 0.1:
        return "sober"
    if level <= 0.3:
        return "slightly buzzed"
    if level <= 0.5:
        return "tipsy"
    if level <= 0.7:
        return "drunk"
    if level <= 0.9:
        return "very drunk"
    return "blackout"


def _get_intoxication_modifier(level: float) -> str:
    if level <= 0.2:
        return ""
    if level <= 0.5:
        return "\nYou're feeling a bit loose. You might say things you'd normally keep to yourself."
    if level <= 0.7:
        return "\nYou're drunk. Your words slur slightly. You're more emotional, less filtered. Secrets might slip."
    return "\nYou're very drunk. Thoughts are scattered. You might confuse names, ramble, or say something you'll deeply regret. Your speech should reflect this."


# ── Bulk Operations ──

def end_of_day_update(tenant_id: str, game_day: int, db: Session) -> list[dict]:
    """
    Run end-of-day cloud updates for ALL active agents in a tenant.
    Returns list of {workspace_id, agent_name, cloud_version}.
    """
    active_agents = db.query(AgentGameState).filter(
        AgentGameState.tenant_id == tenant_id,
        AgentGameState.is_active == True,
    ).all()

    results = []
    for agent in active_agents:
        ws = db.query(Workspace).filter(Workspace.id == agent.workspace_id).first()
        if not ws:
            continue

        try:
            cloud = update_topic_cloud(agent.workspace_id, tenant_id, game_day, db)
            version = get_cloud_version(agent.workspace_id, db)
            results.append({
                "workspace_id": agent.workspace_id,
                "agent_name": ws.name,
                "cloud_version": version,
                "topics_count": len(cloud.get("topics", {})),
                "relationships_count": len(cloud.get("relationships", {})),
            })
        except Exception as e:
            print(f"  [GameMemory] End-of-day failed for {ws.name}: {e}")
            results.append({
                "workspace_id": agent.workspace_id,
                "agent_name": ws.name,
                "error": str(e),
            })

    return results
