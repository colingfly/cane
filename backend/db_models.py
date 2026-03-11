"""
db_models.py — SQLAlchemy ORM models for Cane multi-tenant system.

Tenant  →  the company
User    →  belongs to a tenant, has a role
Workspace → organizational container within a tenant
Document  → an uploaded file, belongs to a workspace
"""
import uuid
from datetime import datetime

from sqlalchemy import (
    Column, String, Integer, Text, DateTime, Enum, ForeignKey, Boolean,
)
from sqlalchemy.orm import relationship

from database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


# ─────────────────────────────────────────
#  Tenant
# ─────────────────────────────────────────

class Tenant(Base):
    __tablename__ = "tenants"

    id = Column(String(36), primary_key=True, default=_uuid)
    name = Column(String(255), nullable=False)                  # "Coral Gables Dental"
    slug = Column(String(100), unique=True, nullable=False)     # "coral-gables-dental"
    plan = Column(String(50), default="free")                    # "free" | "pro" | "business"
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    users = relationship("User", back_populates="tenant", cascade="all, delete-orphan")
    workspaces = relationship("Workspace", back_populates="tenant", cascade="all, delete-orphan")
    documents = relationship("Document", back_populates="tenant", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Tenant {self.slug}>"


# ─────────────────────────────────────────
#  User
# ─────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=_uuid)
    tenant_id = Column(String(36), ForeignKey("tenants.id"), nullable=False)
    email = Column(String(255), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    name = Column(String(255), default="")
    role = Column(String(20), default="member")                 # "admin" (you) | "owner" | "member"
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_login = Column(DateTime, nullable=True)

    # Relationships
    tenant = relationship("Tenant", back_populates="users")
    documents = relationship("Document", back_populates="uploaded_by_user")

    def __repr__(self):
        return f"<User {self.email} ({self.role})>"


# ─────────────────────────────────────────
#  Workspace
# ─────────────────────────────────────────

class Workspace(Base):
    __tablename__ = "workspaces"

    id = Column(String(36), primary_key=True, default=_uuid)
    tenant_id = Column(String(36), ForeignKey("tenants.id"), nullable=False)
    name = Column(String(255), nullable=False)                  # "HR Policies"
    description = Column(Text, default="")
    is_default = Column(Boolean, default=False)                 # auto-created workspace
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Agent fields
    agent_type = Column(String(50), nullable=True)              # "hr_rep", "admin_assistant", "academic_tutor", "custom", or None
    system_prompt = Column(Text, nullable=True)                 # Agent system prompt
    agent_icon = Column(String(10), default="")                 # Emoji icon
    agent_description = Column(Text, default="")                # Short description
    show_on_homepage = Column(Boolean, default=False)           # Show in search page workspace dropdown
    # widget_config added via migration — access via raw SQL in analytics_routes

    # Relationships
    tenant = relationship("Tenant", back_populates="workspaces")
    documents = relationship("Document", back_populates="workspace", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Workspace {self.name}>"


# ─────────────────────────────────────────
#  Document
# ─────────────────────────────────────────

class Document(Base):
    __tablename__ = "documents"

    id = Column(String(36), primary_key=True, default=_uuid)
    tenant_id = Column(String(36), ForeignKey("tenants.id"), nullable=False)
    workspace_id = Column(String(36), ForeignKey("workspaces.id"), nullable=False)
    uploaded_by = Column(String(36), ForeignKey("users.id"), nullable=True)

    filename = Column(String(500), nullable=False)
    file_type = Column(String(20), default="")                  # "pdf", "docx", etc.
    file_size_bytes = Column(Integer, default=0)
    status = Column(String(20), default="processing")           # "processing" | "ready" | "error"
    error_message = Column(Text, nullable=True)
    chunk_count = Column(Integer, default=0)
    image_count = Column(Integer, default=0)

    created_at = Column(DateTime, default=datetime.utcnow)
    processed_at = Column(DateTime, nullable=True)

    # Relationships
    tenant = relationship("Tenant", back_populates="documents")
    workspace = relationship("Workspace", back_populates="documents")
    uploaded_by_user = relationship("User", back_populates="documents")

    def __repr__(self):
        return f"<Document {self.filename} ({self.status})>"


# ─────────────────────────────────────────
#  SearchLog — your consulting goldmine
# ─────────────────────────────────────────

class SearchLog(Base):
    __tablename__ = "search_logs"

    id = Column(String(36), primary_key=True, default=_uuid)
    tenant_id = Column(String(36), ForeignKey("tenants.id"), nullable=False)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    query = Column(Text, nullable=False)
    mode = Column(String(20), default="text")                   # "text" | "fusion" | "ask"
    workspace_id = Column(String(36), nullable=True)
    result_count = Column(Integer, default=0)
    top_score = Column(String(10), default="")
    created_at = Column(DateTime, default=datetime.utcnow)


# -----------------------------------------
#  ApiKey — tenant-scoped API access
# -----------------------------------------

class ApiKey(Base):
    __tablename__ = "api_keys"

    id = Column(String(36), primary_key=True, default=_uuid)
    tenant_id = Column(String(36), ForeignKey("tenants.id"), nullable=False)
    name = Column(String(255), nullable=False)                   # "Production", "Slack Bot"
    key_hash = Column(String(255), nullable=False)               # bcrypt hash of full key
    key_prefix = Column(String(12), nullable=False)              # "cane_a1b2c3d4" for display
    workspace_id = Column(String(36), nullable=True)             # Scope to workspace/agent (null = all)
    is_active = Column(Boolean, default=True)
    requests_today = Column(Integer, default=0)
    rate_limit = Column(Integer, default=1000)                   # Requests per day
    last_used_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    tenant = relationship("Tenant")


# ─────────────────────────────────────────
#  Import eval models so they register with Base
# ─────────────────────────────────────────
from eval_models import (                                          # noqa: E402, F401
    Environment, TestCase, JudgeCriteria, JudgeCustomRule,
    EvalRun, EvalResult,
)
from marketplace_models import (                                    # noqa: E402, F401
    MarketplaceListing, MarketplaceClone,
)
from tool_models import AgentTool, AgentLink                           # noqa: E402, F401
from connector_models import (                                         # noqa: E402, F401
    ConnectorCredential, ConnectorSync, ConnectorFile,
)
from schedule_models import AgentSchedule, AgentScheduleRun            # noqa: E402, F401