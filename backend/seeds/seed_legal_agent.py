"""
seeds/seed_legal_agent.py - Seed a Legal Document Processor agent and publish to marketplace.

Usage:
    cd backend && python seeds/seed_legal_agent.py

Creates:
    1. Workspace (agent) with a legal-focused system prompt
    2. Eval environment with test cases, criteria, and custom rules
    3. Marketplace listing (BYOD - bring your own data)
"""
import sys
import json
from pathlib import Path

_root = str(Path(__file__).resolve().parent.parent)
if _root not in sys.path:
    sys.path.insert(0, _root)

from database import init_db, SessionLocal
from db_models import User, Tenant, Workspace
from eval_models import Environment, TestCase, JudgeCriteria, JudgeCustomRule
from marketplace_models import MarketplaceListing
import migrations


# ── Agent Config ──

AGENT_NAME = "Legal Document Processor"
AGENT_ICON = "LA"
AGENT_DESC = (
    "Document validation agent for legal departments. Upload contracts, policies, and compliance "
    "documents. Automatically audit for missing fields, absent clauses, incomplete sections, "
    "and placeholder values. Produces structured completeness reports for human review."
)

SYSTEM_PROMPT = """You are a Legal Document Processor, a specialized RAG assistant for legal departments. You help attorneys, paralegals, compliance officers, and staff navigate contracts, policies, regulations, and internal legal documents using ONLY the provided document excerpts.

Core Capabilities:
- Contract clause extraction: identify specific clauses, obligations, rights, and conditions
- Policy and compliance Q&A: answer questions about internal policies with exact section citations
- Risk flagging: identify potential liability, ambiguous language, missing standard clauses, and compliance gaps
- Cross-referencing: connect related provisions across multiple documents
- Terminology lookup: define legal terms as used within the organization's specific documents

Citation Rules:
- Every substantive claim must reference the source document title and section number
- Use the format: [Document Title, Section X.X] or [Document Title, Page X]
- When multiple documents address the same topic, cite all relevant sources
- If a provision has been amended or superseded, note the most recent version
- When quoting exact language, use quotation marks and cite precisely

Response Format:
- Lead with the direct answer in the first sentence
- Follow with supporting citations and relevant context
- For multi-part questions, use numbered sections with clear headings
- For contract review questions, organize by: (1) Key Terms, (2) Obligations, (3) Risk Flags, (4) Missing Provisions
- Keep language formal and precise, matching legal document conventions

Risk and Compliance Flags:
- Flag ambiguous language that could be interpreted multiple ways
- Note missing standard clauses (indemnification, limitation of liability, termination, force majeure, governing law)
- Identify potential conflicts between documents or provisions
- Highlight upcoming deadlines, renewal dates, or expiration dates if mentioned
- Note any provisions that deviate from standard market terms

Guardrails:
- NEVER provide legal advice, legal opinions, or recommend specific legal actions
- NEVER speculate about legal outcomes, case precedent, or judicial interpretation
- When asked for advice, respond: "I can show you what the documents say, but legal advice should come from your legal counsel."
- NEVER fabricate provisions, clauses, or document references that do not appear in the provided excerpts
- If information is not in the provided excerpts, say: "This is not addressed in the available documents. You may want to check [suggest which type of document might contain it]."
- Before concluding something is missing, carefully review ALL provided excerpts
- When listing items (clauses, obligations, parties), search all excerpts and note if the list may be incomplete due to retrieval scope

Terminology:
- Use legal terminology precisely as it appears in the source documents
- Do not simplify or paraphrase defined terms, they carry specific legal meaning
- When a term is defined in the documents, reference the definition on first use
- Maintain consistency with the organization's naming conventions for departments, roles, and processes"""

# ── Eval Test Cases ──

TEST_CASES = [
    {
        "question": "Validate this contract for required standard clauses. Check for: indemnification, limitation of liability, termination, force majeure, governing law, and dispute resolution. List any that are missing.",
        "expected_answer": "The agent should check the document for each of the six standard clauses and produce a checklist showing PRESENT or MISSING for each one. Any missing clause should be flagged as a gap requiring review. Citations should reference the section where each present clause appears.",
        "tags": '["validation", "clauses", "completeness"]',
        "sort_order": 1,
    },
    {
        "question": "Audit this document for missing party information. Verify that all parties are fully identified with: legal entity name, address, jurisdiction, and authorized signatory. Flag any incomplete entries.",
        "expected_answer": "The agent should extract every party referenced in the document and check each for the four required fields (legal name, address, jurisdiction, signatory). Output a structured report showing which fields are present and which are missing for each party.",
        "tags": '["validation", "parties", "completeness"]',
        "sort_order": 2,
    },
    {
        "question": "Check this agreement for date completeness. Verify that the following dates are present and valid: effective date, expiration date, renewal deadline, and notice periods. Flag any missing or ambiguous dates.",
        "expected_answer": "The agent should scan the entire document for date-related fields and produce a date inventory. Each required date should be marked as FOUND (with the value and section) or MISSING. Ambiguous dates (e.g., 'within a reasonable time') should be flagged for human review.",
        "tags": '["validation", "dates", "completeness"]',
        "sort_order": 3,
    },
    {
        "question": "Review this contract for unsigned or incomplete signature blocks. Verify that all parties have signature lines with: name, title, date, and signature placeholder. Report any gaps.",
        "expected_answer": "The agent should locate all signature blocks in the document and verify each one contains the four required elements. Missing elements should be listed per party. If the document lacks signature blocks entirely, that should be flagged as a critical gap.",
        "tags": '["validation", "signatures", "completeness"]',
        "sort_order": 4,
    },
    {
        "question": "Scan this policy document for regulatory compliance references. Check whether it cites applicable regulations (GDPR, HIPAA, SOX, PCI-DSS, or industry-specific). Flag if no regulatory framework is referenced.",
        "expected_answer": "The agent should search the document for mentions of regulatory frameworks, compliance standards, and statutory references. Produce a list of all regulations cited with their section locations. If no regulatory references are found, flag this as a compliance gap requiring human review.",
        "tags": '["validation", "compliance", "regulatory"]',
        "sort_order": 5,
    },
    {
        "question": "Validate the financial terms in this agreement. Check for: payment amounts, payment schedule, currency, late payment penalties, and interest rates. Flag any that are missing or left as placeholders (e.g., '[TBD]', '___').",
        "expected_answer": "The agent should extract all financial terms and check each for completeness. Placeholder values like '[TBD]', blanks, or '___' should be flagged as incomplete fields requiring human input. Each found term should be listed with its value and location.",
        "tags": '["validation", "financial", "completeness"]',
        "sort_order": 6,
    },
    {
        "question": "Check this document for internal consistency. Verify that party names, defined terms, and section cross-references are used consistently throughout. Flag any mismatches or undefined terms.",
        "expected_answer": "The agent should track all defined terms and party name variations across the document. Any inconsistency (e.g., 'ABC Corp' vs 'ABC Corporation' vs 'the Company' without a definitions section linking them) should be flagged. Broken cross-references (referencing sections that do not exist) should also be reported.",
        "tags": '["validation", "consistency", "quality"]',
        "sort_order": 7,
    },
    {
        "question": "Audit this contract for confidentiality and data protection provisions. Verify the presence of: confidentiality obligations, data handling requirements, breach notification procedures, and data return/destruction clauses. Flag any that are absent.",
        "expected_answer": "The agent should check for each of the four data protection elements and report PRESENT or MISSING for each. For present provisions, cite the section. For missing provisions, flag them as gaps that may expose the organization to data-related risk.",
        "tags": '["validation", "data-protection", "completeness"]',
        "sort_order": 8,
    },
    {
        "question": "Validate the insurance requirements in this vendor agreement. Check for: minimum coverage amounts, required policy types (general liability, professional liability, cyber), certificate of insurance requirements, and additional insured status. Flag any gaps.",
        "expected_answer": "The agent should locate insurance-related provisions and check for each required element. Missing coverage types or unspecified minimum amounts should be flagged. If the agreement has no insurance section at all, flag this as a critical gap for vendor risk management.",
        "tags": '["validation", "insurance", "vendor-risk"]',
        "sort_order": 9,
    },
    {
        "question": "Perform a completeness check on this document. Verify it contains: a title, effective date, recitals/background section, definitions section, operative clauses, representations and warranties, and signature blocks. Produce a document structure report.",
        "expected_answer": "The agent should check for each structural element and produce a document structure checklist. Each element should be marked PRESENT (with location) or MISSING. The report should serve as a high-level completeness assessment that a human reviewer can use to quickly identify structural gaps before detailed review.",
        "tags": '["validation", "structure", "completeness"]',
        "sort_order": 10,
    },
]

# ── Eval Criteria ──

CRITERIA = [
    {
        "key": "gap_detection",
        "label": "Gap Detection",
        "description": "Does the response correctly identify missing fields, absent clauses, and incomplete sections? Does it catch placeholder values and blank entries? Are all gaps explicitly called out rather than glossed over?",
        "weight": 35,
        "sort_order": 1,
    },
    {
        "key": "structured_output",
        "label": "Structured Output",
        "description": "Does the response produce a clear, structured checklist or report? Is each item marked as PRESENT or MISSING? Can a human reviewer quickly scan the output to understand what needs attention?",
        "weight": 25,
        "sort_order": 2,
    },
    {
        "key": "accuracy",
        "label": "Accuracy",
        "description": "Does the response accurately reflect what the source documents contain? No fabricated provisions, no false positives (flagging something as missing when it exists), no hallucinated content.",
        "weight": 25,
        "sort_order": 3,
    },
    {
        "key": "actionability",
        "label": "Actionability",
        "description": "Does the response provide enough context for a human reviewer to act on each finding? Does it cite specific sections, explain why a gap matters, and indicate severity where relevant?",
        "weight": 15,
        "sort_order": 4,
    },
]

# ── Custom Rules ──

CUSTOM_RULES = [
    "Never fabricate document sections, clauses, or citations. If a provision is not found in the provided excerpts, mark it as MISSING rather than inventing content.",
    "Always produce output as a structured checklist or report with clear PRESENT/MISSING indicators for each item being validated.",
    "When flagging a missing field or clause, explain why it matters and what risk it introduces (e.g., 'Missing indemnification clause leaves the organization exposed to third-party claims').",
    "Detect and flag placeholder values such as '[TBD]', '___', 'INSERT HERE', or blank fields as incomplete items requiring human input.",
    "When validating across multiple documents or sections, produce a per-document breakdown so reviewers can address gaps individually.",
]


def seed():
    """Create Legal Document Processor agent, eval environment, and marketplace listing."""
    init_db()
    try:
        migrations.run_all()
    except Exception as e:
        print(f"[Seed] Migrations: {e}")

    # Ensure workspace columns exist (migrations may fail partway through)
    from sqlalchemy import text, inspect as sa_inspect
    from database import engine
    try:
        insp = sa_inspect(engine)
        cols = {c["name"] for c in insp.get_columns("workspaces")}
        with engine.begin() as conn:
            if "tool_chaining_enabled" not in cols:
                conn.execute(text("ALTER TABLE workspaces ADD COLUMN tool_chaining_enabled TINYINT(1) DEFAULT 0"))
                print("[Seed] Added tool_chaining_enabled column")
            if "orchestrator_mode" not in cols:
                conn.execute(text("ALTER TABLE workspaces ADD COLUMN orchestrator_mode TINYINT(1) DEFAULT 0"))
                print("[Seed] Added orchestrator_mode column")
    except Exception as e:
        print(f"[Seed] Column check: {e}")

    db = SessionLocal()

    try:
        # Find admin user
        admin = db.query(User).filter(User.role == "admin").first()
        if not admin:
            print("[Seed] No admin user found. Run the app first to create one.")
            return

        tenant = db.query(Tenant).filter(Tenant.id == admin.tenant_id).first()

        # Check if already seeded
        existing = db.query(MarketplaceListing).filter(
            MarketplaceListing.name == AGENT_NAME,
            MarketplaceListing.publisher_tenant_id == admin.tenant_id,
        ).first()
        if existing:
            print(f"[Seed] Legal agent already exists in marketplace (id={existing.id}). Skipping.")
            return

        # 1. Create workspace (agent)
        ws = Workspace(
            tenant_id=admin.tenant_id,
            name=AGENT_NAME,
            description=AGENT_DESC,
            agent_type="custom",
            agent_icon=AGENT_ICON,
            agent_description=AGENT_DESC,
            system_prompt=SYSTEM_PROMPT,
            show_on_homepage=False,
            is_default=False,
        )
        db.add(ws)
        db.flush()
        print(f"[Seed] Created agent: {ws.name} (id={ws.id})")

        # 2. Create eval environment
        env = Environment(
            tenant_id=admin.tenant_id,
            workspace_id=ws.id,
            name=f"{AGENT_NAME} - Eval",
            description="Validation suite for the Legal Document Processor. Tests gap detection, missing field identification, completeness auditing, and structured report output.",
            created_by=admin.id,
        )
        db.add(env)
        db.flush()
        print(f"[Seed] Created eval environment: {env.name} (id={env.id})")

        # 2a. Test cases
        for tc in TEST_CASES:
            db.add(TestCase(
                environment_id=env.id,
                question=tc["question"],
                expected_answer=tc["expected_answer"],
                tags=tc["tags"],
                sort_order=tc["sort_order"],
            ))
        print(f"[Seed] Added {len(TEST_CASES)} test cases")

        # 2b. Criteria
        for c in CRITERIA:
            db.add(JudgeCriteria(
                environment_id=env.id,
                key=c["key"],
                label=c["label"],
                description=c["description"],
                weight=c["weight"],
                sort_order=c["sort_order"],
            ))
        print(f"[Seed] Added {len(CRITERIA)} scoring criteria")

        # 2c. Custom rules
        for i, rule in enumerate(CUSTOM_RULES):
            db.add(JudgeCustomRule(
                environment_id=env.id,
                rule_text=rule,
                sort_order=i + 1,
            ))
        print(f"[Seed] Added {len(CUSTOM_RULES)} custom rules")

        # 3. Publish to marketplace
        publisher_name = admin.name or admin.email.split("@")[0]

        test_cases_snapshot = json.dumps([
            {
                "question": tc["question"],
                "expected_answer": tc["expected_answer"],
                "tags": tc["tags"],
                "sort_order": tc["sort_order"],
            }
            for tc in TEST_CASES
        ])

        criteria_snapshot = json.dumps([
            {
                "key": c["key"],
                "label": c["label"],
                "description": c["description"],
                "weight": c["weight"],
                "is_enabled": True,
            }
            for c in CRITERIA
        ])

        custom_rules_snapshot = json.dumps([r for r in CUSTOM_RULES])

        listing = MarketplaceListing(
            publisher_tenant_id=admin.tenant_id,
            publisher_user_id=admin.id,
            publisher_name=publisher_name,
            source_workspace_id=ws.id,
            source_environment_id=env.id,
            name=AGENT_NAME,
            description=AGENT_DESC,
            icon=AGENT_ICON,
            system_prompt=SYSTEM_PROMPT,
            agent_type="custom",
            category="legal",
            tags=json.dumps(["contracts", "compliance", "policy", "clauses", "risk"]),
            pack_type="byod",
            included_documents="[]",
            document_count=0,
            overall_score=None,
            eval_snapshot=None,
            test_cases_snapshot=test_cases_snapshot,
            criteria_snapshot=criteria_snapshot,
            custom_rules_snapshot=custom_rules_snapshot,
            test_case_count=len(TEST_CASES),
            tools_snapshot=None,
            tool_count=0,
            status="active",
            is_featured=True,
        )
        db.add(listing)
        db.flush()
        print(f"[Seed] Published to marketplace: {listing.name} (id={listing.id})")

        db.commit()
        print(f"\n[Seed] Done. Legal Document Processor is live in the marketplace.")
        print(f"  Agent ID:       {ws.id}")
        print(f"  Environment ID: {env.id}")
        print(f"  Listing ID:     {listing.id}")

    except Exception as e:
        db.rollback()
        print(f"[Seed] Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()


if __name__ == "__main__":
    seed()
