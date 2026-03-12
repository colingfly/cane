"""
eval_models.py — SQLAlchemy ORM models for Cane Environments system.

Environment  →  evaluation pipeline for an agent
TestCase     →  question + expected answer
JudgeCriteria → scoring dimension with weight
JudgeCustomRule → free-text evaluation rule
EvalRun      →  one execution of the full environment
EvalResult   →  per-test-case result within a run
"""
import uuid
from datetime import datetime

from sqlalchemy import (
    Column, String, Integer, Float, Text, DateTime, Boolean, ForeignKey,
)
from sqlalchemy.orm import relationship

from database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


# ─────────────────────────────────────────
#  Environment
# ─────────────────────────────────────────

class Environment(Base):
    __tablename__ = "environments"

    id = Column(String(36), primary_key=True, default=_uuid)
    tenant_id = Column(String(36), ForeignKey("tenants.id"), nullable=False)
    workspace_id = Column(String(36), ForeignKey("workspaces.id"), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text, default="")
    created_by = Column(String(36), ForeignKey("users.id"), nullable=True)
    is_active = Column(Boolean, default=True)
    webhook_url = Column(String(500), nullable=True, default="")
    webhook_headers = Column(Text, nullable=True, default="{}")
    webhook_enabled = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    tenant = relationship("Tenant")
    workspace = relationship("Workspace")
    creator = relationship("User")
    test_cases = relationship("TestCase", back_populates="environment", cascade="all, delete-orphan")
    criteria = relationship("JudgeCriteria", back_populates="environment", cascade="all, delete-orphan")
    custom_rules = relationship("JudgeCustomRule", back_populates="environment", cascade="all, delete-orphan")
    runs = relationship("EvalRun", back_populates="environment", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Environment {self.name}>"


# ─────────────────────────────────────────
#  TestCase
# ─────────────────────────────────────────

class TestCase(Base):
    __tablename__ = "test_cases"

    id = Column(String(36), primary_key=True, default=_uuid)
    environment_id = Column(String(36), ForeignKey("environments.id", ondelete="CASCADE"), nullable=False)
    question = Column(Text, nullable=False)
    expected_answer = Column(Text, nullable=True)
    tags = Column(Text, nullable=True)           # JSON array: ["policy", "onboarding"]
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    environment = relationship("Environment", back_populates="test_cases")

    def __repr__(self):
        return f"<TestCase {self.question[:50]}>"


# ─────────────────────────────────────────
#  JudgeCriteria
# ─────────────────────────────────────────

class JudgeCriteria(Base):
    __tablename__ = "judge_criteria"

    id = Column(String(36), primary_key=True, default=_uuid)
    environment_id = Column(String(36), ForeignKey("environments.id", ondelete="CASCADE"), nullable=False)
    key = Column(String(100), nullable=False)     # "accuracy", "hallucination"
    label = Column(String(255), nullable=False)   # "Accuracy"
    description = Column(Text, default="")
    weight = Column(Integer, default=0)           # 0-100
    is_enabled = Column(Boolean, default=True)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    environment = relationship("Environment", back_populates="criteria")

    def __repr__(self):
        return f"<JudgeCriteria {self.key} w={self.weight}>"


# ─────────────────────────────────────────
#  JudgeCustomRule
# ─────────────────────────────────────────

class JudgeCustomRule(Base):
    __tablename__ = "judge_custom_rules"

    id = Column(String(36), primary_key=True, default=_uuid)
    environment_id = Column(String(36), ForeignKey("environments.id", ondelete="CASCADE"), nullable=False)
    rule_text = Column(Text, nullable=False)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    environment = relationship("Environment", back_populates="custom_rules")

    def __repr__(self):
        return f"<JudgeCustomRule {self.rule_text[:50]}>"


# ─────────────────────────────────────────
#  EvalRun
# ─────────────────────────────────────────

class EvalRun(Base):
    __tablename__ = "eval_runs"

    id = Column(String(36), primary_key=True, default=_uuid)
    environment_id = Column(String(36), ForeignKey("environments.id"), nullable=False)
    tenant_id = Column(String(36), ForeignKey("tenants.id"), nullable=False)
    status = Column(String(20), default="pending")  # pending | running | completed | failed
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    total_cases = Column(Integer, default=0)
    passed = Column(Integer, default=0)
    warned = Column(Integer, default=0)
    failed = Column(Integer, default=0)
    overall_score = Column(Float, nullable=True)
    agent_prompt = Column(Text, nullable=True)       # snapshot
    criteria_snapshot = Column(Text, nullable=True)   # JSON snapshot
    triggered_by = Column(String(36), ForeignKey("users.id"), nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    environment = relationship("Environment", back_populates="runs")
    tenant = relationship("Tenant")
    triggered_by_user = relationship("User")
    results = relationship("EvalResult", back_populates="eval_run", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<EvalRun {self.status} score={self.overall_score}>"


# ─────────────────────────────────────────
#  EvalResult
# ─────────────────────────────────────────

class EvalResult(Base):
    __tablename__ = "eval_results"

    id = Column(String(36), primary_key=True, default=_uuid)
    eval_run_id = Column(String(36), ForeignKey("eval_runs.id", ondelete="CASCADE"), nullable=False)
    test_case_id = Column(String(36), ForeignKey("test_cases.id"), nullable=False)
    question = Column(Text, nullable=False)          # snapshot
    expected_answer = Column(Text, nullable=True)     # snapshot
    agent_answer = Column(Text, nullable=True)
    sources_used = Column(Text, nullable=True)        # JSON
    overall_score = Column(Float, nullable=True)
    criteria_scores = Column(Text, nullable=True)     # JSON
    judge_reasoning = Column(Text, nullable=True)
    status = Column(String(20), default="pending")    # pending | pass | warn | fail
    response_time_ms = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    eval_run = relationship("EvalRun", back_populates="results")
    test_case = relationship("TestCase")

    def __repr__(self):
        return f"<EvalResult {self.status} score={self.overall_score}>"
