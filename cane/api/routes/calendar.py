"""
calendar_routes.py — Internal endpoint for booking Google Calendar events.

The agent's webhook tool hits this endpoint with JSON:
  {"attendee": "...", "title": "...", "date": "...", "time": "...", "duration": 30}

Uses the same Gmail OAuth credentials as email_routes.py.
Requires scope: https://www.googleapis.com/auth/calendar.events
"""
import os
import json
import urllib.request
import urllib.error
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException, Request

router = APIRouter(prefix="/api/calendar", tags=["calendar"])


def _gmail_config():
    return {
        "client_id": os.getenv("GMAIL_CLIENT_ID", ""),
        "client_secret": os.getenv("GMAIL_CLIENT_SECRET", ""),
        "refresh_token": os.getenv("GMAIL_REFRESH_TOKEN", ""),
        "from_email": os.getenv("GMAIL_FROM_EMAIL", ""),
    }


# Share token cache with email_routes if possible, otherwise maintain own
_token_cache = {"access_token": None}


def _refresh_access_token() -> str:
    cfg = _gmail_config()
    if not cfg["client_id"] or not cfg["client_secret"] or not cfg["refresh_token"]:
        raise HTTPException(500, "Google credentials not configured")

    import urllib.parse
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
            print(f"  [Calendar] Refreshed access token")
            return result["access_token"]
    except Exception as e:
        raise HTTPException(500, f"Failed to refresh token: {e}")


def _get_access_token() -> str:
    if _token_cache["access_token"]:
        return _token_cache["access_token"]
    return _refresh_access_token()


def _parse_datetime(date_str: str, time_str: str) -> datetime:
    """Parse flexible date/time formats from Claude's output."""
    # Try common date formats
    date_str = date_str.strip()
    time_str = time_str.strip() if time_str else "10:00"

    # Normalize time
    time_str = time_str.upper().strip()
    if "AM" in time_str or "PM" in time_str:
        # "2:30 PM" -> parse with %I:%M %p
        time_str = time_str.replace(".", "").strip()
        for fmt in ["%I:%M %p", "%I:%M%p", "%I %p", "%I%p"]:
            try:
                t = datetime.strptime(time_str, fmt)
                time_str = t.strftime("%H:%M")
                break
            except ValueError:
                continue
    
    # Ensure time is HH:MM
    if ":" not in time_str:
        time_str = f"{time_str}:00"

    # Try date formats
    for fmt in ["%Y-%m-%d", "%m/%d/%Y", "%m/%d/%y", "%B %d, %Y", "%B %d %Y", "%b %d, %Y", "%b %d %Y"]:
        try:
            d = datetime.strptime(date_str, fmt)
            h, m = time_str.split(":")[:2]
            return d.replace(hour=int(h), minute=int(m))
        except ValueError:
            continue

    # Last resort: try "tomorrow", "next Monday", etc.
    today = datetime.now()
    lower = date_str.lower()
    if lower == "tomorrow":
        d = today + timedelta(days=1)
    elif lower == "today":
        d = today
    else:
        # Default to tomorrow if unparseable
        d = today + timedelta(days=1)
        print(f"  [Calendar] Could not parse date '{date_str}', defaulting to tomorrow")

    h, m = time_str.split(":")[:2]
    return d.replace(hour=int(h), minute=int(m), second=0, microsecond=0)


@router.post("/book")
async def book_meeting(request: Request):
    """
    Book a Google Calendar event.

    Body:
      {
        "attendee": "visitor@example.com",
        "title": "Cane Demo Call",
        "date": "2025-03-15" or "tomorrow" or "March 15, 2025",
        "time": "2:30 PM" or "14:30",
        "duration": 30,  (minutes, default 30)
        "description": "optional notes"
      }
    """
    try:
        data = await request.json()
    except Exception:
        raise HTTPException(400, "Invalid JSON body")

    attendee = data.get("attendee", "").strip() or data.get("email", "").strip()
    title = data.get("title", "").strip() or data.get("summary", "Meeting")
    date_str = data.get("date", "").strip()
    time_str = data.get("time", "").strip() or "10:00 AM"
    duration = int(data.get("duration", 30))
    description = data.get("description", "").strip() or data.get("notes", "").strip() or data.get("answer", "").strip()

    if not attendee:
        raise HTTPException(400, "Missing required field: attendee (email)")
    if not date_str:
        raise HTTPException(400, "Missing required field: date")

    # Parse start/end times
    start_dt = _parse_datetime(date_str, time_str)
    end_dt = start_dt + timedelta(minutes=duration)

    cfg = _gmail_config()
    timezone = os.getenv("CALENDAR_TIMEZONE", "America/New_York")

    # Build event payload
    event = {
        "summary": title,
        "description": description or f"Booked by Cane AI agent",
        "start": {
            "dateTime": start_dt.strftime("%Y-%m-%dT%H:%M:%S"),
            "timeZone": timezone,
        },
        "end": {
            "dateTime": end_dt.strftime("%Y-%m-%dT%H:%M:%S"),
            "timeZone": timezone,
        },
        "attendees": [
            {"email": attendee},
        ],
        "reminders": {
            "useDefault": True,
        },
    }

    # Add organizer if configured
    if cfg["from_email"]:
        event["attendees"].append({"email": cfg["from_email"]})

    access_token = _get_access_token()
    payload = json.dumps(event).encode()

    req = urllib.request.Request(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all",
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
            print(f"  [Calendar] Booked: {title} with {attendee} at {start_dt} (id={result.get('id')})")
            return {
                "status": "booked",
                "event_id": result.get("id"),
                "link": result.get("htmlLink"),
                "summary": title,
                "start": start_dt.isoformat(),
                "end": end_dt.isoformat(),
                "attendee": attendee,
            }
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8", errors="replace")

        if e.code == 401:
            print(f"  [Calendar] Token expired, refreshing...")
            access_token = _refresh_access_token()
            req.remove_header("Authorization")
            req.add_header("Authorization", f"Bearer {access_token}")
            try:
                with urllib.request.urlopen(req, timeout=15) as resp:
                    result = json.loads(resp.read().decode())
                    print(f"  [Calendar] Booked (after refresh): {title} with {attendee}")
                    return {
                        "status": "booked",
                        "event_id": result.get("id"),
                        "link": result.get("htmlLink"),
                        "summary": title,
                        "start": start_dt.isoformat(),
                        "end": end_dt.isoformat(),
                        "attendee": attendee,
                    }
            except Exception as retry_err:
                raise HTTPException(500, f"Calendar API failed after token refresh: {retry_err}")

        raise HTTPException(502, f"Google Calendar API error ({e.code}): {error_body[:500]}")


@router.get("/status")
def calendar_status():
    """Check if Calendar credentials are configured."""
    cfg = _gmail_config()
    configured = bool(cfg["client_id"] and cfg["client_secret"] and cfg["refresh_token"])
    return {
        "configured": configured,
        "from_email": cfg["from_email"] or "(not set)",
        "timezone": os.getenv("CALENDAR_TIMEZONE", "America/New_York"),
    }
