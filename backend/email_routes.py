"""
email_routes.py — Internal endpoint for sending emails via Gmail API.

The agent's webhook tool hits this endpoint with plain JSON:
  {"to": "...", "subject": "...", "body": "..."}

This route handles RFC 2822 formatting, base64 encoding, and Gmail API auth.

Setup:
  Set these env vars (or add to .env):
    GMAIL_CLIENT_ID=your_client_id
    GMAIL_CLIENT_SECRET=your_client_secret
    GMAIL_REFRESH_TOKEN=your_refresh_token
    GMAIL_FROM_EMAIL=you@gmail.com  (optional, defaults to authenticated user)
"""
import os
import json
import base64
import urllib.request
import urllib.error
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from fastapi import APIRouter, HTTPException, Request

router = APIRouter(prefix="/api/email", tags=["email"])

# ── Config from env (read at request time to handle late injection) ──
def _gmail_config():
    return {
        "client_id": os.getenv("GMAIL_CLIENT_ID", ""),
        "client_secret": os.getenv("GMAIL_CLIENT_SECRET", ""),
        "refresh_token": os.getenv("GMAIL_REFRESH_TOKEN", ""),
        "from_email": os.getenv("GMAIL_FROM_EMAIL", ""),
        "from_name": os.getenv("GMAIL_FROM_NAME", "Cane"),
    }

# Cache the access token in memory
_token_cache = {"access_token": None}


def _refresh_access_token() -> str:
    """Use the refresh token to get a fresh access token from Google."""
    cfg = _gmail_config()
    if not cfg["client_id"] or not cfg["client_secret"] or not cfg["refresh_token"]:
        raise HTTPException(500, "Gmail credentials not configured. Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and GMAIL_REFRESH_TOKEN env vars.")

    data = urllib.parse.urlencode({
        "client_id": cfg["client_id"],
        "client_secret": cfg["client_secret"],
        "refresh_token": cfg["refresh_token"],
        "grant_type": "refresh_token",
    }).encode()

    req = urllib.request.Request(
        "https://oauth2.googleapis.com/token",
        data=data,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            result = json.loads(resp.read().decode())
            _token_cache["access_token"] = result["access_token"]
            print(f"  [Email] Refreshed Gmail access token")
            return result["access_token"]
    except Exception as e:
        raise HTTPException(500, f"Failed to refresh Gmail token: {e}")


import urllib.parse


def _get_access_token() -> str:
    """Get a valid access token, refreshing if needed."""
    if _token_cache["access_token"]:
        return _token_cache["access_token"]
    return _refresh_access_token()


def _send_gmail(to: str, subject: str, body: str, is_html: bool = False) -> dict:
    """Send an email via Gmail API."""
    cfg = _gmail_config()
    access_token = _get_access_token()

    # Build the email
    if is_html:
        msg = MIMEMultipart("alternative")
        msg.attach(MIMEText(body, "plain"))
        msg.attach(MIMEText(body, "html"))
    else:
        msg = MIMEText(body)

    from_header = f"{cfg['from_name']} <{cfg['from_email']}>" if cfg['from_email'] else cfg['from_name']
    msg["to"] = to
    msg["from"] = from_header
    msg["subject"] = subject

    # Base64url encode
    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode("ascii")

    # Send via Gmail API
    payload = json.dumps({"raw": raw}).encode()
    req = urllib.request.Request(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        data=payload,
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            result = json.loads(resp.read().decode())
            print(f"  [Email] Sent to {to}: {subject} (id={result.get('id')})")
            return {"status": "sent", "message_id": result.get("id"), "to": to}

    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8", errors="replace")

        # If 401, refresh token and retry once
        if e.code == 401:
            print(f"  [Email] Token expired, refreshing...")
            access_token = _refresh_access_token()
            req.add_header("Authorization", f"Bearer {access_token}")
            try:
                with urllib.request.urlopen(req, timeout=15) as resp:
                    result = json.loads(resp.read().decode())
                    print(f"  [Email] Sent (after refresh) to {to}: {subject}")
                    return {"status": "sent", "message_id": result.get("id"), "to": to}
            except Exception as retry_err:
                raise HTTPException(500, f"Gmail send failed after token refresh: {retry_err}")

        raise HTTPException(502, f"Gmail API error ({e.code}): {error_body[:500]}")


# ─── Send email endpoint (called by agent webhook tool) ───

@router.post("/send")
async def send_email(request: Request):
    """
    Send an email via Gmail.

    Body:
      {
        "to": "visitor@example.com",
        "subject": "Welcome to Cane!",
        "body": "Thanks for your interest...",
        "html": false  (optional, default false)
      }
    """
    try:
        data = await request.json()
    except Exception:
        raise HTTPException(400, "Invalid JSON body")

    to = data.get("to", "").strip()
    subject = data.get("subject", "").strip()
    body = data.get("body", "").strip()
    is_html = data.get("html", False)

    if not to or not subject or not body:
        raise HTTPException(400, "Missing required fields: to, subject, body")

    result = _send_gmail(to, subject, body, is_html)
    return result


# ─── Health check ───

@router.get("/debug-env")
def debug_env():
    """Temporary: check which GMAIL env vars exist at all."""
    import os
    gmail_vars = {}
    for k, v in os.environ.items():
        if 'GMAIL' in k.upper():
            gmail_vars[k] = f"{v[:8]}..." if len(v) > 8 else v
    return {"gmail_env_vars_found": gmail_vars, "total_env_vars": len(os.environ)}


@router.get("/status")
def email_status():
    """Check if Gmail credentials are configured."""
    cfg = _gmail_config()
    configured = bool(cfg["client_id"] and cfg["client_secret"] and cfg["refresh_token"])
    return {
        "configured": configured,
        "from_email": cfg["from_email"] or "(not set)",
        "from_name": cfg["from_name"],
        "has_client_id": bool(cfg["client_id"]),
        "has_client_secret": bool(cfg["client_secret"]),
        "has_refresh_token": bool(cfg["refresh_token"]),
    }
