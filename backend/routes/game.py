"""
routes/game.py — Softmax Gulch game-specific endpoints.

Mounted at /api/game/. These sit alongside Cane's existing routers.
They manage game-world state (positions, conversations, relationships, events)
while relying on Cane's existing workspace/agent system for everything else.
"""
from typing import Optional, List
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from auth import get_current_user, get_optional_user
from db_models import User, Workspace
from game_models import AgentGameState, GameConversation, AgentRelationship, GameEvent, AgentTopicCloud, GameThreadSummary

router = APIRouter(prefix="/api/game", tags=["game"])


# ─── Pydantic schemas ───

class GameStateUpdate(BaseModel):
    current_location: Optional[str] = None
    position_x: Optional[float] = None
    position_y: Optional[float] = None
    state: Optional[str] = None
    intoxication: Optional[float] = None
    mood: Optional[str] = None
    energy: Optional[float] = None
    hunger: Optional[float] = None
    money: Optional[float] = None
    wanted_level: Optional[int] = None
    game_role: Optional[str] = None
    accent_color: Optional[str] = None
    is_active: Optional[bool] = None


class ConversationTurnRequest(BaseModel):
    workspace_id: str
    location: str
    message_type: str = "speak"
    content: str
    directed_at_workspace_id: Optional[str] = None
    intoxication_at_time: float = 0.0
    mood_at_time: str = "neutral"
    game_hour: int = 17
    game_minute: int = 0


class RelationshipUpdate(BaseModel):
    affinity: Optional[float] = None
    label: Optional[str] = None
    notes: Optional[str] = None


class GameEventCreate(BaseModel):
    event_type: str
    location: Optional[str] = None
    description: str
    participants: Optional[list] = None
    game_hour: int = 17
    game_minute: int = 0


# ─── World State ───

@router.get("/world/status")
def world_status(
    user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """Get world overview: active agents, locations, time."""
    tenant_id = user.tenant_id if user else None

    query = db.query(AgentGameState)
    if tenant_id:
        query = query.filter(AgentGameState.tenant_id == tenant_id)

    states = query.filter(AgentGameState.is_active == True).all()

    # Count per location
    location_counts = {}
    for s in states:
        location_counts[s.current_location] = location_counts.get(s.current_location, 0) + 1

    return {
        "active_agents": len(states),
        "locations": location_counts,
        "status": "running",
    }


@router.get("/world/locations")
def world_locations(
    user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """Get all locations with their current agents."""
    tenant_id = user.tenant_id if user else None

    query = db.query(AgentGameState).join(
        Workspace, Workspace.id == AgentGameState.workspace_id
    )
    if tenant_id:
        query = query.filter(AgentGameState.tenant_id == tenant_id)

    states = query.filter(AgentGameState.is_active == True).all()

    locations = {}
    for s in states:
        if s.current_location not in locations:
            locations[s.current_location] = []
        locations[s.current_location].append({
            "workspace_id": s.workspace_id,
            "state": s.state,
            "mood": s.mood,
            "intoxication": s.intoxication,
            "game_role": s.game_role,
        })

    return {"locations": locations}


@router.get("/world/events")
def world_events(
    limit: int = 50,
    user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """Get recent game events."""
    tenant_id = user.tenant_id if user else None

    query = db.query(GameEvent)
    if tenant_id:
        query = query.filter(GameEvent.tenant_id == tenant_id)

    events = query.order_by(GameEvent.created_at.desc()).limit(limit).all()

    return [{
        "id": e.id,
        "event_type": e.event_type,
        "location": e.location,
        "description": e.description,
        "participants": e.participants,
        "game_hour": e.game_hour,
        "game_minute": e.game_minute,
        "created_at": e.created_at.isoformat() if e.created_at else None,
    } for e in events]


# ─── Agent Game State ───

@router.get("/agents")
def get_game_agents(
    user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """Get all agents with their game state. Creates game state for agents that don't have one."""
    tenant_id = user.tenant_id if user else None
    if not tenant_id:
        return []

    # Get all workspaces (agents) for this tenant
    workspaces = db.query(Workspace).filter(Workspace.tenant_id == tenant_id).all()

    result = []
    for ws in workspaces:
        # Get or create game state
        game_state = db.query(AgentGameState).filter(
            AgentGameState.workspace_id == ws.id
        ).first()

        if not game_state:
            game_state = AgentGameState(
                workspace_id=ws.id,
                tenant_id=tenant_id,
                current_location='saloon',
                game_role='citizen',
            )
            db.add(game_state)
            db.flush()

        result.append({
            # Cane workspace data
            "workspace_id": ws.id,
            "name": ws.name,
            "description": ws.description,
            "system_prompt": ws.system_prompt,
            "agent_type": ws.agent_type,
            "icon": ws.agent_icon,
            # Game state
            "current_location": game_state.current_location,
            "position_x": game_state.position_x,
            "position_y": game_state.position_y,
            "state": game_state.state,
            "intoxication": game_state.intoxication,
            "mood": game_state.mood,
            "energy": game_state.energy,
            "hunger": game_state.hunger,
            "money": game_state.money,
            "wanted_level": game_state.wanted_level,
            "game_role": game_state.game_role,
            "accent_color": game_state.accent_color,
            "skin_tone": game_state.skin_tone,
            "is_active": game_state.is_active,
            "last_turn_at": game_state.last_turn_at.isoformat() if game_state.last_turn_at else None,
        })

    db.commit()
    return result


@router.get("/agents/{workspace_id}")
def get_game_agent(
    workspace_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get single agent's game state."""
    game_state = db.query(AgentGameState).filter(
        AgentGameState.workspace_id == workspace_id,
        AgentGameState.tenant_id == user.tenant_id,
    ).first()

    if not game_state:
        raise HTTPException(404, "Agent game state not found")

    ws = db.query(Workspace).filter(Workspace.id == workspace_id).first()

    return {
        "workspace_id": workspace_id,
        "name": ws.name if ws else "Unknown",
        "current_location": game_state.current_location,
        "position_x": game_state.position_x,
        "position_y": game_state.position_y,
        "state": game_state.state,
        "intoxication": game_state.intoxication,
        "mood": game_state.mood,
        "energy": game_state.energy,
        "hunger": game_state.hunger,
        "money": game_state.money,
        "wanted_level": game_state.wanted_level,
        "game_role": game_state.game_role,
        "accent_color": game_state.accent_color,
        "is_active": game_state.is_active,
    }


@router.put("/agents/{workspace_id}/state")
def update_game_state(
    workspace_id: str,
    update: GameStateUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update agent's game state (position, mood, intoxication, etc.)."""
    game_state = db.query(AgentGameState).filter(
        AgentGameState.workspace_id == workspace_id,
        AgentGameState.tenant_id == user.tenant_id,
    ).first()

    if not game_state:
        raise HTTPException(404, "Agent game state not found")

    for field, value in update.dict(exclude_unset=True).items():
        if value is not None:
            setattr(game_state, field, value)

    game_state.updated_at = datetime.utcnow()
    db.commit()

    return {"status": "updated"}


# ─── Game Conversations ───

@router.post("/conversations/turn")
def create_conversation_turn(
    turn: ConversationTurnRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Record a game conversation message."""
    msg = GameConversation(
        workspace_id=turn.workspace_id,
        tenant_id=user.tenant_id,
        location=turn.location,
        message_type=turn.message_type,
        content=turn.content,
        directed_at_workspace_id=turn.directed_at_workspace_id,
        intoxication_at_time=turn.intoxication_at_time,
        mood_at_time=turn.mood_at_time,
        game_hour=turn.game_hour,
        game_minute=turn.game_minute,
    )
    db.add(msg)

    # Update last_turn_at on game state
    game_state = db.query(AgentGameState).filter(
        AgentGameState.workspace_id == turn.workspace_id,
    ).first()
    if game_state:
        game_state.last_turn_at = datetime.utcnow()
        game_state.state = 'talking'

    db.commit()

    # Background: index into ChromaDB for Layer 3 recall
    ws = db.query(Workspace).filter(Workspace.id == turn.workspace_id).first()
    agent_name = ws.name if ws else "Unknown"
    from services.game_memory import index_game_conversation, maybe_create_thread_summary
    index_game_conversation(turn.workspace_id, user.tenant_id, msg, agent_name)

    # Background: check if this exchange is worth a thread summary (Layer 2)
    recent = db.query(GameConversation).filter(
        GameConversation.location == turn.location,
        GameConversation.tenant_id == user.tenant_id,
    ).order_by(GameConversation.created_at.desc()).limit(6).all()

    if recent:
        ws_ids = list(set(m.workspace_id for m in recent))
        ws_map = {w.id: w.name for w in db.query(Workspace).filter(Workspace.id.in_(ws_ids)).all()}
        recent_msgs = [f"{ws_map.get(m.workspace_id, '?')}: {m.content}" for m in reversed(recent)]
        participants = list(set(ws_map.get(m.workspace_id, "?") for m in recent))
        maybe_create_thread_summary(
            workspace_id=turn.workspace_id,
            tenant_id=user.tenant_id,
            agent_name=agent_name,
            recent_messages=recent_msgs,
            participants=participants,
            location=turn.location,
            game_day=0,
            game_hour=turn.game_hour,
        )

    return {
        "id": msg.id,
        "workspace_id": msg.workspace_id,
        "content": msg.content,
        "location": msg.location,
        "created_at": msg.created_at.isoformat() if msg.created_at else None,
    }


@router.get("/conversations/recent")
def get_recent_conversations(
    limit: int = 50,
    user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """Get recent game conversations across all locations."""
    tenant_id = user.tenant_id if user else None

    query = db.query(GameConversation)
    if tenant_id:
        query = query.filter(GameConversation.tenant_id == tenant_id)

    msgs = query.order_by(GameConversation.created_at.desc()).limit(limit).all()

    # Get workspace names
    ws_ids = list(set(m.workspace_id for m in msgs))
    workspaces = {ws.id: ws.name for ws in db.query(Workspace).filter(Workspace.id.in_(ws_ids)).all()} if ws_ids else {}

    return [{
        "id": m.id,
        "workspace_id": m.workspace_id,
        "agent_name": workspaces.get(m.workspace_id, "Unknown"),
        "location": m.location,
        "message_type": m.message_type,
        "content": m.content,
        "directed_at": m.directed_at_workspace_id,
        "intoxication": m.intoxication_at_time,
        "mood": m.mood_at_time,
        "game_hour": m.game_hour,
        "game_minute": m.game_minute,
        "created_at": m.created_at.isoformat() if m.created_at else None,
    } for m in reversed(msgs)]


@router.get("/conversations/location/{location}")
def get_location_conversations(
    location: str,
    limit: int = 30,
    user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """Get conversations in a specific location."""
    tenant_id = user.tenant_id if user else None

    query = db.query(GameConversation).filter(GameConversation.location == location)
    if tenant_id:
        query = query.filter(GameConversation.tenant_id == tenant_id)

    msgs = query.order_by(GameConversation.created_at.desc()).limit(limit).all()

    ws_ids = list(set(m.workspace_id for m in msgs))
    workspaces = {ws.id: ws.name for ws in db.query(Workspace).filter(Workspace.id.in_(ws_ids)).all()} if ws_ids else {}

    return [{
        "id": m.id,
        "workspace_id": m.workspace_id,
        "agent_name": workspaces.get(m.workspace_id, "Unknown"),
        "content": m.content,
        "message_type": m.message_type,
        "intoxication": m.intoxication_at_time,
        "mood": m.mood_at_time,
        "created_at": m.created_at.isoformat() if m.created_at else None,
    } for m in reversed(msgs)]


# ─── Relationships ───

@router.get("/agents/{workspace_id}/relationships")
def get_relationships(
    workspace_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get all relationships for an agent."""
    rels = db.query(AgentRelationship).filter(
        AgentRelationship.agent_workspace_id == workspace_id,
        AgentRelationship.tenant_id == user.tenant_id,
    ).all()

    ws_ids = [r.target_workspace_id for r in rels]
    workspaces = {ws.id: ws.name for ws in db.query(Workspace).filter(Workspace.id.in_(ws_ids)).all()} if ws_ids else {}

    return [{
        "target_workspace_id": r.target_workspace_id,
        "target_name": workspaces.get(r.target_workspace_id, "Unknown"),
        "affinity": r.affinity,
        "label": r.label,
        "notes": r.notes,
    } for r in rels]


@router.put("/agents/{workspace_id}/relationships/{target_id}")
def update_relationship(
    workspace_id: str,
    target_id: str,
    update: RelationshipUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update or create a relationship between two agents."""
    rel = db.query(AgentRelationship).filter(
        AgentRelationship.agent_workspace_id == workspace_id,
        AgentRelationship.target_workspace_id == target_id,
        AgentRelationship.tenant_id == user.tenant_id,
    ).first()

    if not rel:
        rel = AgentRelationship(
            agent_workspace_id=workspace_id,
            target_workspace_id=target_id,
            tenant_id=user.tenant_id,
        )
        db.add(rel)

    if update.affinity is not None:
        rel.affinity = max(-1.0, min(1.0, update.affinity))
    if update.label is not None:
        rel.label = update.label
    if update.notes is not None:
        rel.notes = update.notes

    db.commit()
    return {"status": "updated", "affinity": rel.affinity, "label": rel.label}


# ─── Events ───

@router.post("/events")
def create_game_event(
    event: GameEventCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Record a game event."""
    e = GameEvent(
        tenant_id=user.tenant_id,
        event_type=event.event_type,
        location=event.location,
        description=event.description,
        participants=event.participants,
        game_hour=event.game_hour,
        game_minute=event.game_minute,
    )
    db.add(e)
    db.commit()

    return {"id": e.id, "status": "created"}


# ─── Agent Memory (Hierarchical: Cloud + Threads + Recall) ───

class RecallRequest(BaseModel):
    query: str


class EndOfDayRequest(BaseModel):
    game_day: int


@router.get("/agents/{workspace_id}/memory/cloud")
def get_memory_cloud(
    workspace_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get an agent's Layer 1 topic cloud."""
    from services.game_memory import get_topic_cloud, get_cloud_version

    cloud = get_topic_cloud(workspace_id, db)
    version = get_cloud_version(workspace_id, db)

    return {
        "workspace_id": workspace_id,
        "cloud": cloud,
        "version": version,
    }


@router.post("/agents/{workspace_id}/memory/cloud/refresh")
def refresh_memory_cloud(
    workspace_id: str,
    body: EndOfDayRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Force a topic cloud update (normally runs end-of-day)."""
    from services.game_memory import update_topic_cloud, get_cloud_version

    cloud = update_topic_cloud(workspace_id, user.tenant_id, body.game_day, db)
    version = get_cloud_version(workspace_id, db)

    return {
        "workspace_id": workspace_id,
        "cloud": cloud,
        "version": version,
        "game_day": body.game_day,
    }


@router.get("/agents/{workspace_id}/memory/cloud/history")
def get_cloud_history(
    workspace_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get topic cloud metadata (version, last update). Full history would need a separate version table."""
    row = db.query(AgentTopicCloud).filter(
        AgentTopicCloud.workspace_id == workspace_id,
    ).first()

    if not row:
        return {"workspace_id": workspace_id, "exists": False}

    return {
        "workspace_id": workspace_id,
        "exists": True,
        "version": row.version,
        "game_day": row.game_day,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


@router.get("/agents/{workspace_id}/memory/threads")
def get_memory_threads(
    workspace_id: str,
    topics: str = Query("", description="Comma-separated topic tags to filter by"),
    limit: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get Layer 2 thread summaries, optionally filtered by topic tags."""
    query = db.query(GameThreadSummary).filter(
        GameThreadSummary.workspace_id == workspace_id,
        GameThreadSummary.tenant_id == user.tenant_id,
    ).order_by(GameThreadSummary.emotional_weight.desc())

    threads = query.limit(limit).all()

    # Filter by topics if provided
    topic_filter = [t.strip().lower() for t in topics.split(",") if t.strip()] if topics else []

    results = []
    for t in threads:
        tags = t.tags if isinstance(t.tags, list) else []
        if topic_filter:
            tag_set = {tag.lower() for tag in tags}
            if not any(tf in tag_set for tf in topic_filter):
                continue
        results.append({
            "id": t.id,
            "summary": t.summary,
            "tags": tags,
            "participants": t.participants if isinstance(t.participants, list) else [],
            "location": t.location,
            "emotional_weight": t.emotional_weight,
            "game_day": t.game_day,
            "game_hour": t.game_hour,
            "created_at": t.created_at.isoformat() if t.created_at else None,
        })

    return {"threads": results, "total": len(results)}


@router.post("/agents/{workspace_id}/memory/recall")
def deep_recall_endpoint(
    workspace_id: str,
    body: RecallRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Layer 3: RAG search over an agent's full conversation history."""
    from services.game_memory import deep_recall

    results = deep_recall(workspace_id, body.query, user.tenant_id, limit=5)

    return {
        "workspace_id": workspace_id,
        "query": body.query,
        "results": results,
        "total": len(results),
    }


@router.post("/memory/end-of-day")
def trigger_end_of_day(
    body: EndOfDayRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Trigger end-of-day cloud updates for ALL active agents."""
    from services.game_memory import end_of_day_update

    results = end_of_day_update(user.tenant_id, body.game_day, db)

    return {
        "game_day": body.game_day,
        "agents_updated": len([r for r in results if "error" not in r]),
        "agents_failed": len([r for r in results if "error" in r]),
        "results": results,
    }
