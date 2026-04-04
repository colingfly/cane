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

from cane.core.database import Base


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

    # External agent targeting (eval-as-a-service)
    target_type = Column(String(20), default="internal")       # "internal" | "external"
    target_url = Column(String(500), nullable=True, default="")
    target_method = Column(String(10), default="POST")
    target_headers = Column(Text, nullable=True, default="{}")
    target_payload_template = Column(Text, nullable=True, default='{"message": "{{question}}"}')
    target_response_path = Column(String(255), nullable=True, default="response")
    is_public = Column(Boolean, default=False)                 # public eval suite for API access

    # Reliability config
    response_schema = Column(Text, nullable=True)              # JSON Schema for agent response validation
    latency_target_ms = Column(Integer, nullable=True)         # target p95 latency threshold

    # Judge model config (multi-model support)
    judge_provider = Column(String(30), default="anthropic")   # anthropic | openai | gemini | openai-compatible
    judge_model = Column(String(100), nullable=True)           # None = platform default (claude-sonnet-4-5)
    judge_config = Column(Text, nullable=True)                 # JSON: {"api_key": "...", "base_url": "..."}

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
    target_snapshot = Column(Text, nullable=True)    # JSON snapshot of target config
    api_key_id = Column(String(36), nullable=True)   # if triggered via public API
    triggered_by = Column(String(36), ForeignKey("users.id"), nullable=True)
    error_message = Column(Text, nullable=True)

    # Reliability layer (v0.4.0)
    latency_p50_ms = Column(Integer, nullable=True)
    latency_p95_ms = Column(Integer, nullable=True)
    latency_p99_ms = Column(Integer, nullable=True)
    latency_max_ms = Column(Integer, nullable=True)
    latency_mean_ms = Column(Integer, nullable=True)
    schema_pass = Column(Integer, nullable=True)
    schema_fail = Column(Integer, nullable=True)
    reliability_score = Column(Float, nullable=True)
    reliability_grade = Column(String(2), nullable=True)   # A, B, C, D, F

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

    # Reliability layer (v0.4.0)
    schema_valid = Column(Boolean, nullable=True)
    schema_errors = Column(Text, nullable=True)        # JSON array of validation errors

    created_at = Column(DateTime, default=datetime.utcnow)

    eval_run = relationship("EvalRun", back_populates="results")
    test_case = relationship("TestCase")

    def __repr__(self):
        return f"<EvalResult {self.status} score={self.overall_score}>"


# -----------------------------------------
#  MiningJob
# -----------------------------------------

class MiningJob(Base):
    __tablename__ = "mining_jobs"

    id = Column(String(36), primary_key=True, default=_uuid)
    environment_id = Column(String(36), ForeignKey("environments.id"), nullable=False)
    tenant_id = Column(String(36), ForeignKey("tenants.id"), nullable=False)
    status = Column(String(20), default="pending")  # pending | running | completed | failed
    source_run_ids = Column(Text, nullable=True)     # JSON array of run IDs
    config = Column(Text, nullable=True)             # JSON: min_score, max_score, strategy, model, max_examples
    total_failures = Column(Integer, default=0)
    total_mined = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)
    created_by = Column(String(36), ForeignKey("users.id"), nullable=True)
    api_key_id = Column(String(36), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    environment = relationship("Environment")
    tenant = relationship("Tenant")
    examples = relationship("MinedExample", back_populates="mining_job", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<MiningJob {self.status} mined={self.total_mined}/{self.total_failures}>"


# -----------------------------------------
#  MinedExample
# -----------------------------------------

class MinedExample(Base):
    __tablename__ = "mined_examples"

    id = Column(String(36), primary_key=True, default=_uuid)
    mining_job_id = Column(String(36), ForeignKey("mining_jobs.id", ondelete="CASCADE"), nullable=False)
    eval_result_id = Column(String(36), ForeignKey("eval_results.id"), nullable=True)
    failure_type = Column(String(50), default="other")   # hallucination | incomplete | off_topic | wrong_format | factual_error | other
    original_answer = Column(Text, nullable=True)
    improved_answer = Column(Text, nullable=True)
    improvement_reasoning = Column(Text, nullable=True)
    prompt = Column(Text, nullable=True)                 # the question
    expected_answer = Column(Text, nullable=True)
    sources_context = Column(Text, nullable=True)
    original_score = Column(Float, default=0)
    estimated_improved_score = Column(Float, nullable=True)
    export_format = Column(String(10), default="dpo")
    created_at = Column(DateTime, default=datetime.utcnow)

    mining_job = relationship("MiningJob", back_populates="examples")
    eval_result = relationship("EvalResult")

    def __repr__(self):
        return f"<MinedExample {self.failure_type} score={self.original_score}>"


# -----------------------------------------
#  EvalSchedule
# -----------------------------------------

class EvalSchedule(Base):
    __tablename__ = "eval_schedules"

    id = Column(String(36), primary_key=True, default=_uuid)
    environment_id = Column(String(36), ForeignKey("environments.id", ondelete="CASCADE"), nullable=False)
    tenant_id = Column(String(36), ForeignKey("tenants.id"), nullable=False)
    is_enabled = Column(Boolean, default=True)

    # Schedule config
    schedule_type = Column(String(20), default="daily")    # daily | interval | cron
    daily_time = Column(String(5), default="09:00")        # HH:MM (UTC)
    interval_hours = Column(Integer, default=24)            # for interval type
    cron_expression = Column(String(100), nullable=True)    # for cron type (future)

    # Behavior
    auto_mine = Column(Boolean, default=False)              # auto-trigger failure mining after run
    mine_max_score = Column(Integer, default=60)            # threshold for auto-mining
    notify_on_regression = Column(Boolean, default=True)    # fire webhook on score drop

    # Tracking
    last_run_id = Column(String(36), nullable=True)
    last_run_at = Column(DateTime, nullable=True)
    last_score = Column(Float, nullable=True)
    next_run_at = Column(DateTime, nullable=True)
    run_count = Column(Integer, default=0)
    last_status = Column(String(20), default="idle")        # idle | running | completed | failed
    consecutive_failures = Column(Integer, default=0)

    created_by = Column(String(36), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    environment = relationship("Environment")
    tenant = relationship("Tenant")

    def __repr__(self):
        return f"<EvalSchedule env={self.environment_id} type={self.schedule_type} enabled={self.is_enabled}>"
