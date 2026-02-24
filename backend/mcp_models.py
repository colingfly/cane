"""
mcp_models.py — Database models for MCP (Model Context Protocol) server connections.

Each agent (workspace) can connect to multiple MCP servers. Each server
exposes tools that get merged into the agent's tool palette alongside webhooks.
"""
import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, Integer, Boolean, DateTime, Float, ForeignKey
from database import Base


def _uuid():
    return str(uuid.uuid4())


class McpServer(Base):
    __tablename__ = "mcp_servers"

    id = Column(String(36), primary_key=True, default=_uuid)
    workspace_id = Column(String(36), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    tenant_id = Column(String(36), ForeignKey("tenants.id"), nullable=False)

    # Server identity
    name = Column(String(255), nullable=False)             # "Google Calendar", "Slack", custom name
    server_url = Column(Text, nullable=False)               # MCP server endpoint URL
    server_type = Column(String(50), default="custom")      # "custom" | catalog key like "google_calendar"
    icon = Column(String(10), default="🔌")                 # Emoji or short icon

    # Auth
    auth_type = Column(String(50), default="none")          # "none" | "bearer" | "api_key" | "header"
    auth_header = Column(String(255), default="Authorization")  # Header name for auth
    auth_value = Column(Text, default="")                   # Token/key value

    # Discovered tools (cached JSON from tools/list)
    # Format: [{"name": "...", "description": "...", "inputSchema": {...}}, ...]
    discovered_tools = Column(Text, default="[]")
    tool_count = Column(Integer, default=0)

    # Status
    is_enabled = Column(Boolean, default=True)
    status = Column(String(20), default="pending")          # "pending" | "connected" | "error"
    status_message = Column(Text, default="")
    last_synced_at = Column(DateTime, nullable=True)

    # Stats
    total_calls = Column(Integer, default=0)
    avg_latency_ms = Column(Float, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f"<McpServer {self.name} url={self.server_url[:50]}>"
