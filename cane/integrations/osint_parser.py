"""
services/osint_parser.py -- Parse OSINT agent output into structured briefings.

After each scheduled OSINT agent run, this parser extracts:
- Title, severity, briefing type
- Entities (CVE IDs, IPs, domains, org names)
- Source URLs

Creates an OsintBriefing row in the database.
"""
import re
import json


def create_briefing_from_run(run, workspace_id, tenant_id, db):
    """Parse a schedule run response and create an OsintBriefing record.

    Args:
        run: AgentScheduleRun with .id and .response
        workspace_id: agent workspace ID
        tenant_id: tenant ID
        db: SQLAlchemy session
    """
    from cane.integrations.osint_models import OsintBriefing

    response = run.response or ""
    if not response.strip():
        return None

    title = _extract_title(response)
    severity = _extract_severity(response)
    briefing_type = _extract_type(response)
    entities = _extract_entities(response)
    sources = _extract_sources(response)

    briefing = OsintBriefing(
        workspace_id=workspace_id,
        tenant_id=tenant_id,
        schedule_run_id=run.id,
        title=title,
        severity=severity,
        briefing_type=briefing_type,
        content=response,
        sources_json=json.dumps(sources),
        entities_json=json.dumps(entities),
        alert_sent=bool(getattr(run, "condition_met", False)),
        alert_channel="webhook" if getattr(run, "condition_met", False) else None,
    )
    db.add(briefing)
    db.commit()
    return briefing


def _extract_title(text: str) -> str:
    """Extract briefing title from structured output."""
    # Try: ## BRIEFING: Title
    m = re.search(r"##\s*BRIEFING:\s*(.+)", text)
    if m:
        return m.group(1).strip()[:500]

    # Try: # Title
    m = re.search(r"#\s+(.+)", text)
    if m:
        return m.group(1).strip()[:500]

    # Fallback: first non-empty line
    for line in text.split("\n"):
        line = line.strip()
        if line and not line.startswith("*"):
            return line[:500]

    return "OSINT Briefing"


def _extract_severity(text: str) -> str:
    """Extract severity level from structured output."""
    # Try: **Severity:** CRITICAL
    m = re.search(r"\*\*Severity:?\*\*\s*(\w+)", text, re.IGNORECASE)
    if m:
        sev = m.group(1).lower()
        if sev in ("critical", "high", "medium", "low", "info"):
            return sev

    # Keyword scanning as fallback
    text_lower = text.lower()
    if any(kw in text_lower for kw in ["active exploitation", "zero-day", "0-day", "critical vulnerability"]):
        return "critical"
    if any(kw in text_lower for kw in ["public exploit", "major breach", "ransomware attack"]):
        return "high"
    if any(kw in text_lower for kw in ["emerging threat", "new vulnerability", "suspicious activity"]):
        return "medium"
    if any(kw in text_lower for kw in ["notable trend", "patch released", "advisory"]):
        return "low"

    return "info"


def _extract_type(text: str) -> str:
    """Extract briefing type from structured output."""
    # Try: **Type:** threat
    m = re.search(r"\*\*Type:?\*\*\s*(\w+)", text, re.IGNORECASE)
    if m:
        t = m.group(1).lower()
        if t in ("news", "threat", "social", "combined"):
            return t

    # Infer from content
    has_cve = bool(re.search(r"CVE-\d{4}-\d+", text))
    has_news = bool(re.search(r"(?:NEWS|article|reported|published)", text, re.IGNORECASE))
    has_social = bool(re.search(r"(?:reddit|r/|twitter|post)", text, re.IGNORECASE))

    if has_cve and has_news:
        return "combined"
    if has_cve:
        return "threat"
    if has_social:
        return "social"
    if has_news:
        return "news"

    return "combined"


def _extract_entities(text: str) -> list[str]:
    """Extract named entities from text: CVE IDs, IPs, domains."""
    entities = set()

    # CVE IDs
    for m in re.finditer(r"CVE-\d{4}-\d{4,}", text):
        entities.add(m.group(0))

    # IPv4 addresses
    for m in re.finditer(r"\b(?:\d{1,3}\.){3}\d{1,3}\b", text):
        ip = m.group(0)
        # Skip common non-routable
        if not ip.startswith(("0.", "127.", "255.")):
            entities.add(ip)

    # Domain names (simple heuristic)
    for m in re.finditer(r"\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|net|org|io|dev|gov|edu|info|biz|co)\b", text, re.IGNORECASE):
        domain = m.group(0).lower()
        # Skip common non-entity domains
        if domain not in ("github.com", "reddit.com", "google.com", "example.com"):
            entities.add(domain)

    return sorted(entities)[:50]


def _extract_sources(text: str) -> list[str]:
    """Extract source URLs from text."""
    urls = set()
    for m in re.finditer(r"https?://[^\s\)\"'<>]+", text):
        url = m.group(0).rstrip(".,;:)")
        urls.add(url)
    return sorted(urls)[:30]
