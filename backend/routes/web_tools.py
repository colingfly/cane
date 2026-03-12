"""
routes/web_tools.py -- Internal web tool endpoints for agents.

Provides search and scrape capabilities that agent webhook tools
can call reliably without external API keys.
"""
import urllib.request
import urllib.parse
import urllib.error
import re
from html import unescape

from fastapi import APIRouter, Query
from fastapi.responses import PlainTextResponse

router = APIRouter(prefix="/api/tools", tags=["web-tools"])


def _parse_ddg_html(html: str) -> list[dict]:
    """Parse DuckDuckGo HTML lite search results."""
    results = []

    # Split by result divs
    result_blocks = re.split(r'<div class="result\b', html)

    for block in result_blocks[1:]:  # Skip first (before any result)
        # Extract URL from result link
        url_match = re.search(r'href="([^"]*uddg=[^"]*)"', block)
        if not url_match:
            url_match = re.search(r'class="result__a"[^>]*href="([^"]*)"', block)
        if not url_match:
            url_match = re.search(r'href="(https?://[^"]*)"', block)

        # Extract title
        title_match = re.search(r'class="result__a"[^>]*>(.*?)</a>', block, re.DOTALL)

        # Extract snippet
        snippet_match = re.search(r'class="result__snippet"[^>]*>(.*?)</a>', block, re.DOTALL)
        if not snippet_match:
            snippet_match = re.search(r'class="result__snippet"[^>]*>(.*?)</(?:div|span)', block, re.DOTALL)

        if url_match and title_match:
            href = url_match.group(1)
            title = re.sub(r"<[^>]+>", "", title_match.group(1)).strip()
            title = unescape(title)

            snippet = ""
            if snippet_match:
                snippet = re.sub(r"<[^>]+>", "", snippet_match.group(1)).strip()
                snippet = unescape(snippet)

            # Extract actual URL from DDG redirect
            if "uddg=" in href:
                actual_url = urllib.parse.unquote(href.split("uddg=")[1].split("&")[0])
            else:
                actual_url = href

            # Skip DDG internal links
            if actual_url.startswith("http"):
                results.append({
                    "title": title,
                    "url": actual_url,
                    "snippet": snippet,
                })

    return results


@router.get("/search")
def web_search(q: str = Query(..., description="Search query")):
    """Search the web via DuckDuckGo and return results as plain text."""
    try:
        encoded_q = urllib.parse.quote_plus(q)
        url = f"https://html.duckduckgo.com/html/?q={encoded_q}"
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        })

        with urllib.request.urlopen(req, timeout=15) as resp:
            html = resp.read().decode("utf-8", errors="replace")

        results = _parse_ddg_html(html)

        if not results:
            # Fallback: try a simpler regex for any links with snippets
            links = re.findall(r'href="(https?://(?!duckduckgo)[^"]+)"[^>]*>([^<]+)</a>', html)
            for href, text in links[:8]:
                if len(text.strip()) > 10 and "duckduckgo" not in href:
                    results.append({
                        "title": unescape(text.strip()),
                        "url": href,
                        "snippet": "",
                    })

        if not results:
            return PlainTextResponse(f"No results found for: {q}\n\nDebug: HTML length={len(html)}, first 500 chars:\n{html[:500]}")

        lines = []
        for i, r in enumerate(results[:8], 1):
            lines.append(f"{i}. {r['title']}")
            lines.append(f"   URL: {r['url']}")
            if r['snippet']:
                lines.append(f"   {r['snippet']}")
            lines.append("")

        output = f"Search results for: {q}\n\n" + "\n".join(lines)
        return PlainTextResponse(output)

    except Exception as e:
        import traceback
        return PlainTextResponse(f"Search error: {str(e)}\n{traceback.format_exc()}", status_code=500)


@router.get("/scrape")
def web_scrape(url: str = Query(..., description="URL to scrape")):
    """Fetch and extract text content from a URL using Jina Reader, with direct fallback."""
    # Try Jina Reader first
    try:
        jina_url = f"https://r.jina.ai/{url}"
        req = urllib.request.Request(jina_url, headers={
            "Accept": "text/plain",
            "User-Agent": "Mozilla/5.0 (compatible; CaneBot/1.0)",
        })

        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read().decode("utf-8", errors="replace")[:12000]

        return PlainTextResponse(body)

    except Exception:
        pass

    # Fallback: direct fetch with HTML stripping
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        })
        with urllib.request.urlopen(req, timeout=20) as resp:
            html = resp.read().decode("utf-8", errors="replace")[:50000]

        # Strip scripts, styles, nav, footer
        text = re.sub(r"<script[^>]*>.*?</script>", "", html, flags=re.DOTALL)
        text = re.sub(r"<style[^>]*>.*?</style>", "", text, flags=re.DOTALL)
        text = re.sub(r"<nav[^>]*>.*?</nav>", "", text, flags=re.DOTALL)
        text = re.sub(r"<footer[^>]*>.*?</footer>", "", text, flags=re.DOTALL)
        text = re.sub(r"<header[^>]*>.*?</header>", "", text, flags=re.DOTALL)

        # Convert common block elements to newlines
        text = re.sub(r"<(?:p|div|br|h[1-6]|li)[^>]*>", "\n", text)
        text = re.sub(r"<[^>]+>", " ", text)
        text = unescape(text)
        text = re.sub(r"[ \t]+", " ", text)
        text = re.sub(r"\n\s*\n+", "\n\n", text)
        text = text.strip()

        if len(text) < 100:
            return PlainTextResponse(f"Scrape returned very little content from {url}", status_code=500)

        return PlainTextResponse(text[:10000])

    except Exception as e:
        return PlainTextResponse(f"Scrape error for {url}: {str(e)}", status_code=500)
