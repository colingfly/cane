"""
seeds/update_legal_agent.py - Update the Legal Document Processor eval to validation-focused test cases.

Usage:
    cd backend && python seeds/update_legal_agent.py

Updates existing test cases, criteria, custom rules, and marketplace snapshots
without deleting or re-creating the agent or environment.
"""
import sys
import json
from pathlib import Path

_root = str(Path(__file__).resolve().parent.parent)
if _root not in sys.path:
    sys.path.insert(0, _root)

from database import init_db, SessionLocal
from db_models import User, Tenant
from eval_models import Environment, TestCase, JudgeCriteria, JudgeCustomRule
from marketplace_models import MarketplaceListing
import migrations

# Import the updated config from the seed file
from seeds.seed_legal_agent import (
    AGENT_NAME, AGENT_DESC, TEST_CASES, CRITERIA, CUSTOM_RULES,
)


def update():
    """Update existing Legal Document Processor with new validation-focused eval config."""
    init_db()
    try:
        migrations.run_all()
    except Exception as e:
        print(f"[Update] Migrations: {e}")

    db = SessionLocal()

    try:
        # Find the marketplace listing
        listing = db.query(MarketplaceListing).filter(
            MarketplaceListing.name == AGENT_NAME,
        ).first()

        if not listing:
            print(f"[Update] No marketplace listing found for '{AGENT_NAME}'. Run seed_legal_agent.py first.")
            return

        env_id = listing.source_environment_id
        if not env_id:
            print("[Update] Listing has no source_environment_id. Cannot update.")
            return

        env = db.query(Environment).filter(Environment.id == env_id).first()
        if not env:
            print(f"[Update] Environment {env_id} not found.")
            return

        print(f"[Update] Found environment: {env.name} (id={env.id})")

        # 1. Replace test cases
        old_cases = db.query(TestCase).filter(TestCase.environment_id == env.id).all()
        print(f"[Update] Deleting {len(old_cases)} old test cases...")
        for tc in old_cases:
            db.delete(tc)
        db.flush()

        for tc in TEST_CASES:
            db.add(TestCase(
                environment_id=env.id,
                question=tc["question"],
                expected_answer=tc["expected_answer"],
                tags=tc["tags"],
                sort_order=tc["sort_order"],
            ))
        print(f"[Update] Added {len(TEST_CASES)} new test cases")

        # 2. Replace criteria
        old_criteria = db.query(JudgeCriteria).filter(JudgeCriteria.environment_id == env.id).all()
        print(f"[Update] Deleting {len(old_criteria)} old criteria...")
        for c in old_criteria:
            db.delete(c)
        db.flush()

        for c in CRITERIA:
            db.add(JudgeCriteria(
                environment_id=env.id,
                key=c["key"],
                label=c["label"],
                description=c["description"],
                weight=c["weight"],
                sort_order=c["sort_order"],
            ))
        print(f"[Update] Added {len(CRITERIA)} new criteria")

        # 3. Replace custom rules
        old_rules = db.query(JudgeCustomRule).filter(JudgeCustomRule.environment_id == env.id).all()
        print(f"[Update] Deleting {len(old_rules)} old custom rules...")
        for r in old_rules:
            db.delete(r)
        db.flush()

        for i, rule in enumerate(CUSTOM_RULES):
            db.add(JudgeCustomRule(
                environment_id=env.id,
                rule_text=rule,
                sort_order=i + 1,
            ))
        print(f"[Update] Added {len(CUSTOM_RULES)} new custom rules")

        # 4. Update environment description
        env.description = "Validation suite for the Legal Document Processor. Tests gap detection, missing field identification, completeness auditing, and structured report output."
        print(f"[Update] Updated environment description")

        # 5. Update marketplace listing snapshots
        listing.description = AGENT_DESC

        listing.test_cases_snapshot = json.dumps([
            {
                "question": tc["question"],
                "expected_answer": tc["expected_answer"],
                "tags": tc["tags"],
                "sort_order": tc["sort_order"],
            }
            for tc in TEST_CASES
        ])

        listing.criteria_snapshot = json.dumps([
            {
                "key": c["key"],
                "label": c["label"],
                "description": c["description"],
                "weight": c["weight"],
                "is_enabled": True,
            }
            for c in CRITERIA
        ])

        listing.custom_rules_snapshot = json.dumps([r for r in CUSTOM_RULES])
        listing.test_case_count = len(TEST_CASES)

        print(f"[Update] Updated marketplace snapshots")

        db.commit()
        print(f"\n[Update] Done. Legal Document Processor eval is now validation-focused.")
        print(f"  Environment ID: {env.id}")
        print(f"  Listing ID:     {listing.id}")
        print(f"  Test cases:     {len(TEST_CASES)}")
        print(f"  Criteria:       {len(CRITERIA)}")
        print(f"  Custom rules:   {len(CUSTOM_RULES)}")

    except Exception as e:
        db.rollback()
        print(f"[Update] Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()


if __name__ == "__main__":
    update()
