"""
pack_seeder.py — Seeds agent packs into the marketplace as featured listings.

Called at app startup. Idempotent — skips packs that already exist.
Also provides clone_pack() which creates a full agent from a pack:
workspace + tools + eval environment + test cases + criteria.
"""
import json
import uuid
from datetime import datetime

from sqlalchemy.orm import Session

from marketplace_models import MarketplaceListing
from eval_models import Environment, TestCase, JudgeCriteria, JudgeCustomRule
from db_models import Workspace
from tool_models import AgentTool
from packs import ALL_PACKS


def seed_packs(db: Session, publisher_tenant_id: str, publisher_user_id: str):
    """
    Seed all packs as featured marketplace listings.
    Skips any that already exist (matched by name).
    """
    existing = {
        l.name for l in db.query(MarketplaceListing.name).filter(
            MarketplaceListing.publisher_tenant_id == publisher_tenant_id,
        ).all()
    }

    count = 0
    for pack_id, pack in ALL_PACKS.items():
        if pack["name"] in existing:
            print(f"  [Packs] Skipping {pack['name']} — already exists")
            continue

        listing = MarketplaceListing(
            id=str(uuid.uuid4()),
            publisher_tenant_id=publisher_tenant_id,
            publisher_user_id=publisher_user_id,
            publisher_name="Cane",
            source_workspace_id="pack_" + pack_id,
            name=pack["name"],
            description=pack["description"],
            icon=pack.get("icon", ""),
            system_prompt=pack["system_prompt"],
            agent_type="custom",
            category=pack.get("category", "general"),
            tags=json.dumps(pack.get("tags", [])),
            pack_type=pack.get("pack_type", "byod"),
            included_documents=json.dumps([]),
            document_count=0,

            # Build a synthetic performance card showing what the eval covers
            overall_score=None,
            eval_snapshot=json.dumps({
                "note": "This is a pre-built pack. Clone it, upload your docs, and run the eval to get your score.",
                "total_cases": len(pack.get("test_cases", [])),
                "criteria": [c["label"] for c in pack.get("criteria", [])],
            }),

            # Snapshot the eval spec
            test_cases_snapshot=json.dumps([
                {
                    "question": tc["question"],
                    "expected_answer": tc.get("expected_answer", ""),
                    "tags": json.dumps(tc.get("tags", [])),
                    "sort_order": i,
                }
                for i, tc in enumerate(pack.get("test_cases", []))
            ]),
            criteria_snapshot=json.dumps(pack.get("criteria", [])),
            custom_rules_snapshot=json.dumps([r for r in pack.get("custom_rules", [])]),
            test_case_count=len(pack.get("test_cases", [])),

            # Featured
            is_featured=True,
            status="active",
        )

        db.add(listing)
        count += 1
        print(f"  [Packs] Seeded: {pack['name']} ({len(pack.get('test_cases', []))} test cases, {len(pack.get('tools', []))} tools)")

    if count:
        db.commit()
        print(f"  [Packs] Seeded {count} packs into marketplace")
    else:
        print(f"  [Packs] All packs already seeded")


def clone_pack(
    pack_id: str,
    user_id: str,
    tenant_id: str,
    db: Session,
) -> dict | None:
    """
    Create a full agent from a pack definition.
    Returns {"agent_id", "environment_id", "tools_created", "upload_guide"} or None.
    """
    pack = ALL_PACKS.get(pack_id)
    if not pack:
        return None

    # 1) Create workspace (agent)
    ws = Workspace(
        tenant_id=tenant_id,
        name=pack["name"],
        description=pack["description"],
        agent_type="custom",
        system_prompt=pack["system_prompt"],
        agent_icon=pack.get("icon", ""),
        agent_description=pack["description"],
        show_on_homepage=False,
    )
    db.add(ws)
    db.flush()

    # 2) Create webhook tools
    tools_created = 0
    for tool_def in pack.get("tools", []):
        tool = AgentTool(
            workspace_id=ws.id,
            tenant_id=tenant_id,
            name=tool_def["name"],
            description=tool_def["description"],
            tool_type=tool_def.get("tool_type", "webhook"),
            url="https://your-webhook-url.com",  # Placeholder — user configures
            method=tool_def.get("method", "POST"),
            headers="{}",
            payload_template=json.dumps(_build_payload_template(tool_def.get("parameters", []))),
            auth_type="none",
            auth_value="",
            parameters=json.dumps(tool_def.get("parameters", [])),
            is_enabled=False,  # Disabled until user configures the URL
            fire_and_forget=tool_def.get("fire_and_forget", True),
        )
        db.add(tool)
        tools_created += 1

    # 3) Create eval environment
    env = Environment(
        tenant_id=tenant_id,
        workspace_id=ws.id,
        name=f"{pack['name']} — Eval",
        description=f"Bundled evaluation for {pack['name']}. {len(pack.get('test_cases', []))} test cases across {len(pack.get('criteria', []))} scoring dimensions.",
        created_by=user_id,
    )
    db.add(env)
    db.flush()

    # 4) Create test cases
    for i, tc in enumerate(pack.get("test_cases", [])):
        db.add(TestCase(
            environment_id=env.id,
            question=tc["question"],
            expected_answer=tc.get("expected_answer", ""),
            tags=json.dumps(tc.get("tags", [])),
            sort_order=i,
        ))

    # 5) Create criteria
    for c in pack.get("criteria", []):
        db.add(JudgeCriteria(
            environment_id=env.id,
            key=c["key"],
            label=c["label"],
            description=c.get("description", ""),
            weight=c.get("weight", 20),
            is_enabled=True,
        ))

    # 6) Create custom rules
    for i, rule in enumerate(pack.get("custom_rules", [])):
        db.add(JudgeCustomRule(
            environment_id=env.id,
            rule_text=rule,
            sort_order=i,
        ))

    db.commit()

    print(f"  [Packs] Cloned: {pack['name']} → agent={ws.id}, env={env.id}, tools={tools_created}")

    return {
        "agent_id": ws.id,
        "environment_id": env.id,
        "tools_created": tools_created,
        "suggested_mcp": pack.get("suggested_mcp", []),
        "upload_guide": pack.get("upload_guide", {}),
    }


def _build_payload_template(parameters: list) -> dict:
    """Build a webhook payload template from parameter definitions."""
    template = {}
    for p in parameters:
        template[p["name"]] = "{{" + p["name"] + "}}"
    return template
