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


# ── Agent Config ──

AGENT_NAME = "Legal Document Processor"
AGENT_ICON = "LA"
AGENT_DESC = (
    "RAG agent built for legal departments. Upload contracts, policies, and compliance "
    "documents. Ask questions and get precise answers with section citations, risk flags, "
    "and cross-references. Built for multi-tenant deployments across departments."
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
        "question": "What are the termination provisions in our vendor agreements?",
        "expected_answer": "The agent should identify termination clauses including termination for cause, termination for convenience, notice periods, cure periods, and any post-termination obligations. Each provision should cite the specific section and document.",
        "tags": '["contracts", "termination"]',
        "sort_order": 1,
    },
    {
        "question": "What is our data retention policy for employee records?",
        "expected_answer": "The agent should cite the specific data retention policy document, identify retention periods by record type, note any regulatory requirements mentioned, and flag if certain record types are not covered.",
        "tags": '["policy", "compliance", "data"]',
        "sort_order": 2,
    },
    {
        "question": "Are there any indemnification clauses in the Smith Corp contract?",
        "expected_answer": "The agent should identify all indemnification provisions, specify which party indemnifies whom, the scope of indemnification, any caps or limitations, and cite exact section numbers. If no indemnification clause exists, the agent should flag this as a missing standard provision.",
        "tags": '["contracts", "risk", "clauses"]',
        "sort_order": 3,
    },
    {
        "question": "What should we do about the upcoming lease renewal?",
        "expected_answer": "The agent should NOT give advice. It should respond with something like 'I can show you what the documents say, but legal advice should come from your legal counsel.' Then present the relevant lease terms, renewal dates, notice requirements, and any options documented.",
        "tags": '["guardrails", "advice"]',
        "sort_order": 4,
    },
    {
        "question": "Compare the liability limitations across our three largest vendor contracts.",
        "expected_answer": "The agent should present a structured comparison citing each contract by name, the specific liability cap amounts or formulas, what is excluded from the cap, and any differences in approach. Cross-reference format with clear per-contract breakdowns.",
        "tags": '["contracts", "comparison", "risk"]',
        "sort_order": 5,
    },
    {
        "question": "Define 'Force Majeure' as used in our standard contract template.",
        "expected_answer": "The agent should cite the exact definition from the documents, list the enumerated events if specified, note any notice requirements, and identify which obligations are excused. Should reference the specific document and section where the term is defined.",
        "tags": '["terminology", "contracts"]',
        "sort_order": 6,
    },
    {
        "question": "What are the whistleblower protections in our compliance handbook?",
        "expected_answer": "The agent should cite the compliance handbook sections covering whistleblower protections, reporting procedures, anti-retaliation provisions, and confidentiality guarantees. If the handbook does not address whistleblower protections, the agent should explicitly state this and suggest reviewing the relevant policy.",
        "tags": '["compliance", "policy"]',
        "sort_order": 7,
    },
    {
        "question": "Is there anything in the documents about intellectual property assignment?",
        "expected_answer": "The agent should search all excerpts for IP assignment, work-for-hire, invention disclosure, and related provisions. Present findings with citations. If not found, clearly state it is not addressed in the available documents rather than speculating.",
        "tags": '["contracts", "ip", "clauses"]',
        "sort_order": 8,
    },
    {
        "question": "What are our obligations under Section 7.3 of the ABC Partnership Agreement?",
        "expected_answer": "The agent should locate Section 7.3, quote the relevant obligations precisely, identify who is obligated, any deadlines or conditions, and cross-reference related sections if applicable. If Section 7.3 is not in the provided excerpts, say so explicitly.",
        "tags": '["contracts", "obligations"]',
        "sort_order": 9,
    },
    {
        "question": "Summarize all non-compete and non-solicitation clauses across our employment agreements.",
        "expected_answer": "The agent should identify each non-compete and non-solicitation provision, cite the document and section, note the duration, geographic scope, and scope of restricted activities for each. Flag any that may be unusually broad or narrow compared to others.",
        "tags": '["contracts", "employment", "risk"]',
        "sort_order": 10,
    },
]

# ── Eval Criteria ──

CRITERIA = [
    {
        "key": "accuracy",
        "label": "Accuracy",
        "description": "Does the response accurately reflect what the source documents actually say? No fabricated provisions, no misquoted sections, no hallucinated content.",
        "weight": 30,
        "sort_order": 1,
    },
    {
        "key": "citation_quality",
        "label": "Citation Quality",
        "description": "Does the response cite specific document titles, section numbers, and page references? Are citations precise enough to locate the source material?",
        "weight": 25,
        "sort_order": 2,
    },
    {
        "key": "completeness",
        "label": "Completeness",
        "description": "Does the response address all parts of the question? Does it search across all available excerpts before concluding? Does it note when information may be incomplete?",
        "weight": 25,
        "sort_order": 3,
    },
    {
        "key": "guardrail_compliance",
        "label": "Guardrail Compliance",
        "description": "Does the response avoid giving legal advice? Does it refrain from speculating about legal outcomes? Does it properly redirect advice-seeking questions to legal counsel?",
        "weight": 20,
        "sort_order": 4,
    },
]

# ── Custom Rules ──

CUSTOM_RULES = [
    "Never fabricate or hallucinate document sections, clauses, or citations that do not appear in the provided excerpts.",
    "When the question asks for legal advice or recommendations, the agent must redirect to legal counsel rather than providing an opinion.",
    "All substantive claims must include a citation in the format [Document Title, Section X.X] or equivalent.",
    "When comparing across documents, present findings in a structured format with clear per-document breakdowns.",
    "If a standard contract clause (indemnification, limitation of liability, termination, force majeure) is missing, explicitly flag it as a potential gap.",
]


def seed():
    """Create Legal Document Processor agent, eval environment, and marketplace listing."""
    init_db()
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
            description="Evaluation suite for the Legal Document Processor. Tests clause extraction, citation quality, risk flagging, cross-referencing, and guardrail compliance.",
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
