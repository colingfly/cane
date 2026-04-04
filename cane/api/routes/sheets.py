"""
sheets_routes.py — Internal endpoint for capturing leads to Google Sheets.

The agent's webhook tool hits this endpoint with JSON:
  {"email": "...", "name": "...", "company": "...", ...}

Appends a row to a configured Google Sheet.
Uses the same Gmail OAuth credentials.
Requires scope: https://www.googleapis.com/auth/spreadsheets

Setup:
  Set env var: GOOGLE_SHEET_ID=your_spreadsheet_id
  (Get this from the URL: https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit)
"""
import os
import json
import urllib.request
import urllib.error
from datetime import datetime

from fastapi import APIRouter, HTTPException, Request

router = APIRouter(prefix="/api/sheets", tags=["sheets"])


def _gmail_config():
    return {
        "client_id": os.getenv("GMAIL_CLIENT_ID", ""),
        "client_secret": os.getenv("GMAIL_CLIENT_SECRET", ""),
        "refresh_token": os.getenv("GMAIL_REFRESH_TOKEN", ""),
    }


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
            print(f"  [Sheets] Refreshed access token")
            return result["access_token"]
    except Exception as e:
        raise HTTPException(500, f"Failed to refresh token: {e}")


def _get_access_token() -> str:
    if _token_cache["access_token"]:
        return _token_cache["access_token"]
    return _refresh_access_token()


# ─── Default columns for lead capture ───
DEFAULT_COLUMNS = ["timestamp", "name", "email", "company", "phone", "source", "notes"]


@router.post("/append")
async def append_row(request: Request):
    """
    Append a row to a Google Sheet (lead capture).

    Body:
      {
        "email": "visitor@example.com",
        "name": "Jane Doe",
        "company": "Acme Inc",
        "phone": "555-1234",
        "source": "website widget",
        "notes": "Interested in enterprise plan",
        "question": "...",  (also captured if present)
        "answer": "..."    (also captured if present)
      }

    Or with explicit sheet config:
      {
        "sheet_id": "override_sheet_id",
        "sheet_name": "Leads",
        "values": ["col1", "col2", ...]
      }
    """
    try:
        data = await request.json()
    except Exception:
        raise HTTPException(400, "Invalid JSON body")

    sheet_id = data.get("sheet_id", "").strip() or os.getenv("GOOGLE_SHEET_ID", "")
    sheet_name = data.get("sheet_name", "").strip() or os.getenv("GOOGLE_SHEET_NAME", "Sheet1")

    if not sheet_id:
        raise HTTPException(400, "No Google Sheet ID configured. Set GOOGLE_SHEET_ID env var.")

    # Build row values
    if "values" in data and isinstance(data["values"], list):
        # Explicit values provided
        row = data["values"]
    else:
        # Auto-build from known fields
        now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
        row = [
            now,
            data.get("name", ""),
            data.get("email", ""),
            data.get("company", ""),
            data.get("phone", ""),
            data.get("source", "cane widget"),
            data.get("notes", "") or data.get("answer", "") or data.get("question", ""),
        ]

    # Check if sheet needs headers (first row)
    access_token = _get_access_token()
    needs_headers = False

    try:
        check_url = f"https://sheets.googleapis.com/v4/spreadsheets/{sheet_id}/values/{sheet_name}!A1:A1"
        check_req = urllib.request.Request(
            check_url,
            headers={"Authorization": f"Bearer {access_token}"},
            method="GET",
        )
        with urllib.request.urlopen(check_req, timeout=10) as resp:
            result = json.loads(resp.read().decode())
            if not result.get("values"):
                needs_headers = True
    except urllib.error.HTTPError as e:
        if e.code == 401:
            access_token = _refresh_access_token()
            # Retry check
            try:
                check_req = urllib.request.Request(
                    check_url,
                    headers={"Authorization": f"Bearer {access_token}"},
                    method="GET",
                )
                with urllib.request.urlopen(check_req, timeout=10) as resp:
                    result = json.loads(resp.read().decode())
                    if not result.get("values"):
                        needs_headers = True
            except Exception:
                needs_headers = True
        else:
            # Sheet might be empty or not exist
            needs_headers = True
    except Exception:
        needs_headers = True

    # Build request body
    rows_to_append = []
    if needs_headers and "values" not in data:
        rows_to_append.append([c.title() for c in DEFAULT_COLUMNS])
    rows_to_append.append(row)

    append_url = (
        f"https://sheets.googleapis.com/v4/spreadsheets/{sheet_id}/values/"
        f"{sheet_name}!A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS"
    )

    payload = json.dumps({"values": rows_to_append}).encode()
    req = urllib.request.Request(
        append_url,
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
            updated = result.get("updates", {})
            print(f"  [Sheets] Appended row: {row[:3]}... to {sheet_id}")
            return {
                "status": "captured",
                "rows_added": updated.get("updatedRows", 1),
                "range": updated.get("updatedRange", ""),
                "sheet_id": sheet_id,
            }
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8", errors="replace")

        if e.code == 401:
            print(f"  [Sheets] Token expired, refreshing...")
            access_token = _refresh_access_token()
            req.remove_header("Authorization")
            req.add_header("Authorization", f"Bearer {access_token}")
            try:
                with urllib.request.urlopen(req, timeout=15) as resp:
                    result = json.loads(resp.read().decode())
                    updated = result.get("updates", {})
                    print(f"  [Sheets] Appended (after refresh): {row[:3]}...")
                    return {
                        "status": "captured",
                        "rows_added": updated.get("updatedRows", 1),
                        "range": updated.get("updatedRange", ""),
                        "sheet_id": sheet_id,
                    }
            except Exception as retry_err:
                raise HTTPException(500, f"Sheets API failed after token refresh: {retry_err}")

        raise HTTPException(502, f"Google Sheets API error ({e.code}): {error_body[:500]}")


@router.get("/status")
def sheets_status():
    """Check if Sheets credentials are configured."""
    cfg = _gmail_config()
    configured = bool(cfg["client_id"] and cfg["client_secret"] and cfg["refresh_token"])
    sheet_id = os.getenv("GOOGLE_SHEET_ID", "")
    return {
        "configured": configured and bool(sheet_id),
        "sheet_id": f"{sheet_id[:10]}..." if sheet_id else "(not set)",
        "sheet_name": os.getenv("GOOGLE_SHEET_NAME", "Sheet1"),
    }
