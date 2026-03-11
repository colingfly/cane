"""
connector_models.py — Database models for Live Connectors (Google Drive, etc.).

ConnectorCredential — Per-tenant OAuth credentials for external services.
ConnectorSync      — Maps a remote folder to a workspace (continuous sync).
ConnectorFile      — Tracks individual files synced from the remote source.
"""
import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, Integer, Boolean, DateTime, Float, ForeignKey
from database import Base


def _uuid():
    return str(uuid.uuid4())


class ConnectorCredential(Base):
    __tablename__ = "connector_credentials"

    id = Column(String(36), primary_key=True, default=_uuid)
    tenant_id = Column(String(36), ForeignKey("tenants.id"), nullable=False)
    provider = Column(String(50), nullable=False)              # "google_drive"

    # OAuth tokens (encrypted via services.crypto)
    refresh_token = Column(Text, default="")
    access_token = Column(Text, default="")
    token_expires_at = Column(DateTime, nullable=True)

    # Display info
    account_email = Column(String(255), default="")            # "user@gmail.com"

    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f"<ConnectorCredential {self.provider} {self.account_email}>"


class ConnectorSync(Base):
    __tablename__ = "connector_syncs"

    id = Column(String(36), primary_key=True, default=_uuid)
    tenant_id = Column(String(36), ForeignKey("tenants.id"), nullable=False)
    credential_id = Column(String(36), ForeignKey("connector_credentials.id"), nullable=False)
    workspace_id = Column(String(36), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    provider = Column(String(50), default="google_drive")

    # Remote folder info
    remote_folder_id = Column(String(255), nullable=False)     # Google Drive folder ID
    remote_folder_name = Column(String(500), default="")       # "Project Documents"

    # Sync state
    status = Column(String(20), default="active")              # "active" | "paused" | "error"
    last_sync_at = Column(DateTime, nullable=True)
    last_sync_status = Column(String(20), default="")          # "success" | "error" | "running"
    last_sync_message = Column(Text, default="")
    files_synced = Column(Integer, default=0)
    sync_interval_minutes = Column(Integer, default=60)

    # Google Drive Changes API page token for incremental sync
    last_change_token = Column(Text, default="")

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f"<ConnectorSync {self.remote_folder_name} → ws={self.workspace_id[:8]}>"


class ConnectorFile(Base):
    __tablename__ = "connector_files"

    id = Column(String(36), primary_key=True, default=_uuid)
    sync_id = Column(String(36), ForeignKey("connector_syncs.id", ondelete="CASCADE"), nullable=False)
    tenant_id = Column(String(36), ForeignKey("tenants.id"), nullable=False)
    document_id = Column(String(36), ForeignKey("documents.id"), nullable=True)  # linked after ingestion

    # Remote file info
    remote_file_id = Column(String(255), nullable=False)       # Google Drive file ID
    remote_name = Column(String(500), default="")
    remote_mime_type = Column(String(255), default="")
    remote_modified_at = Column(DateTime, nullable=True)
    remote_size_bytes = Column(Integer, default=0)

    # Local state
    local_path = Column(String(1000), default="")
    status = Column(String(20), default="pending")             # pending|downloading|ingesting|ready|error|deleted
    error_message = Column(Text, default="")

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f"<ConnectorFile {self.remote_name} ({self.status})>"
