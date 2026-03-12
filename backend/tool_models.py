"""
tool_models.py — Database models for Agent Tools.

Supports: webhook triggers, API connectors, data lookups.
"""
import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, Integer, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from database import Base


def _uuid():
    return str(uuid.uuid4())


class AgentTool(Base):
    __tablename__ = "agent_tools"

    id = Column(String(36), primary_key=True, default=_uuid)
    workspace_id = Column(String(36), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    tenant_id = Column(String(36), ForeignKey("tenants.id"), nullable=False)

    # Tool definition
    name = Column(String(255), nullable=False)          # "log_to_sheet", "notify_slack", "lookup_customer"
    description = Column(Text, nullable=False)           # Shown to Claude so it knows when to use the tool
    tool_type = Column(String(50), default="webhook")    # "webhook" | "api_get" | "api_post"

    # Execution config
    url = Column(Text, nullable=False)                   # Webhook/API endpoint URL
    method = Column(String(10), default="POST")          # HTTP method
    headers = Column(Text, default="{}")                 # JSON: {"Authorization": "Bearer xxx"}
    payload_template = Column(Text, default="{}")        # JSON template with {{variable}} placeholders
    auth_type = Column(String(50), default="none")       # "none" | "bearer" | "api_key" | "basic"
    auth_value = Column(Text, default="")                # Token/key value (encrypted in prod)

    # Input parameters — what Claude should provide when calling this tool
    # JSON array: [{"name": "question", "type": "string", "description": "The user's question", "required": true}]
    parameters = Column(Text, default="[]")

    # Behavior
    is_enabled = Column(Boolean, default=True)
    fire_and_forget = Column(Boolean, default=True)      # True = don't wait for response, False = use response in answer
    execution_count = Column(Integer, default=0)
    last_executed_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f"<AgentTool {self.name} type={self.tool_type}>"


class AgentLink(Base):
    """Links a parent agent to a child agent, exposing the child as a callable tool."""
    __tablename__ = "agent_links"

    id = Column(String(36), primary_key=True, default=_uuid)
    parent_workspace_id = Column(String(36), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    child_workspace_id = Column(String(36), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    tenant_id = Column(String(36), ForeignKey("tenants.id"), nullable=False)

    tool_name = Column(String(64), nullable=False)        # e.g. "payroll_agent"
    tool_description = Column(Text, nullable=False)        # Tells Claude when to delegate

    is_enabled = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f"<AgentLink {self.parent_workspace_id} -> {self.child_workspace_id}>"


class AgentCommunication(Base):
    """Logs every inter-agent delegation call for audit and visualization."""
    __tablename__ = "agent_communications"

    id = Column(String(36), primary_key=True, default=_uuid)
    tenant_id = Column(String(36), ForeignKey("tenants.id"), nullable=False)
    parent_agent_id = Column(String(36), nullable=False)
    child_agent_id = Column(String(36), nullable=False)
    session_id = Column(String(100), default="")

    query_sent = Column(Text, default="")
    response_received = Column(Text, default="")
    depth_level = Column(Integer, default=0)
    duration_ms = Column(Integer, default=0)
    status = Column(String(20), default="ok")
    error_message = Column(Text, default="")

    created_at = Column(DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f"<AgentCommunication {self.parent_agent_id} -> {self.child_agent_id}>"
