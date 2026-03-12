"""
schedule_models.py -- Database models for Scheduled Agent Runs.

Supports: interval-based and daily scheduled execution of agents
with preset prompts. Run history is stored for review.
"""
import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, Integer, Boolean, DateTime, Float, ForeignKey
from database import Base


def _uuid():
    return str(uuid.uuid4())


class AgentSchedule(Base):
    """Stores schedule configuration for an agent."""
    __tablename__ = "agent_schedules"

    id = Column(String(36), primary_key=True, default=_uuid)
    workspace_id = Column(String(36), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    tenant_id = Column(String(36), ForeignKey("tenants.id"), nullable=False)

    # What to run
    prompt = Column(Text, nullable=False)

    # Schedule config
    schedule_type = Column(String(20), default="interval")    # "interval" | "daily"
    interval_minutes = Column(Integer, default=60)            # for interval type (minimum 15)
    daily_time = Column(String(5), default="")                # for daily type, e.g. "09:00" (UTC)

    # State
    is_enabled = Column(Boolean, default=True)
    last_run_at = Column(DateTime, nullable=True)
    last_run_status = Column(String(20), default="")          # "success" | "error" | "running"
    next_run_at = Column(DateTime, nullable=True)
    run_count = Column(Integer, default=0)

    # Conditional output
    condition_enabled = Column(Boolean, default=False)
    condition_prompt = Column(Text, default="")             # e.g. "The output contains urgent items"
    condition_action = Column(String(50), default="store_only")  # "store_only" | "send_webhook"
    condition_webhook_url = Column(Text, default="")
    condition_webhook_headers = Column(Text, default="{}")

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f"<AgentSchedule {self.id[:8]} type={self.schedule_type}>"


class AgentScheduleRun(Base):
    """Stores the result of a single scheduled agent execution."""
    __tablename__ = "agent_schedule_runs"

    id = Column(String(36), primary_key=True, default=_uuid)
    schedule_id = Column(String(36), ForeignKey("agent_schedules.id", ondelete="CASCADE"), nullable=False)
    workspace_id = Column(String(36), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    tenant_id = Column(String(36), ForeignKey("tenants.id"), nullable=False)

    prompt = Column(Text, nullable=False)
    response = Column(Text, default="")
    status = Column(String(20), default="running")            # "running" | "success" | "error"
    error_message = Column(Text, default="")
    duration_ms = Column(Integer, default=0)
    condition_met = Column(Boolean, nullable=True)          # null = no condition, True/False = evaluated

    created_at = Column(DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f"<AgentScheduleRun {self.id[:8]} status={self.status}>"
