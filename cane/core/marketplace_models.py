"""
marketplace_models.py — SQLAlchemy ORM models for the Agent Marketplace.

MarketplaceListing  →  a published agent with performance card
MarketplaceClone    →  tracks who cloned what, with re-verify scores
"""
import uuid
from datetime import datetime

from sqlalchemy import (
    Column, String, Integer, Float, Text, DateTime, Boolean, ForeignKey,
)
from sqlalchemy.orm import relationship

from cane.core.database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


# ─────────────────────────────────────────
#  MarketplaceListing
# ─────────────────────────────────────────

class MarketplaceListing(Base):
    __tablename__ = "marketplace_listings"

    id = Column(String(36), primary_key=True, default=_uuid)

    # Publisher
    publisher_tenant_id = Column(String(36), ForeignKey("tenants.id"), nullable=False)
    publisher_user_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    publisher_name = Column(String(255), default="")        # display name
    guest_session_id = Column(String(36), nullable=True)    # for anonymous "Community" listings

    # Source (reference only — listing is a fork/snapshot)
    source_workspace_id = Column(String(36), nullable=False)
    source_environment_id = Column(String(36), nullable=True)

    # ─── Blueprint (snapshot) ───
    name = Column(String(255), nullable=False)
    description = Column(Text, default="")
    icon = Column(String(10), default="")
    system_prompt = Column(Text, nullable=False)
    agent_type = Column(String(50), default="custom")

    # ─── Discovery ───
    category = Column(String(100), default="general")       # "legal", "healthcare", "finance", "engineering", "education", "operations", "general"
    tags = Column(Text, default="[]")                        # JSON array: ["compliance", "hipaa", "onboarding"]

    # ─── Pack type ───
    pack_type = Column(String(20), default="byod")           # "byod" | "open" | "licensed"
    # For "open" and "licensed": documents are included
    # For "byod": only prompt + eval spec transfer
    included_documents = Column(Text, default="[]")          # JSON: [{filename, file_type, chunk_count}] — metadata only for display
    document_count = Column(Integer, default=0)

    # ─── Performance Card (auto-generated from best eval run) ───
    overall_score = Column(Float, nullable=True)
    eval_snapshot = Column(Text, nullable=True)              # JSON: full performance card
    # {
    #   "overall_score": 87.3,
    #   "passed": 8, "warned": 1, "failed": 1,
    #   "total_cases": 10,
    #   "criteria_breakdown": [{"key": "accuracy", "label": "Accuracy", "avg_score": 89.2, "weight": 25}, ...],
    #   "response_time_avg_ms": 4200,
    #   "test_cases_preview": [{"question": "...", "score": 92, "status": "pass"}, ...],
    # }

    # ─── Eval Spec (the transferable test harness) ───
    test_cases_snapshot = Column(Text, nullable=True)        # JSON: [{question, expected_answer, tags, sort_order}]
    criteria_snapshot = Column(Text, nullable=True)          # JSON: [{key, label, description, weight}]
    custom_rules_snapshot = Column(Text, nullable=True)      # JSON: [rule_text, ...]
    test_case_count = Column(Integer, default=0)

    # ─── Tools (schema only, no auth values) ───
    tools_snapshot = Column(Text, nullable=True)              # JSON: [{name, description, url, method, parameters, fire_and_forget}]
    tool_count = Column(Integer, default=0)

    # ─── Community stats ───
    clone_count = Column(Integer, default=0)
    verify_count = Column(Integer, default=0)
    avg_verify_score = Column(Float, nullable=True)          # avg re-verify across all clones

    # ─── Verification badge ───
    badge_level = Column(String(20), default="unverified")   # "verified" | "tested" | "unverified"
    badge_updated_at = Column(DateTime, nullable=True)

    # ─── Status ───
    status = Column(String(20), default="active")            # "active" | "delisted"
    is_featured = Column(Boolean, default=False)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    publisher_tenant = relationship("Tenant")
    publisher_user = relationship("User")
    clones = relationship("MarketplaceClone", back_populates="listing", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<MarketplaceListing {self.name} score={self.overall_score}>"


# ─────────────────────────────────────────
#  MarketplaceClone
# ─────────────────────────────────────────

class MarketplaceClone(Base):
    __tablename__ = "marketplace_clones"

    id = Column(String(36), primary_key=True, default=_uuid)
    listing_id = Column(String(36), ForeignKey("marketplace_listings.id", ondelete="CASCADE"), nullable=False)

    # Who cloned
    cloned_by_tenant_id = Column(String(36), ForeignKey("tenants.id"), nullable=False)
    cloned_by_user_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    guest_session_id = Column(String(36), nullable=True)

    # What was created
    cloned_workspace_id = Column(String(36), nullable=True)      # the new agent
    cloned_environment_id = Column(String(36), nullable=True)    # the new eval environment

    # Re-verify
    verify_score = Column(Float, nullable=True)
    verified_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    listing = relationship("MarketplaceListing", back_populates="clones")
    cloned_by_tenant = relationship("Tenant")
    cloned_by_user = relationship("User")

    def __repr__(self):
        return f"<MarketplaceClone listing={self.listing_id} verify={self.verify_score}>"