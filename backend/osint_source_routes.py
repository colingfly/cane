"""
osint_source_routes.py -- OSINT source proxy endpoints.

Thin API proxies that normalize external OSINT data sources into
clean plain text for Claude to analyze. Each endpoint fetches from
an external API, parses the response, and returns truncated text.

15-minute in-memory cache to avoid rate limits.
"""
import os
import json
import time
import urllib.request
import urllib.parse
import urllib.error
import re
import xml.etree.ElementTree as ET
from html import unescape

from fastapi import APIRouter, Query
from fastapi.responses import PlainTextResponse

router = APIRouter(prefix="/api/osint-sources", tags=["osint-sources"])

# Simple in-memory cache: { cache_key: (timestamp, text_result) }
_cache: dict[str, tuple[float, str]] = {}
_CACHE_TTL = 900  # 15 minutes


def _cached(key: str) -> str | None:
    if key in _cache:
        ts, val = _cache[key]
        if time.time() - ts < _CACHE_TTL:
            return val
        del _cache[key]
    return None


def _set_cache(key: str, val: str):
    _cache[key] = (time.time(), val)
    # Evict old entries if cache grows too large
    if len(_cache) > 200:
        cutoff = time.time() - _CACHE_TTL
        stale = [k for k, (ts, _) in _cache.items() if ts < cutoff]
        for k in stale:
            del _cache[k]


def _fetch(url: str, headers: dict | None = None, timeout: int = 15) -> str:
    """Fetch URL and return decoded text."""
    hdrs = {
        "User-Agent": "Mozilla/5.0 (compatible; CaneOSINT/1.0)",
        "Accept": "application/json",
    }
    if headers:
        hdrs.update(headers)
    req = urllib.request.Request(url, headers=hdrs)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", errors="replace")


def _strip_html(text: str) -> str:
    """Remove HTML tags and decode entities."""
    text = re.sub(r"<[^>]+>", "", text)
    return unescape(text).strip()


def _truncate(text: str, max_len: int = 200) -> str:
    if len(text) <= max_len:
        return text
    return text[:max_len].rsplit(" ", 1)[0] + "..."


# ---------------------------------------------------------------------------
#  NEWS (NewsAPI)
# ---------------------------------------------------------------------------

@router.get("/news")
def fetch_news(
    query: str = Query(..., description="Search keywords"),
    hours: int = Query(24, description="Look back N hours"),
):
    """Fetch recent news articles from NewsAPI."""
    api_key = os.getenv("NEWSAPI_KEY", "")
    if not api_key:
        return PlainTextResponse("NewsAPI key not configured. Set NEWSAPI_KEY environment variable.", status_code=500)

    cache_key = f"news:{query}:{hours}"
    cached = _cached(cache_key)
    if cached:
        return PlainTextResponse(cached)

    try:
        from datetime import datetime, timedelta
        since = (datetime.utcnow() - timedelta(hours=hours)).strftime("%Y-%m-%dT%H:%M:%S")
        params = urllib.parse.urlencode({
            "q": query,
            "from": since,
            "sortBy": "publishedAt",
            "pageSize": 15,
            "apiKey": api_key,
        })
        url = f"https://newsapi.org/v2/everything?{params}"
        data = json.loads(_fetch(url))

        articles = data.get("articles", [])
        if not articles:
            result = f"No news articles found for: {query} (last {hours}h)"
            _set_cache(cache_key, result)
            return PlainTextResponse(result)

        lines = [f"NEWS RESULTS for '{query}' (last {hours}h) -- {len(articles)} articles\n"]
        for i, a in enumerate(articles[:15], 1):
            title = a.get("title", "Untitled") or "Untitled"
            source = a.get("source", {}).get("name", "Unknown")
            published = a.get("publishedAt", "")[:16].replace("T", " ")
            desc = _truncate(_strip_html(a.get("description", "") or ""), 200)
            url_str = a.get("url", "")
            lines.append(f"{i}. [{source}] {title}")
            lines.append(f"   Published: {published}")
            if desc:
                lines.append(f"   {desc}")
            if url_str:
                lines.append(f"   URL: {url_str}")
            lines.append("")

        result = "\n".join(lines)
        _set_cache(cache_key, result)
        return PlainTextResponse(result)

    except Exception as e:
        return PlainTextResponse(f"NewsAPI error: {str(e)}", status_code=500)


# ---------------------------------------------------------------------------
#  REDDIT (RSS feed -- works from cloud IPs unlike JSON API)
# ---------------------------------------------------------------------------

@router.get("/reddit")
def fetch_reddit(
    subreddit: str = Query("cybersecurity", description="Subreddit name"),
    limit: int = Query(10, description="Number of posts"),
):
    """Fetch top recent posts from a subreddit via RSS."""
    cache_key = f"reddit:{subreddit}:{limit}"
    cached = _cached(cache_key)
    if cached:
        return PlainTextResponse(cached)

    try:
        url = f"https://www.reddit.com/r/{subreddit}/hot.rss?limit={min(limit, 25)}"
        raw = _fetch(url, headers={
            "User-Agent": "python:CaneOSINT:v1.0 (OSINT monitoring)",
        })

        root = ET.fromstring(raw)
        ns = {"atom": "http://www.w3.org/2005/Atom"}
        entries = root.findall("atom:entry", ns)

        if not entries:
            result = f"No posts found in r/{subreddit}"
            _set_cache(cache_key, result)
            return PlainTextResponse(result)

        lines = [f"REDDIT r/{subreddit} -- top {len(entries[:limit])} posts\n"]
        for i, entry in enumerate(entries[:limit], 1):
            title = (entry.findtext("atom:title", "", ns) or "").strip()
            link_el = entry.find("atom:link", ns)
            link = link_el.get("href", "") if link_el is not None else ""
            updated = (entry.findtext("atom:updated", "", ns) or "")[:16].replace("T", " ")
            content = entry.findtext("atom:content", "", ns) or ""
            desc = _truncate(_strip_html(content), 200)
            author = (entry.findtext("atom:author/atom:name", "", ns) or "").strip()

            lines.append(f"{i}. {title}")
            if author:
                lines.append(f"   Author: {author} | Updated: {updated}")
            else:
                lines.append(f"   Updated: {updated}")
            if desc:
                lines.append(f"   {desc}")
            if link:
                lines.append(f"   URL: {link}")
            lines.append("")

        result = "\n".join(lines)
        _set_cache(cache_key, result)
        return PlainTextResponse(result)

    except Exception as e:
        return PlainTextResponse(f"Reddit error: {str(e)}", status_code=500)


# ---------------------------------------------------------------------------
#  CVE / NVD (National Vulnerability Database)
# ---------------------------------------------------------------------------

@router.get("/cve")
def fetch_cve(
    keyword: str = Query(..., description="Search keyword (product, vendor, CVE ID)"),
    days: int = Query(7, description="Look back N days"),
):
    """Fetch recent CVEs from NVD."""
    cache_key = f"cve:{keyword}:{days}"
    cached = _cached(cache_key)
    if cached:
        return PlainTextResponse(cached)

    try:
        from datetime import datetime, timedelta
        end = datetime.utcnow()
        start = end - timedelta(days=days)
        start_str = start.strftime("%Y-%m-%dT%H:%M:%S.000")
        end_str = end.strftime("%Y-%m-%dT%H:%M:%S.000")

        params = urllib.parse.urlencode({
            "keywordSearch": keyword,
            "pubStartDate": start_str,
            "pubEndDate": end_str,
            "resultsPerPage": 15,
        })
        url = f"https://services.nvd.nist.gov/rest/json/cves/2.0?{params}"

        headers = {}
        nvd_key = os.getenv("NVD_API_KEY", "")
        if nvd_key:
            headers["apiKey"] = nvd_key

        raw = _fetch(url, headers=headers, timeout=20)
        data = json.loads(raw)

        vulns = data.get("vulnerabilities", [])
        if not vulns:
            result = f"No CVEs found for '{keyword}' in the last {days} days"
            _set_cache(cache_key, result)
            return PlainTextResponse(result)

        lines = [f"CVE RESULTS for '{keyword}' (last {days} days) -- {len(vulns)} vulnerabilities\n"]
        for i, v in enumerate(vulns[:15], 1):
            cve = v.get("cve", {})
            cve_id = cve.get("id", "Unknown")
            published = cve.get("published", "")[:10]

            # Get description
            descs = cve.get("descriptions", [])
            desc = ""
            for d in descs:
                if d.get("lang") == "en":
                    desc = _truncate(d.get("value", ""), 200)
                    break

            # Get CVSS score
            metrics = cve.get("metrics", {})
            score = "N/A"
            severity = "N/A"
            for metric_key in ["cvssMetricV31", "cvssMetricV30", "cvssMetricV2"]:
                metric_list = metrics.get(metric_key, [])
                if metric_list:
                    cvss = metric_list[0].get("cvssData", {})
                    score = cvss.get("baseScore", "N/A")
                    severity = cvss.get("baseSeverity", "N/A")
                    break

            lines.append(f"{i}. {cve_id} (CVSS: {score} / {severity})")
            lines.append(f"   Published: {published}")
            if desc:
                lines.append(f"   {desc}")
            lines.append("")

        result = "\n".join(lines)
        _set_cache(cache_key, result)
        return PlainTextResponse(result)

    except Exception as e:
        return PlainTextResponse(f"NVD API error: {str(e)}", status_code=500)


# ---------------------------------------------------------------------------
#  THREAT FEEDS (abuse.ch, AlienVault OTX)
# ---------------------------------------------------------------------------

@router.get("/threatfeed")
def fetch_threatfeed(
    feed: str = Query("abusech", description="Feed: abusech, otx"),
):
    """Fetch recent threat intelligence indicators."""
    cache_key = f"threatfeed:{feed}"
    cached = _cached(cache_key)
    if cached:
        return PlainTextResponse(cached)

    try:
        if feed == "abusech":
            result = _fetch_abusech()
        elif feed == "otx":
            result = _fetch_otx()
        else:
            result = f"Unknown feed: {feed}. Supported: abusech, otx"

        _set_cache(cache_key, result)
        return PlainTextResponse(result)

    except Exception as e:
        return PlainTextResponse(f"Threat feed error ({feed}): {str(e)}", status_code=500)


def _fetch_abusech() -> str:
    """Fetch recent malware URLs from abuse.ch URLhaus CSV feed."""
    # Use the CSV export which doesn't require auth
    url = "https://urlhaus.abuse.ch/downloads/csv_recent/"
    raw = _fetch(url, headers={"User-Agent": "CaneOSINT/1.0"}, timeout=20)

    lines_out = ["ABUSE.CH URLHAUS -- recent malicious URLs\n"]
    count = 0
    for line in raw.split("\n"):
        if line.startswith("#") or not line.strip():
            continue
        parts = line.strip().split('","')
        if len(parts) < 6:
            continue
        # CSV: id, date_added, url, url_status, last_online, threat, tags, ...
        try:
            date_added = parts[1].strip('"') if len(parts) > 1 else ""
            mal_url = parts[2].strip('"') if len(parts) > 2 else ""
            status = parts[3].strip('"') if len(parts) > 3 else ""
            threat = parts[5].strip('"') if len(parts) > 5 else ""
            tags = parts[6].strip('"') if len(parts) > 6 else ""
        except (IndexError, ValueError):
            continue

        count += 1
        lines_out.append(f"{count}. {mal_url}")
        lines_out.append(f"   Threat: {threat} | Status: {status} | Added: {date_added[:16]}")
        if tags:
            lines_out.append(f"   Tags: {tags}")
        lines_out.append("")
        if count >= 15:
            break

    if count == 0:
        return "No recent malware URLs from abuse.ch URLhaus"

    return "\n".join(lines_out)


def _fetch_otx() -> str:
    """Fetch recent pulses from AlienVault OTX."""
    api_key = os.getenv("OTX_API_KEY", "")
    if not api_key:
        return "AlienVault OTX API key not configured. Set OTX_API_KEY environment variable."

    url = "https://otx.alienvault.com/api/v1/pulses/subscribed?limit=10&page=1"
    raw = _fetch(url, headers={"X-OTX-API-KEY": api_key}, timeout=15)
    data = json.loads(raw)

    pulses = data.get("results", [])
    if not pulses:
        return "No recent OTX pulses found"

    lines = ["ALIENVAULT OTX -- recent threat intelligence pulses\n"]
    for i, p in enumerate(pulses[:10], 1):
        name = p.get("name", "Untitled")
        created = p.get("created", "")[:16].replace("T", " ")
        desc = _truncate(p.get("description", "") or "", 200)
        tags = ", ".join((p.get("tags", []) or [])[:5])
        ioc_count = len(p.get("indicators", []))
        lines.append(f"{i}. {name}")
        lines.append(f"   Created: {created} | Indicators: {ioc_count}")
        if desc:
            lines.append(f"   {desc}")
        if tags:
            lines.append(f"   Tags: {tags}")
        lines.append("")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
#  RSS FEED (generic)
# ---------------------------------------------------------------------------

@router.get("/rss")
def fetch_rss(
    url: str = Query(..., description="RSS feed URL"),
    limit: int = Query(10, description="Number of items"),
):
    """Fetch and parse an RSS/Atom feed."""
    cache_key = f"rss:{url}:{limit}"
    cached = _cached(cache_key)
    if cached:
        return PlainTextResponse(cached)

    try:
        raw = _fetch(url, timeout=15)
        root = ET.fromstring(raw)

        # Handle both RSS and Atom
        items = []
        ns = {"atom": "http://www.w3.org/2005/Atom"}

        # RSS 2.0
        for item in root.findall(".//item"):
            title = (item.findtext("title") or "").strip()
            link = (item.findtext("link") or "").strip()
            desc = _truncate(_strip_html(item.findtext("description") or ""), 200)
            pub_date = (item.findtext("pubDate") or "").strip()
            items.append({"title": title, "link": link, "desc": desc, "date": pub_date})

        # Atom
        if not items:
            for entry in root.findall(".//atom:entry", ns):
                title = (entry.findtext("atom:title", "", ns) or "").strip()
                link_el = entry.find("atom:link", ns)
                link = link_el.get("href", "") if link_el is not None else ""
                desc = _truncate(_strip_html(entry.findtext("atom:summary", "", ns) or ""), 200)
                pub_date = (entry.findtext("atom:published", "", ns) or entry.findtext("atom:updated", "", ns) or "").strip()
                items.append({"title": title, "link": link, "desc": desc, "date": pub_date})

        if not items:
            result = f"No items found in RSS feed: {url}"
            _set_cache(cache_key, result)
            return PlainTextResponse(result)

        lines = [f"RSS FEED -- {url}\n"]
        for i, item in enumerate(items[:limit], 1):
            lines.append(f"{i}. {item['title']}")
            if item["date"]:
                lines.append(f"   Date: {item['date']}")
            if item["desc"]:
                lines.append(f"   {item['desc']}")
            if item["link"]:
                lines.append(f"   URL: {item['link']}")
            lines.append("")

        result = "\n".join(lines)
        _set_cache(cache_key, result)
        return PlainTextResponse(result)

    except ET.ParseError:
        return PlainTextResponse(f"Failed to parse RSS feed (invalid XML): {url}", status_code=500)
    except Exception as e:
        return PlainTextResponse(f"RSS feed error: {str(e)}", status_code=500)
