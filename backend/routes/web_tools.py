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


@router.get("/search")
def web_search(q: str = Query(..., description="Search query")):
    """Search the web via DuckDuckGo and return results as plain text."""
    try:
        encoded_q = urllib.parse.quote_plus(q)
        url = f"https://html.duckduckgo.com/html/?q={encoded_q}"
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0 (compatible; CaneBot/1.0)",
        })

        with urllib.request.urlopen(req, timeout=15) as resp:
            html = resp.read().decode("utf-8", errors="replace")

        # Parse results from DuckDuckGo HTML lite
        results = []
        # Match result blocks: title, URL, snippet
        pattern = r'<a rel="nofollow" class="result__a" href="([^"]*)"[^>]*>(.*?)</a>.*?<a class="result__snippet"[^>]*>(.*?)</a>'
        matches = re.findall(pattern, html, re.DOTALL)

        for href, title, snippet in matches[:8]:
            # Clean HTML tags from title and snippet
            clean_title = re.sub(r"<[^>]+>", "", title).strip()
            clean_snippet = re.sub(r"<[^>]+>", "", snippet).strip()
            clean_title = unescape(clean_title)
            clean_snippet = unescape(clean_snippet)

            # DuckDuckGo wraps URLs in a redirect, extract actual URL
            if "uddg=" in href:
                actual_url = urllib.parse.unquote(href.split("uddg=")[1].split("&")[0])
            else:
                actual_url = href

            results.append(f"Title: {clean_title}\nURL: {actual_url}\nSnippet: {clean_snippet}\n")

        if not results:
            return PlainTextResponse(f"No results found for: {q}")

        output = f"Search results for: {q}\n\n" + "\n".join(results)
        return PlainTextResponse(output)

    except Exception as e:
        return PlainTextResponse(f"Search error: {str(e)}", status_code=500)


@router.get("/scrape")
def web_scrape(url: str = Query(..., description="URL to scrape")):
    """Fetch and extract text content from a URL using Jina Reader."""
    try:
        jina_url = f"https://r.jina.ai/{url}"
        req = urllib.request.Request(jina_url, headers={
            "Accept": "text/plain",
            "User-Agent": "Mozilla/5.0 (compatible; CaneBot/1.0)",
        })

        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read().decode("utf-8", errors="replace")[:12000]

        return PlainTextResponse(body)

    except urllib.error.HTTPError as e:
        # Fallback: try direct fetch with basic HTML stripping
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": "Mozilla/5.0 (compatible; CaneBot/1.0)",
            })
            with urllib.request.urlopen(req, timeout=20) as resp:
                html = resp.read().decode("utf-8", errors="replace")[:30000]

            # Basic HTML to text
            text = re.sub(r"<script[^>]*>.*?</script>", "", html, flags=re.DOTALL)
            text = re.sub(r"<style[^>]*>.*?</style>", "", text, flags=re.DOTALL)
            text = re.sub(r"<[^>]+>", " ", text)
            text = re.sub(r"\s+", " ", text).strip()
            return PlainTextResponse(text[:8000])

        except Exception as fallback_err:
            return PlainTextResponse(
                f"Scrape failed: Jina returned {e.code}, fallback also failed: {str(fallback_err)}",
                status_code=500,
            )

    except Exception as e:
        return PlainTextResponse(f"Scrape error: {str(e)}", status_code=500)
