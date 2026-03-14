"""
osint_routes.py -- OSINT briefing API and agent deployment endpoint.

Provides:
- Briefing list/detail/stats for the intelligence feed
- Manual briefing generation trigger
- Deploy endpoint to create an OSINT agent from the setup wizard
"""
import json
import uuid
import threading
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import desc, func

from database import get_db, SessionLocal
from db_models import User, Workspace
from auth import get_current_user
from osint_models import OsintBriefing
from schedule_models import AgentSchedule
from tool_models import AgentTool

router = APIRouter(prefix="/api/osint", tags=["osint"])


def _uuid() -> str:
    return str(uuid.uuid4())


def _verify_osint_agent(agent_id: str, user: User, db: Session):
    """Verify OSINT agent exists and belongs to user's tenant."""
    ws = db.query(Workspace).filter(
        Workspace.id == agent_id,
        Workspace.tenant_id == user.tenant_id,
    ).first()
    if not ws:
        return None
    return ws


# ---- List briefings ----

@router.get("/{agent_id}/briefings")
def list_briefings(
    agent_id: str,
    severity: str = Query(None, description="Filter by severity"),
    briefing_type: str = Query(None, description="Filter by type"),
    limit: int = Query(50, le=100),
    offset: int = Query(0),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ws = _verify_osint_agent(agent_id, user, db)
    if not ws:
        return JSONResponse({"error": "Agent not found"}, 404)

    q = db.query(OsintBriefing).filter(
        OsintBriefing.workspace_id == agent_id,
        OsintBriefing.tenant_id == user.tenant_id,
    )
    if severity:
        q = q.filter(OsintBriefing.severity == severity)
    if briefing_type:
        q = q.filter(OsintBriefing.briefing_type == briefing_type)

    total = q.count()
    briefings = q.order_by(desc(OsintBriefing.created_at)).offset(offset).limit(limit).all()

    return {
        "total": total,
        "briefings": [
            {
                "id": b.id,
                "title": b.title,
                "severity": b.severity,
                "briefing_type": b.briefing_type,
                "content": b.content[:500] if len(b.content or "") > 500 else b.content,
                "sources": json.loads(b.sources_json or "[]"),
                "entities": json.loads(b.entities_json or "[]"),
                "alert_sent": b.alert_sent,
                "alert_channel": b.alert_channel,
                "created_at": b.created_at.isoformat() if b.created_at else None,
            }
            for b in briefings
        ],
    }


# ---- Briefing detail ----

@router.get("/{agent_id}/briefings/{briefing_id}")
def get_briefing(
    agent_id: str,
    briefing_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ws = _verify_osint_agent(agent_id, user, db)
    if not ws:
        return JSONResponse({"error": "Agent not found"}, 404)

    b = db.query(OsintBriefing).filter(
        OsintBriefing.id == briefing_id,
        OsintBriefing.workspace_id == agent_id,
        OsintBriefing.tenant_id == user.tenant_id,
    ).first()
    if not b:
        return JSONResponse({"error": "Briefing not found"}, 404)

    return {
        "id": b.id,
        "title": b.title,
        "severity": b.severity,
        "briefing_type": b.briefing_type,
        "content": b.content,
        "sources": json.loads(b.sources_json or "[]"),
        "entities": json.loads(b.entities_json or "[]"),
        "alert_sent": b.alert_sent,
        "alert_channel": b.alert_channel,
        "schedule_run_id": b.schedule_run_id,
        "created_at": b.created_at.isoformat() if b.created_at else None,
    }


# ---- Stats ----

@router.get("/{agent_id}/stats")
def get_stats(
    agent_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ws = _verify_osint_agent(agent_id, user, db)
    if not ws:
        return JSONResponse({"error": "Agent not found"}, 404)

    base = db.query(OsintBriefing).filter(
        OsintBriefing.workspace_id == agent_id,
        OsintBriefing.tenant_id == user.tenant_id,
    )

    total = base.count()
    alerts_sent = base.filter(OsintBriefing.alert_sent == True).count()

    severity_counts = {}
    for sev in ["critical", "high", "medium", "low", "info"]:
        severity_counts[sev] = base.filter(OsintBriefing.severity == sev).count()

    latest = base.order_by(desc(OsintBriefing.created_at)).first()

    return {
        "total_briefings": total,
        "alerts_sent": alerts_sent,
        "severity_counts": severity_counts,
        "last_briefing_at": latest.created_at.isoformat() if latest and latest.created_at else None,
    }


# ---- Manual trigger ----

@router.post("/{agent_id}/briefings/generate")
def generate_briefing(
    agent_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ws = _verify_osint_agent(agent_id, user, db)
    if not ws:
        return JSONResponse({"error": "Agent not found"}, 404)

    # Find the OSINT schedule for this agent
    schedule = db.query(AgentSchedule).filter(
        AgentSchedule.workspace_id == agent_id,
        AgentSchedule.tenant_id == user.tenant_id,
    ).first()
    if not schedule:
        return JSONResponse({"error": "No schedule found for this agent. Set up a schedule first."}, 400)

    # Trigger in background thread
    from services.schedule_runner import run_schedule
    thread = threading.Thread(
        target=run_schedule,
        args=(schedule.id,),
        daemon=True,
    )
    thread.start()

    return {"status": "triggered", "schedule_id": schedule.id}


# ---- Deploy OSINT agent from setup wizard ----

@router.post("/deploy")
def deploy_osint_agent(
    body: dict,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a fully configured OSINT agent from the setup wizard.

    Body:
        sources: list of enabled sources (news, reddit, cve, threatfeed, rss)
        keywords: list of monitoring keywords
        subreddits: list of subreddits to monitor
        rss_urls: list of RSS feed URLs
        alert_webhook: Slack/Discord webhook URL
        alert_severity: minimum severity for alerts (high, medium, etc.)
        interval_minutes: schedule interval (default 30)
        name: optional agent name
    """
    sources = body.get("sources", ["news", "reddit", "cve", "threatfeed"])
    keywords = body.get("keywords", ["cybersecurity"])
    subreddits = body.get("subreddits", ["cybersecurity", "netsec"])
    rss_urls = body.get("rss_urls", [])
    alert_webhook = body.get("alert_webhook", "")
    alert_severity = body.get("alert_severity", "high")
    interval_minutes = body.get("interval_minutes", 30)
    agent_name = body.get("name", "OSINT Intelligence Agent")

    # Build the monitoring prompt
    keyword_str = ", ".join(keywords) if keywords else "cybersecurity, threats"
    subreddit_str = ", ".join(subreddits) if subreddits else "cybersecurity"

    schedule_prompt = f"""Run your OSINT monitoring cycle now. Focus on these topics: {keyword_str}.

Check all available sources for the latest intelligence. Cross-reference findings across sources.
Generate a structured briefing with severity assessment."""

    # OSINT system prompt
    system_prompt = _build_system_prompt(keywords, subreddits, rss_urls)

    # 1. Create workspace
    ws = Workspace(
        tenant_id=user.tenant_id,
        name=agent_name,
        description="Autonomous OSINT intelligence agent. Monitors news, social media, and threat intel sources. Detects anomalies and generates intelligence briefings.",
        agent_type="osint",
        agent_icon="OI",
        agent_description="Autonomous OSINT intelligence agent that monitors sources, detects anomalies, and generates intelligence briefings.",
        system_prompt=system_prompt,
        show_on_homepage=True,
        is_default=False,
        tool_chaining_enabled=True,
    )
    db.add(ws)
    db.flush()

    # 2. Create webhook tools for enabled sources
    base_url = "/api/osint-sources"
    tools_created = 0

    if "news" in sources:
        db.add(AgentTool(
            id=_uuid(), workspace_id=ws.id, tenant_id=user.tenant_id,
            name="fetch_news", description=f"Fetch recent news articles about monitored topics. Use for gathering current events and breaking news. Keywords: {keyword_str}",
            tool_type="api_get", url=f"{base_url}/news?query={urllib_quote(keyword_str)}&hours=24",
            method="GET", headers="{}", payload_template="",
            auth_type="none", auth_value="",
            parameters=json.dumps([
                {"name": "query", "type": "string", "description": "Search keywords", "required": False},
                {"name": "hours", "type": "number", "description": "Look back N hours", "required": False},
            ]),
            is_enabled=True,
        ))
        tools_created += 1

    if "reddit" in sources:
        db.add(AgentTool(
            id=_uuid(), workspace_id=ws.id, tenant_id=user.tenant_id,
            name="fetch_reddit", description=f"Fetch top posts from security subreddits. Use for community intelligence and emerging discussions. Subreddits: {subreddit_str}",
            tool_type="api_get", url=f"{base_url}/reddit?subreddit={subreddits[0] if subreddits else 'cybersecurity'}&limit=10",
            method="GET", headers="{}", payload_template="",
            auth_type="none", auth_value="",
            parameters=json.dumps([
                {"name": "subreddit", "type": "string", "description": "Subreddit name", "required": False},
                {"name": "limit", "type": "number", "description": "Number of posts", "required": False},
            ]),
            is_enabled=True,
        ))
        tools_created += 1

    if "cve" in sources:
        db.add(AgentTool(
            id=_uuid(), workspace_id=ws.id, tenant_id=user.tenant_id,
            name="fetch_cve", description=f"Fetch recent CVE vulnerability reports from NVD. Use for tracking new vulnerabilities affecting monitored technologies. Keywords: {keyword_str}",
            tool_type="api_get", url=f"{base_url}/cve?keyword={urllib_quote(keywords[0] if keywords else 'cybersecurity')}&days=7",
            method="GET", headers="{}", payload_template="",
            auth_type="none", auth_value="",
            parameters=json.dumps([
                {"name": "keyword", "type": "string", "description": "Product or vendor keyword", "required": False},
                {"name": "days", "type": "number", "description": "Look back N days", "required": False},
            ]),
            is_enabled=True,
        ))
        tools_created += 1

    if "threatfeed" in sources:
        db.add(AgentTool(
            id=_uuid(), workspace_id=ws.id, tenant_id=user.tenant_id,
            name="fetch_threatfeed", description="Fetch latest threat intelligence indicators from abuse.ch and AlienVault OTX. Use for malware URLs, IOCs, and threat actor activity.",
            tool_type="api_get", url=f"{base_url}/threatfeed?feed=abusech",
            method="GET", headers="{}", payload_template="",
            auth_type="none", auth_value="",
            parameters=json.dumps([
                {"name": "feed", "type": "string", "description": "Feed: abusech or otx", "required": False},
            ]),
            is_enabled=True,
        ))
        tools_created += 1

    for rss_url in rss_urls[:3]:
        db.add(AgentTool(
            id=_uuid(), workspace_id=ws.id, tenant_id=user.tenant_id,
            name=f"fetch_rss_{tools_created}", description=f"Fetch RSS feed: {rss_url[:80]}",
            tool_type="api_get", url=f"{base_url}/rss?url={urllib_quote(rss_url)}&limit=10",
            method="GET", headers="{}", payload_template="",
            auth_type="none", auth_value="",
            parameters=json.dumps([
                {"name": "url", "type": "string", "description": "RSS feed URL", "required": False},
            ]),
            is_enabled=True,
        ))
        tools_created += 1

    # 3. Create schedule
    condition_prompt = f"Does this briefing contain any findings rated {alert_severity.upper()} severity or above? Answer YES or NO."
    schedule = AgentSchedule(
        id=_uuid(),
        workspace_id=ws.id,
        tenant_id=user.tenant_id,
        prompt=schedule_prompt,
        schedule_type="interval",
        interval_minutes=max(interval_minutes, 15),
        is_enabled=True,
        next_run_at=datetime.utcnow(),
        condition_enabled=bool(alert_webhook),
        condition_prompt=condition_prompt if alert_webhook else None,
        condition_action="send_webhook" if alert_webhook else "store_only",
        condition_webhook_url=alert_webhook or None,
    )
    db.add(schedule)

    db.commit()

    return {
        "agent_id": ws.id,
        "name": ws.name,
        "tools_created": tools_created,
        "schedule_id": schedule.id,
        "interval_minutes": schedule.interval_minutes,
        "alert_configured": bool(alert_webhook),
    }


def urllib_quote(s: str) -> str:
    """URL-encode a string."""
    import urllib.parse
    return urllib.parse.quote(s, safe="")


def _build_system_prompt(keywords: list, subreddits: list, rss_urls: list) -> str:
    keyword_str = ", ".join(keywords) if keywords else "cybersecurity, threats"
    subreddit_str = ", ".join(f"r/{s}" for s in subreddits) if subreddits else "r/cybersecurity"

    return f"""You are an autonomous OSINT (Open Source Intelligence) analyst agent. Your mission is to continuously monitor open sources, detect anomalies, and produce actionable intelligence briefings.

Monitoring Focus:
- Keywords: {keyword_str}
- Subreddits: {subreddit_str}
- RSS feeds: {len(rss_urls)} configured

Operating Procedure:
1. GATHER: Call your OSINT tools to collect fresh data from all available sources. Always call multiple tools per run to get comprehensive coverage.
2. CORRELATE: Cross-reference findings across sources. A CVE mentioned in NVD that is also being discussed on Reddit and covered in news articles is more significant than an isolated mention.
3. ASSESS: Rate the severity of each finding using this rubric:
   - CRITICAL: Active exploitation in the wild, zero-day vulnerability, major ongoing breach
   - HIGH: Public exploit available, significant data breach disclosed, ransomware campaign targeting sector
   - MEDIUM: New vulnerability with no known exploit, emerging threat pattern, suspicious campaign detected
   - LOW: Notable security trend, patch or advisory released, minor incident reported
   - INFO: Routine updates, general awareness items, no immediate action needed
4. SYNTHESIZE: Produce a structured briefing in the exact format below.

Output Format (ALWAYS follow this structure):

## BRIEFING: [Concise title summarizing the most significant finding]
**Severity:** [CRITICAL|HIGH|MEDIUM|LOW|INFO]
**Type:** [news|threat|social|combined]
**Sources:** [comma-separated list of sources consulted]
**Entities:** [CVE IDs, IP addresses, domain names, organization names found]

### Key Findings
- [Finding 1 with source attribution]
- [Finding 2 with source attribution]
- [Finding 3 with source attribution]

### Analysis
[2-3 paragraphs analyzing the findings, correlations between sources, and potential impact]

### Recommended Actions
1. [Action item with priority: IMMEDIATE/SHORT-TERM/MONITOR]
2. [Action item with priority]
3. [Action item with priority]

Rules:
- NEVER fabricate threat data, CVE numbers, or indicators of compromise
- If no significant findings, produce an INFO-level "All Clear" briefing
- Always attribute findings to their source
- Focus on actionable intelligence, not noise
- When multiple significant findings exist, lead with the highest severity item"""
