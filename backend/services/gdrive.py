"""
gdrive.py — Google Drive API client for Live Connectors.

Handles OAuth token refresh, folder listing, file download, and
incremental change detection via the Drive Changes API.

Uses urllib.request (same pattern as email_routes.py) — no extra dependencies.
"""
import json
import os
import urllib.request
import urllib.parse
import urllib.error
from datetime import datetime, timedelta

from config import GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET
from services.crypto import encrypt, decrypt


# ── MIME type mapping: Google Drive → local file extension ──
# Native Google formats must be exported; others download directly.
EXPORT_MIME_MAP = {
    "application/vnd.google-apps.document": ("application/pdf", ".pdf"),
    "application/vnd.google-apps.spreadsheet": (
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".xlsx"
    ),
    "application/vnd.google-apps.presentation": ("application/pdf", ".pdf"),
}

# Direct-download MIME types we support (maps to Cane EXT_MAP)
SUPPORTED_MIME_TYPES = {
    "application/pdf": ".pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "text/csv": ".csv",
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/bmp": ".bmp",
    "audio/mpeg": ".mp3",
    "audio/wav": ".wav",
    "audio/mp4": ".m4a",
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
}


def _api_request(url: str, access_token: str, method: str = "GET", timeout: int = 30) -> dict:
    """Make an authenticated request to the Google API."""
    req = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {access_token}",
    }, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


def refresh_access_token(credential) -> str:
    """
    Refresh the OAuth access token for a ConnectorCredential.
    Returns the new access token string.
    The credential object is updated in-place (caller must commit to DB).
    """
    refresh_tok = decrypt(credential.refresh_token)
    if not refresh_tok:
        raise ValueError("No refresh token stored for this credential")

    data = urllib.parse.urlencode({
        "client_id": GOOGLE_OAUTH_CLIENT_ID,
        "client_secret": GOOGLE_OAUTH_CLIENT_SECRET,
        "refresh_token": refresh_tok,
        "grant_type": "refresh_token",
    }).encode()

    req = urllib.request.Request(
        "https://oauth2.googleapis.com/token",
        data=data,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )

    with urllib.request.urlopen(req, timeout=10) as resp:
        result = json.loads(resp.read().decode())

    new_access = result["access_token"]
    expires_in = result.get("expires_in", 3600)

    credential.access_token = encrypt(new_access)
    credential.token_expires_at = datetime.utcnow() + timedelta(seconds=expires_in)

    print(f"  [GDrive] Refreshed access token for {credential.account_email}")
    return new_access


def get_valid_token(credential) -> str:
    """
    Get a valid access token, refreshing if expired or missing.
    Caller must commit the DB session after calling this.
    """
    if credential.access_token and credential.token_expires_at:
        if credential.token_expires_at > datetime.utcnow() + timedelta(minutes=5):
            return decrypt(credential.access_token)
    return refresh_access_token(credential)


def _request_with_retry(credential, url: str, method: str = "GET", timeout: int = 30) -> dict:
    """Make an API request, auto-refreshing token on 401."""
    token = get_valid_token(credential)
    try:
        return _api_request(url, token, method, timeout)
    except urllib.error.HTTPError as e:
        if e.code == 401:
            token = refresh_access_token(credential)
            return _api_request(url, token, method, timeout)
        raise


def exchange_code_for_tokens(code: str, redirect_uri: str) -> dict:
    """
    Exchange an authorization code for access + refresh tokens.
    Returns dict with: access_token, refresh_token, expires_in.
    """
    data = urllib.parse.urlencode({
        "code": code,
        "client_id": GOOGLE_OAUTH_CLIENT_ID,
        "client_secret": GOOGLE_OAUTH_CLIENT_SECRET,
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code",
    }).encode()

    req = urllib.request.Request(
        "https://oauth2.googleapis.com/token",
        data=data,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )

    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read().decode())


def get_user_email(access_token: str) -> str:
    """Fetch the authenticated user's email address."""
    result = _api_request(
        "https://www.googleapis.com/oauth2/v2/userinfo", access_token,
    )
    return result.get("email", "")


def list_folders(credential, query: str = "") -> list:
    """
    Search for folders in the user's Drive.
    Returns list of {id, name} dicts.
    """
    q_parts = ["mimeType='application/vnd.google-apps.folder'", "trashed=false"]
    if query:
        q_parts.append(f"name contains '{query}'")
    q = " and ".join(q_parts)

    url = (
        "https://www.googleapis.com/drive/v3/files?"
        + urllib.parse.urlencode({
            "q": q,
            "fields": "files(id,name)",
            "pageSize": "50",
            "orderBy": "name",
        })
    )
    result = _request_with_retry(credential, url)
    return result.get("files", [])


def list_folder_contents(credential, folder_id: str) -> list:
    """
    List all supported files in a Drive folder (non-recursive).
    Returns list of file metadata dicts.
    """
    q = f"'{folder_id}' in parents and trashed=false"
    fields = "files(id,name,mimeType,modifiedTime,size),nextPageToken"
    all_files = []
    page_token = None

    while True:
        params = {"q": q, "fields": fields, "pageSize": "100"}
        if page_token:
            params["pageToken"] = page_token

        url = "https://www.googleapis.com/drive/v3/files?" + urllib.parse.urlencode(params)
        result = _request_with_retry(credential, url)
        all_files.extend(result.get("files", []))

        page_token = result.get("nextPageToken")
        if not page_token:
            break

    # Filter to supported types
    supported = []
    for f in all_files:
        mime = f.get("mimeType", "")
        if mime in EXPORT_MIME_MAP or mime in SUPPORTED_MIME_TYPES:
            supported.append(f)

    return supported


def get_file_extension(mime_type: str) -> str:
    """Get the local file extension for a Drive MIME type."""
    if mime_type in EXPORT_MIME_MAP:
        return EXPORT_MIME_MAP[mime_type][1]
    return SUPPORTED_MIME_TYPES.get(mime_type, "")


def download_file(credential, file_id: str, mime_type: str, dest_path: str) -> None:
    """
    Download a file from Google Drive to a local path.
    Google Docs/Sheets/Slides are exported; others are downloaded directly.
    """
    token = get_valid_token(credential)

    if mime_type in EXPORT_MIME_MAP:
        export_mime = EXPORT_MIME_MAP[mime_type][0]
        url = (
            f"https://www.googleapis.com/drive/v3/files/{file_id}/export?"
            + urllib.parse.urlencode({"mimeType": export_mime})
        )
    else:
        url = f"https://www.googleapis.com/drive/v3/files/{file_id}?alt=media"

    req = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {token}",
    })

    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            with open(dest_path, "wb") as f:
                while True:
                    chunk = resp.read(8192)
                    if not chunk:
                        break
                    f.write(chunk)
    except urllib.error.HTTPError as e:
        if e.code == 401:
            # Retry with refreshed token
            token = refresh_access_token(credential)
            req = urllib.request.Request(url, headers={
                "Authorization": f"Bearer {token}",
            })
            with urllib.request.urlopen(req, timeout=120) as resp:
                with open(dest_path, "wb") as f:
                    while True:
                        chunk = resp.read(8192)
                        if not chunk:
                            break
                        f.write(chunk)
        else:
            raise


def get_start_page_token(credential) -> str:
    """Get the initial page token for the Changes API."""
    url = "https://www.googleapis.com/drive/v3/changes/startPageToken"
    result = _request_with_retry(credential, url)
    return result.get("startPageToken", "")


def get_changes(credential, page_token: str, folder_id: str) -> tuple:
    """
    Get file changes since the given page token.
    Returns (changes, new_page_token) where changes is a list of
    {file_id, name, mime_type, modified_time, size, removed} dicts
    that belong to the specified folder.
    """
    all_changes = []
    current_token = page_token

    while True:
        url = (
            "https://www.googleapis.com/drive/v3/changes?"
            + urllib.parse.urlencode({
                "pageToken": current_token,
                "fields": "changes(fileId,file(id,name,mimeType,modifiedTime,size,parents,trashed),removed),newStartPageToken,nextPageToken",
                "pageSize": "100",
                "includeRemoved": "true",
            })
        )
        result = _request_with_retry(credential, url)

        for change in result.get("changes", []):
            file_data = change.get("file", {})
            parents = file_data.get("parents", [])
            is_removed = change.get("removed", False) or file_data.get("trashed", False)

            # Only include changes for files in our synced folder
            if is_removed or folder_id in parents:
                all_changes.append({
                    "file_id": change.get("fileId", ""),
                    "name": file_data.get("name", ""),
                    "mime_type": file_data.get("mimeType", ""),
                    "modified_time": file_data.get("modifiedTime", ""),
                    "size": int(file_data.get("size", 0) or 0),
                    "removed": is_removed,
                })

        next_page = result.get("nextPageToken")
        new_start = result.get("newStartPageToken")

        if next_page:
            current_token = next_page
        else:
            return all_changes, new_start or current_token
