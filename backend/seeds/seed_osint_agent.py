"""
seeds/seed_osint_agent.py - Seed an OSINT Intelligence Agent and publish to marketplace.

Usage:
    cd backend && python seeds/seed_osint_agent.py

Creates:
    1. Workspace (agent) with OSINT system prompt and tool chaining
    2. 6 webhook tools pointing at OSINT source proxy endpoints
    3. Agent schedule (30-min interval with conditional Slack/Discord alerts)
    4. Marketplace listing
"""
import sys
import json
import uuid
from pathlib import Path
from datetime import datetime

_root = str(Path(__file__).resolve().parent.parent)
if _root not in sys.path:
    sys.path.insert(0, _root)

from database import init_db, SessionLocal
from db_models import User, Tenant, Workspace
from tool_models import AgentTool
from schedule_models import AgentSchedule
from marketplace_models import MarketplaceListing
import migrations


def _uuid():
    return str(uuid.uuid4())


AGENT_NAME = "OSINT Intelligence Agent"
AGENT_ICON = "OI"
AGENT_DESC = (
    "Autonomous OSINT intelligence agent. Continuously monitors news, social media, "
    "CVE databases, and threat intelligence feeds. Detects anomalies, generates "
    "intelligence briefings with severity ratings, and pushes alerts to Slack or Discord."
)

SYSTEM_PROMPT = """You are an autonomous OSINT (Open Source Intelligence) analyst agent. Your mission is to continuously monitor open sources, detect anomalies, and produce actionable intelligence briefings.

Monitoring Focus:
- Keywords: cybersecurity, data breach, ransomware, zero-day, APT
- Subreddits: r/cybersecurity, r/netsec, r/blueteamsec
- Threat feeds: abuse.ch, AlienVault OTX

Operating Procedure:
1. GATHER: Call your OSINT tools to collect fresh data. Always call multiple tools per run.
2. CORRELATE: Cross-reference findings across sources. A CVE mentioned in NVD that also appears on Reddit or in news is more significant.
3. ASSESS: Rate severity using this rubric:
   - CRITICAL: Active exploitation in the wild, zero-day, major ongoing breach
   - HIGH: Public exploit available, significant breach disclosed, ransomware campaign
   - MEDIUM: New vulnerability with no known exploit, emerging threat pattern
   - LOW: Notable security trend, patch or advisory released, minor incident
   - INFO: Routine updates, general awareness, no immediate action needed
4. SYNTHESIZE: Produce a structured briefing in the exact format below.

Output Format (ALWAYS follow this structure exactly):

## BRIEFING: [Concise title summarizing the most significant finding]
**Severity:** [CRITICAL|HIGH|MEDIUM|LOW|INFO]
**Type:** [news|threat|social|combined]

### Key Findings
- [Exact CVE ID or threat name]: [Description]. Source: [full URL from tool output]
- [Exact CVE ID or threat name]: [Description]. Source: [full URL from tool output]
- [Exact CVE ID or threat name]: [Description]. Source: [full URL from tool output]

### Indicators of Compromise
- CVE IDs: [list all exact CVE IDs from tool data, e.g. CVE-2026-30862, CVE-2026-23662]
- Malicious URLs: [list exact URLs from abuse.ch data]
- IP Addresses: [list exact IPs from tool data]
- Domains: [list exact domains from tool data]

### Analysis
[2-3 paragraphs analyzing the findings, correlations, and potential impact]

### Source URLs
- [Full URL 1 from tool output]
- [Full URL 2 from tool output]
- [Full URL 3 from tool output]

CRITICAL RULES:
- COPY exact data from tool results into your briefing. If the tool returned CVE-2026-30862, write CVE-2026-30862.
- COPY exact URLs from tool results. If the tool returned https://nvd.nist.gov/vuln/detail/CVE-2026-30862, include that exact URL.
- COPY exact malicious URLs from abuse.ch. If the tool returned https://example.com/malware, list it.
- NEVER fabricate CVE numbers, URLs, IPs, or any other data.
- NEVER write vague summaries like "multiple vulnerabilities found" -- list the specific ones.
- If a tool fails or returns no data, say so honestly. Do not invent data.
- If no significant findings, produce an INFO-level "All Clear" briefing.
- Lead with the highest severity item."""

SCHEDULE_PROMPT = """Run your OSINT monitoring cycle now. Focus on: cybersecurity, data breach, ransomware, zero-day, APT.

Check all available sources for the latest intelligence. Cross-reference findings across sources.
Generate a structured briefing with severity assessment."""

TOOLS = [
    {
        "name": "fetch_news",
        "description": "Fetch recent news articles about cybersecurity threats, breaches, and vulnerabilities. Use for gathering current events and breaking news.",
        "tool_type": "api_get",
        "url": "/api/osint-sources/news?query=cybersecurity+data+breach&hours=24",
    },
    {
        "name": "fetch_reddit",
        "description": "Fetch top posts from security subreddits (r/cybersecurity, r/netsec). Use for community intelligence, emerging discussions, and practitioner insights.",
        "tool_type": "api_get",
        "url": "/api/osint-sources/reddit?subreddit=cybersecurity&limit=10",
    },
    {
        "name": "fetch_reddit_netsec",
        "description": "Fetch top posts from r/netsec for technical security research, exploit disclosures, and vulnerability analysis.",
        "tool_type": "api_get",
        "url": "/api/osint-sources/reddit?subreddit=netsec&limit=10",
    },
    {
        "name": "fetch_cve",
        "description": "Fetch recent CVE vulnerability reports from the National Vulnerability Database. Use for tracking new vulnerabilities, CVSS scores, and affected software.",
        "tool_type": "api_get",
        "url": "/api/osint-sources/cve?keyword=critical&days=7",
    },
    {
        "name": "fetch_threatfeed_abusech",
        "description": "Fetch latest malicious URLs and malware indicators from abuse.ch URLhaus. Use for tracking active malware campaigns and malicious infrastructure.",
        "tool_type": "api_get",
        "url": "/api/osint-sources/threatfeed?feed=abusech",
    },
    {
        "name": "web_search",
        "description": "Search the web for additional context on emerging threats, incidents, or security news. Use when other sources mention something that needs more context.",
        "tool_type": "api_get",
        "url": "/api/tools/search?q=cybersecurity+threat",
    },
]


def seed():
    """Create OSINT Intelligence Agent with tools, schedule, and marketplace listing."""
    init_db()
    try:
        migrations.run_all()
    except Exception as e:
        print(f"[Seed] Migrations: {e}")

    # Ensure workspace columns exist
    from sqlalchemy import text, inspect as sa_inspect
    from database import engine
    try:
        insp = sa_inspect(engine)
        cols = {c["name"] for c in insp.get_columns("workspaces")}
        with engine.begin() as conn:
            if "tool_chaining_enabled" not in cols:
                conn.execute(text("ALTER TABLE workspaces ADD COLUMN tool_chaining_enabled TINYINT(1) DEFAULT 0"))
            if "orchestrator_mode" not in cols:
                conn.execute(text("ALTER TABLE workspaces ADD COLUMN orchestrator_mode TINYINT(1) DEFAULT 0"))
    except Exception as e:
        print(f"[Seed] Column check: {e}")

    db = SessionLocal()

    try:
        admin = db.query(User).filter(User.role == "admin").first()
        if not admin:
            print("[Seed] No admin user found. Run the app first to create one.")
            return

        # Check if already seeded
        existing = db.query(MarketplaceListing).filter(
            MarketplaceListing.name == AGENT_NAME,
            MarketplaceListing.publisher_tenant_id == admin.tenant_id,
        ).first()
        if existing:
            print(f"[Seed] OSINT agent already exists in marketplace (id={existing.id}). Skipping.")
            return

        # 1. Create workspace (agent)
        ws = Workspace(
            tenant_id=admin.tenant_id,
            name=AGENT_NAME,
            description=AGENT_DESC,
            agent_type="osint",
            agent_icon=AGENT_ICON,
            agent_description=AGENT_DESC,
            system_prompt=SYSTEM_PROMPT,
            show_on_homepage=True,
            is_default=False,
            tool_chaining_enabled=True,
        )
        db.add(ws)
        db.flush()
        print(f"[Seed] Created agent: {ws.name} (id={ws.id})")

        # 2. Create webhook tools
        for tool in TOOLS:
            db.add(AgentTool(
                id=_uuid(),
                workspace_id=ws.id,
                tenant_id=admin.tenant_id,
                name=tool["name"],
                description=tool["description"],
                tool_type=tool["tool_type"],
                url=tool["url"],
                method="GET",
                headers="{}",
                payload_template="",
                auth_type="none",
                auth_value="",
                parameters="[]",
                is_enabled=True,
                fire_and_forget=False,  # MUST be False so Claude sees the response data
            ))
        print(f"[Seed] Created {len(TOOLS)} OSINT tools")

        # 3. Create schedule
        schedule = AgentSchedule(
            id=_uuid(),
            workspace_id=ws.id,
            tenant_id=admin.tenant_id,
            prompt=SCHEDULE_PROMPT,
            schedule_type="interval",
            interval_minutes=30,
            is_enabled=True,
            next_run_at=datetime.utcnow(),
            condition_enabled=False,
            condition_prompt="Does this briefing contain any findings rated HIGH or CRITICAL severity? Answer YES or NO.",
            condition_action="store_only",
        )
        db.add(schedule)
        db.flush()
        print(f"[Seed] Created schedule: every 30 min (id={schedule.id})")

        # 4. Publish to marketplace
        publisher_name = admin.name or admin.email.split("@")[0]
        tools_snapshot = json.dumps([
            {"name": t["name"], "description": t["description"], "tool_type": t["tool_type"]}
            for t in TOOLS
        ])

        listing = MarketplaceListing(
            publisher_tenant_id=admin.tenant_id,
            publisher_user_id=admin.id,
            publisher_name=publisher_name,
            source_workspace_id=ws.id,
            name=AGENT_NAME,
            description=AGENT_DESC,
            icon=AGENT_ICON,
            system_prompt=SYSTEM_PROMPT,
            agent_type="osint",
            category="security",
            tags=json.dumps(["osint", "security", "threat-intel", "cve", "monitoring"]),
            pack_type="byod",
            included_documents="[]",
            document_count=0,
            overall_score=None,
            eval_snapshot=None,
            test_cases_snapshot=None,
            criteria_snapshot=None,
            custom_rules_snapshot=None,
            test_case_count=0,
            tools_snapshot=tools_snapshot,
            tool_count=len(TOOLS),
            status="active",
            is_featured=True,
        )
        db.add(listing)
        db.flush()
        print(f"[Seed] Published to marketplace: {listing.name} (id={listing.id})")

        db.commit()
        print(f"\n[Seed] Done. OSINT Intelligence Agent is live.")
        print(f"  Agent ID:    {ws.id}")
        print(f"  Schedule ID: {schedule.id}")
        print(f"  Listing ID:  {listing.id}")

    except Exception as e:
        db.rollback()
        print(f"[Seed] Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()


if __name__ == "__main__":
    seed()
