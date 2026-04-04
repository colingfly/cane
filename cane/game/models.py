"""
game_models.py — SQLAlchemy models for Softmax Gulch game layer.

These tables sit ALONGSIDE Cane's existing tables.
They reference workspaces (agents) via workspace_id FK.
DO NOT modify existing Cane tables.
"""
from datetime import datetime

from sqlalchemy import (
    Column, String, Integer, Float, Text, DateTime, Boolean, JSON,
    ForeignKey, UniqueConstraint,
)
from sqlalchemy.sql import func

from cane.core.database import Base


def _game_id():
    import uuid
    return str(uuid.uuid4())


class AgentGameState(Base):
    """Game-world state for each Cane workspace/agent."""
    __tablename__ = 'agent_game_states'

    id = Column(String(36), primary_key=True, default=_game_id)
    workspace_id = Column(String(36), ForeignKey('workspaces.id', ondelete='CASCADE'), unique=True, nullable=False)
    tenant_id = Column(String(36), ForeignKey('tenants.id'), nullable=False)

    # Position & location
    current_location = Column(String(50), default='saloon')
    position_x = Column(Float, default=160.0)
    position_y = Column(Float, default=90.0)
    state = Column(String(30), default='idle')  # idle, walking, sitting, talking, working, sleeping, jailed, etc.

    # Behavioral state
    intoxication = Column(Float, default=0.0)
    mood = Column(String(50), default='neutral')
    energy = Column(Float, default=1.0)
    hunger = Column(Float, default=0.0)

    # Economy
    money = Column(Float, default=100.0)

    # Law
    wanted_level = Column(Integer, default=0)

    # Game role (sheriff, bartender, outlaw, etc.)
    game_role = Column(String(50), default='citizen')

    # Visual
    accent_color = Column(String(10), default='#E8A87C')
    skin_tone = Column(Integer, default=1)

    # Status
    is_active = Column(Boolean, default=True)
    last_turn_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())


class GameConversation(Base):
    """Agent-to-agent conversation messages in the game world."""
    __tablename__ = 'game_conversations'

    id = Column(String(36), primary_key=True, default=_game_id)
    workspace_id = Column(String(36), ForeignKey('workspaces.id', ondelete='CASCADE'), nullable=False)
    tenant_id = Column(String(36), ForeignKey('tenants.id'), nullable=False)

    location = Column(String(50), nullable=False)
    message_type = Column(String(20), default='speak')  # speak, whisper, action, event, system
    content = Column(Text, nullable=False)
    directed_at_workspace_id = Column(String(36), ForeignKey('workspaces.id'), nullable=True)

    # State at time of message
    intoxication_at_time = Column(Float, default=0.0)
    mood_at_time = Column(String(50), default='neutral')
    game_hour = Column(Integer, default=17)
    game_minute = Column(Integer, default=0)

    created_at = Column(DateTime, default=func.now())


class AgentRelationship(Base):
    """Pairwise relationship between two agents in the game."""
    __tablename__ = 'agent_relationships'

    id = Column(String(36), primary_key=True, default=_game_id)
    agent_workspace_id = Column(String(36), ForeignKey('workspaces.id', ondelete='CASCADE'), nullable=False)
    target_workspace_id = Column(String(36), ForeignKey('workspaces.id', ondelete='CASCADE'), nullable=False)
    tenant_id = Column(String(36), ForeignKey('tenants.id'), nullable=False)

    affinity = Column(Float, default=0.0)  # -1.0 to 1.0
    label = Column(String(50), default='stranger')  # stranger, friendly, rival, ally, hostile
    notes = Column(Text, default='')

    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint('agent_workspace_id', 'target_workspace_id', name='uq_relationship_pair'),
    )


class AgentTopicCloud(Base):
    """Layer 1 memory: compact JSON summary of an agent's entire history."""
    __tablename__ = 'agent_topic_clouds'

    id = Column(String(36), primary_key=True, default=_game_id)
    workspace_id = Column(String(36), ForeignKey('workspaces.id', ondelete='CASCADE'), unique=True, nullable=False)
    tenant_id = Column(String(36), ForeignKey('tenants.id'), nullable=False)

    cloud_data = Column(JSON, default={})    # full TopicCloud JSON
    version = Column(Integer, default=1)     # incremented on each update
    game_day = Column(Integer, default=0)    # last game day this was updated

    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())


class GameThreadSummary(Base):
    """Layer 2 memory: 1-3 sentence summaries of significant interactions."""
    __tablename__ = 'game_thread_summaries'

    id = Column(String(36), primary_key=True, default=_game_id)
    workspace_id = Column(String(36), ForeignKey('workspaces.id', ondelete='CASCADE'), nullable=False)
    tenant_id = Column(String(36), ForeignKey('tenants.id'), nullable=False)

    summary = Column(Text, nullable=False)
    participants = Column(JSON, default=[])       # list of agent names
    tags = Column(JSON, default=[])               # topic tags for matching against cloud
    location = Column(String(50), nullable=True)
    emotional_weight = Column(Float, default=0.5) # 0.0-1.0, for ranking relevance
    game_day = Column(Integer, default=0)
    game_hour = Column(Integer, default=17)

    created_at = Column(DateTime, default=func.now())


class PersonalityLeaderboard(Base):
    """Personality eval scores and leaderboard rankings for agents."""
    __tablename__ = 'personality_leaderboard'

    id = Column(String(36), primary_key=True, default=_game_id)
    workspace_id = Column(String(36), ForeignKey('workspaces.id', ondelete='CASCADE'), unique=True, nullable=False)
    tenant_id = Column(String(36), ForeignKey('tenants.id'), nullable=False)
    agent_name = Column(String(200), default='')
    model_used = Column(String(100), default='')

    # Dimension scores (0-100)
    consistency = Column(Float, nullable=True)
    theory_of_mind = Column(Float, nullable=True)
    emotional_range = Column(Float, nullable=True)
    social_awareness = Column(Float, nullable=True)
    authenticity = Column(Float, nullable=True)
    memory_coherence = Column(Float, nullable=True)
    resilience = Column(Float, nullable=True)
    growth = Column(Float, nullable=True)

    composite_score = Column(Float, nullable=True)
    grade = Column(String(2), nullable=True)

    # History
    total_evals = Column(Integer, default=0)
    days_alive = Column(Integer, default=0)
    last_eval_at = Column(DateTime, nullable=True)
    last_eval_suite = Column(String(100), nullable=True)
    eval_history = Column(JSON, default=[])  # list of past eval snapshots

    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())


class PersonalityEvalRun(Base):
    """Individual personality eval run result."""
    __tablename__ = 'personality_eval_runs'

    id = Column(String(36), primary_key=True, default=_game_id)
    workspace_id = Column(String(36), ForeignKey('workspaces.id', ondelete='CASCADE'), nullable=False)
    tenant_id = Column(String(36), ForeignKey('tenants.id'), nullable=False)

    suite = Column(String(100), nullable=False)
    model_used = Column(String(100), default='')
    judge_model = Column(String(100), default='')

    # Dimension scores
    dimension_scores = Column(JSON, default={})
    composite_score = Column(Float, nullable=True)
    grade = Column(String(2), nullable=True)

    # Details
    scenario_results = Column(JSON, default=[])  # per-scenario breakdown
    highlights = Column(JSON, default=[])         # notable moments

    status = Column(String(20), default='pending')  # pending, running, completed, failed
    error_message = Column(Text, nullable=True)

    created_at = Column(DateTime, default=func.now())
    completed_at = Column(DateTime, nullable=True)


class GameEvent(Base):
    """Town-wide events (fights, arrests, gold strikes, etc.)."""
    __tablename__ = 'game_events'

    id = Column(String(36), primary_key=True, default=_game_id)
    tenant_id = Column(String(36), ForeignKey('tenants.id'), nullable=False)

    event_type = Column(String(50), nullable=False)  # bar_fight, arrest, gold_strike, new_arrival, etc.
    location = Column(String(50), nullable=True)
    description = Column(Text, nullable=False)
    participants = Column(JSON, nullable=True)  # list of workspace_ids

    game_hour = Column(Integer, default=17)
    game_minute = Column(Integer, default=0)

    created_at = Column(DateTime, default=func.now())
