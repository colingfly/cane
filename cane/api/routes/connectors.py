"""
connector_routes.py — API endpoints for Live Connectors (Google Drive sync).

Handles OAuth flows, folder browsing, sync CRUD, and manual sync triggers.
"""
import json
import urllib.parse
from datetime import datetime

from fastapi import APIRouter, Query, HTTPException, Depends, BackgroundTasks, Request
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session
from jose import jwt, JWTError

from cane.core.config import (
    GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET,
    SECRET_KEY, JWT_ALGORITHM,
)
from cane.core.database import get_db
from cane.core.models import User, Workspace, Document
from cane.integrations.connector_models import ConnectorCredential, ConnectorSync, ConnectorFile
from cane.auth.jwt import get_current_user
from cane.core.crypto import encrypt, decrypt
from services import gdrive
from services import s3 as s3_service

router = APIRouter(prefix="/api/connectors", tags=["connectors"])


# ── Helpers ──

def _get_credential(tenant_id: str, db: Session) -> ConnectorCredential:
    """Get the active Google Drive credential for a tenant."""
    return db.query(ConnectorCredential).filter(
        ConnectorCredential.tenant_id == tenant_id,
        ConnectorCredential.provider == "google_drive",
        ConnectorCredential.is_active == True,
    ).first()


def _get_redirect_uri(request: Request) -> str:
    """Build the OAuth redirect URI from the current request."""
    # Use X-Forwarded headers if behind a proxy
    scheme = request.headers.get("x-forwarded-proto", request.url.scheme)
    host = request.headers.get("x-forwarded-host", request.url.hostname)
    port = request.url.port
    if port and port not in (80, 443):
        base = f"{scheme}://{host}:{port}"
    else:
        base = f"{scheme}://{host}"
    return f"{base}/api/connectors/google-drive/callback"


# ══════════════════════════════════════════
#  Google Drive OAuth
# ══════════════════════════════════════════

@router.get("/google-drive/auth-url")
def get_auth_url(
    request: Request,
    workspace_id: str = Query(...),
    user: User = Depends(get_current_user),
):
    """Generate the Google OAuth consent URL."""
    if not GOOGLE_OAUTH_CLIENT_ID or not GOOGLE_OAUTH_CLIENT_SECRET:
        raise HTTPException(500, "Google OAuth not configured. Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET.")

    # Encode tenant + workspace into a short-lived state JWT
    state = jwt.encode(
        {"tenant_id": user.tenant_id, "workspace_id": workspace_id, "user_id": user.id},
        SECRET_KEY, algorithm=JWT_ALGORITHM,
    )

    redirect_uri = _get_redirect_uri(request)

    params = urllib.parse.urlencode({
        "client_id": GOOGLE_OAUTH_CLIENT_ID,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/userinfo.email",
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
    })

    return {"auth_url": f"https://accounts.google.com/o/oauth2/v2/auth?{params}"}


@router.get("/google-drive/callback")
def oauth_callback(
    request: Request,
    code: str = Query(""),
    state: str = Query(""),
    error: str = Query(""),
    db: Session = Depends(get_db),
):
    """
    OAuth callback from Google. No JWT auth needed — uses state param.
    Returns HTML that sends postMessage to opener and closes popup.
    """
    if error:
        return HTMLResponse(f"""<html><body><script>
            window.opener.postMessage({{type:'gdrive-error', error:'{error}'}}, '*');
            window.close();
        </script><p>Authorization failed: {error}. This window will close.</p></body></html>""")

    if not code or not state:
        raise HTTPException(400, "Missing code or state parameter")

    # Decode state
    try:
        payload = jwt.decode(state, SECRET_KEY, algorithms=[JWT_ALGORITHM])
    except JWTError:
        raise HTTPException(400, "Invalid or expired state token")

    tenant_id = payload.get("tenant_id")
    if not tenant_id:
        raise HTTPException(400, "Invalid state payload")

    redirect_uri = _get_redirect_uri(request)

    # Exchange code for tokens
    try:
        token_data = gdrive.exchange_code_for_tokens(code, redirect_uri)
    except Exception as e:
        return HTMLResponse(f"""<html><body><script>
            window.opener.postMessage({{type:'gdrive-error', error:'Token exchange failed'}}, '*');
            window.close();
        </script><p>Failed to exchange code: {e}</p></body></html>""")

    access_token = token_data.get("access_token", "")
    refresh_token = token_data.get("refresh_token", "")
    expires_in = token_data.get("expires_in", 3600)

    if not refresh_token:
        return HTMLResponse("""<html><body><script>
            window.opener.postMessage({type:'gdrive-error', error:'No refresh token received. Try revoking access and reconnecting.'}, '*');
            window.close();
        </script></body></html>""")

    # Get user email
    try:
        email = gdrive.get_user_email(access_token)
    except Exception:
        email = ""

    # Upsert credential for this tenant
    existing = db.query(ConnectorCredential).filter(
        ConnectorCredential.tenant_id == tenant_id,
        ConnectorCredential.provider == "google_drive",
    ).first()

    from datetime import timedelta

    if existing:
        existing.refresh_token = encrypt(refresh_token)
        existing.access_token = encrypt(access_token)
        existing.token_expires_at = datetime.utcnow() + timedelta(seconds=expires_in)
        existing.account_email = email
        existing.is_active = True
        existing.updated_at = datetime.utcnow()
    else:
        cred = ConnectorCredential(
            tenant_id=tenant_id,
            provider="google_drive",
            refresh_token=encrypt(refresh_token),
            access_token=encrypt(access_token),
            token_expires_at=datetime.utcnow() + timedelta(seconds=expires_in),
            account_email=email,
        )
        db.add(cred)

    db.commit()

    return HTMLResponse(f"""<html><body><script>
        window.opener.postMessage({{type:'gdrive-connected', email:'{email}'}}, '*');
        window.close();
    </script><p>Connected as {email}. This window will close.</p></body></html>""")


@router.get("/google-drive/status")
def gdrive_status(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Check if tenant has Google Drive connected."""
    cred = _get_credential(user.tenant_id, db)
    if cred:
        return {"connected": True, "account_email": cred.account_email}
    return {"connected": False, "account_email": ""}


@router.delete("/google-drive")
def disconnect_gdrive(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Disconnect Google Drive — delete credential and all syncs."""
    cred = _get_credential(user.tenant_id, db)
    if not cred:
        raise HTTPException(404, "Google Drive not connected")

    # Delete all syncs and their files
    syncs = db.query(ConnectorSync).filter(ConnectorSync.credential_id == cred.id).all()
    for sync in syncs:
        _delete_sync_data(sync, db)

    db.delete(cred)
    db.commit()
    return {"status": "disconnected"}


# ══════════════════════════════════════════
#  Folder Browsing
# ══════════════════════════════════════════

@router.get("/google-drive/folders")
def browse_folders(
    q: str = Query(""),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Search Google Drive folders."""
    cred = _get_credential(user.tenant_id, db)
    if not cred:
        raise HTTPException(400, "Google Drive not connected")

    try:
        folders = gdrive.list_folders(cred, q)
        db.commit()  # persist any token refresh
        return {"folders": folders}
    except Exception as e:
        db.commit()
        raise HTTPException(502, f"Failed to list folders: {e}")


# ══════════════════════════════════════════
#  S3-Compatible Storage
# ══════════════════════════════════════════

def _get_s3_credential(tenant_id: str, db: Session):
    """Get the active S3 credential for a tenant."""
    return db.query(ConnectorCredential).filter(
        ConnectorCredential.tenant_id == tenant_id,
        ConnectorCredential.provider == "s3",
        ConnectorCredential.is_active == True,
    ).first()


@router.post("/s3/test")
async def test_s3(
    request: Request,
    user: User = Depends(get_current_user),
):
    """Test an S3 connection with the given credentials."""
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(400, "Invalid JSON body")

    endpoint_url = body.get("endpoint_url", "")
    access_key = body.get("access_key", "")
    secret_key = body.get("secret_key", "")
    region = body.get("region", "us-east-1")

    if not access_key or not secret_key:
        raise HTTPException(400, "Access key and secret key are required")

    try:
        result = s3_service.test_connection(endpoint_url, access_key, secret_key, region)
        return result
    except Exception as e:
        raise HTTPException(400, f"Connection failed: {str(e)[:200]}")


@router.post("/s3/connect")
async def connect_s3(
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Store S3 credentials for the tenant."""
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(400, "Invalid JSON body")

    endpoint_url = body.get("endpoint_url", "")
    access_key = body.get("access_key", "")
    secret_key = body.get("secret_key", "")
    region = body.get("region", "us-east-1")
    display_label = body.get("display_label", "")

    if not access_key or not secret_key:
        raise HTTPException(400, "Access key and secret key are required")

    if not display_label:
        if endpoint_url:
            display_label = endpoint_url.replace("https://", "").replace("http://", "").split("/")[0]
        else:
            display_label = "AWS S3"

    # Encrypt creds as JSON
    creds_json = json.dumps({
        "access_key": access_key,
        "secret_key": secret_key,
        "endpoint_url": endpoint_url,
        "region": region,
    })

    # Upsert credential
    existing = _get_s3_credential(user.tenant_id, db)
    if existing:
        existing.refresh_token = encrypt(creds_json)
        existing.access_token = ""
        existing.token_expires_at = None
        existing.account_email = display_label
        existing.is_active = True
        existing.updated_at = datetime.utcnow()
    else:
        cred = ConnectorCredential(
            tenant_id=user.tenant_id,
            provider="s3",
            refresh_token=encrypt(creds_json),
            access_token="",
            account_email=display_label,
        )
        db.add(cred)

    db.commit()
    return {"connected": True, "display_label": display_label}


@router.get("/s3/status")
def s3_status(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Check if tenant has S3 connected."""
    cred = _get_s3_credential(user.tenant_id, db)
    if cred:
        return {"connected": True, "display_label": cred.account_email or "S3"}
    return {"connected": False, "display_label": ""}


@router.delete("/s3")
def disconnect_s3(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Disconnect S3 - delete credential and all S3 syncs."""
    cred = _get_s3_credential(user.tenant_id, db)
    if not cred:
        raise HTTPException(404, "S3 not connected")

    # Delete all syncs and their files
    syncs = db.query(ConnectorSync).filter(
        ConnectorSync.credential_id == cred.id,
    ).all()
    for sync in syncs:
        _delete_sync_data(sync, db)

    db.delete(cred)
    db.commit()
    return {"status": "disconnected"}


@router.get("/s3/browse")
def browse_s3(
    bucket: str = Query(""),
    prefix: str = Query(""),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Browse S3 buckets and prefixes."""
    cred = _get_s3_credential(user.tenant_id, db)
    if not cred:
        raise HTTPException(400, "S3 not connected")

    try:
        if not bucket:
            # List buckets
            buckets = s3_service.list_buckets(cred)
            return {"buckets": buckets, "prefixes": [], "files": []}
        else:
            # Browse within a bucket
            result = s3_service.list_prefixes(cred, bucket, prefix)
            return {"buckets": [], **result}
    except Exception as e:
        raise HTTPException(502, f"Failed to browse S3: {str(e)[:200]}")


# ══════════════════════════════════════════
#  Sync CRUD
# ══════════════════════════════════════════

@router.get("/syncs")
def list_syncs(
    workspace_id: str = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all syncs for a workspace."""
    syncs = db.query(ConnectorSync).filter(
        ConnectorSync.workspace_id == workspace_id,
        ConnectorSync.tenant_id == user.tenant_id,
    ).order_by(ConnectorSync.created_at.desc()).all()

    return {"syncs": [_serialize_sync(s, db) for s in syncs]}


@router.post("/syncs")
def create_sync(
    workspace_id: str = Query(...),
    folder_id: str = Query(...),
    folder_name: str = Query(""),
    provider: str = Query("google_drive"),
    background_tasks: BackgroundTasks = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new sync (folder/bucket -> workspace) and trigger initial sync."""
    # Validate workspace
    ws = db.query(Workspace).filter(
        Workspace.id == workspace_id, Workspace.tenant_id == user.tenant_id,
    ).first()
    if not ws:
        raise HTTPException(400, "Invalid workspace")

    if provider == "s3":
        cred = _get_s3_credential(user.tenant_id, db)
        if not cred:
            raise HTTPException(400, "S3 not connected")
    else:
        cred = _get_credential(user.tenant_id, db)
        if not cred:
            raise HTTPException(400, "Google Drive not connected")

    # Check for duplicate
    existing = db.query(ConnectorSync).filter(
        ConnectorSync.workspace_id == workspace_id,
        ConnectorSync.remote_folder_id == folder_id,
        ConnectorSync.tenant_id == user.tenant_id,
    ).first()
    if existing:
        raise HTTPException(400, "This folder is already synced to this workspace")

    sync = ConnectorSync(
        tenant_id=user.tenant_id,
        credential_id=cred.id,
        workspace_id=workspace_id,
        provider=provider,
        remote_folder_id=folder_id,
        remote_folder_name=folder_name or folder_id,
        status="active",
        last_sync_status="running",
    )
    db.add(sync)
    db.commit()
    db.refresh(sync)

    sync_id = sync.id
    tenant_id = user.tenant_id
    tenant_name = ""

    # Trigger initial sync in background
    background_tasks.add_task(_run_sync_background, sync_id, tenant_id)

    return _serialize_sync(sync, db)


@router.get("/syncs/{sync_id}")
def get_sync(
    sync_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get sync details including file list."""
    sync = db.query(ConnectorSync).filter(
        ConnectorSync.id == sync_id, ConnectorSync.tenant_id == user.tenant_id,
    ).first()
    if not sync:
        raise HTTPException(404, "Sync not found")

    files = db.query(ConnectorFile).filter(
        ConnectorFile.sync_id == sync_id,
        ConnectorFile.status != "deleted",
    ).order_by(ConnectorFile.created_at.desc()).all()

    data = _serialize_sync(sync, db)
    data["files"] = [
        {
            "id": f.id,
            "remote_name": f.remote_name,
            "remote_mime_type": f.remote_mime_type,
            "remote_size_bytes": f.remote_size_bytes,
            "status": f.status,
            "error_message": f.error_message or "",
            "document_id": f.document_id,
            "created_at": f.created_at.isoformat() if f.created_at else "",
        }
        for f in files
    ]
    return data


@router.post("/syncs/{sync_id}/trigger")
def trigger_sync(
    sync_id: str,
    background_tasks: BackgroundTasks = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Manually trigger an incremental sync."""
    sync = db.query(ConnectorSync).filter(
        ConnectorSync.id == sync_id, ConnectorSync.tenant_id == user.tenant_id,
    ).first()
    if not sync:
        raise HTTPException(404, "Sync not found")
    if sync.last_sync_status == "running":
        raise HTTPException(400, "Sync is already running")

    sync.last_sync_status = "running"
    db.commit()

    background_tasks.add_task(_run_sync_background, sync_id, user.tenant_id)
    return {"status": "started"}


@router.put("/syncs/{sync_id}")
def update_sync(
    sync_id: str,
    status: str = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Pause or resume a sync."""
    sync = db.query(ConnectorSync).filter(
        ConnectorSync.id == sync_id, ConnectorSync.tenant_id == user.tenant_id,
    ).first()
    if not sync:
        raise HTTPException(404, "Sync not found")

    if status not in ("active", "paused"):
        raise HTTPException(400, "Status must be 'active' or 'paused'")

    sync.status = status
    sync.updated_at = datetime.utcnow()
    db.commit()
    return _serialize_sync(sync, db)


@router.delete("/syncs/{sync_id}")
def delete_sync(
    sync_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a sync and all its synced documents."""
    sync = db.query(ConnectorSync).filter(
        ConnectorSync.id == sync_id, ConnectorSync.tenant_id == user.tenant_id,
    ).first()
    if not sync:
        raise HTTPException(404, "Sync not found")

    _delete_sync_data(sync, db)
    db.commit()
    return {"status": "deleted", "folder_name": sync.remote_folder_name}


# ══════════════════════════════════════════
#  Helpers
# ══════════════════════════════════════════

def _serialize_sync(sync: ConnectorSync, db: Session) -> dict:
    return {
        "id": sync.id,
        "workspace_id": sync.workspace_id,
        "provider": sync.provider or "google_drive",
        "remote_folder_id": sync.remote_folder_id,
        "remote_folder_name": sync.remote_folder_name,
        "status": sync.status,
        "last_sync_at": sync.last_sync_at.isoformat() if sync.last_sync_at else None,
        "last_sync_status": sync.last_sync_status or "",
        "last_sync_message": sync.last_sync_message or "",
        "files_synced": sync.files_synced,
        "sync_interval_minutes": sync.sync_interval_minutes,
        "created_at": sync.created_at.isoformat() if sync.created_at else "",
    }


def _delete_sync_data(sync: ConnectorSync, db: Session):
    """Delete all documents and ChromaDB chunks for a sync, then delete the sync."""
    from cane.rag.chroma import text_col, image_col

    files = db.query(ConnectorFile).filter(ConnectorFile.sync_id == sync.id).all()
    for cf in files:
        if cf.document_id:
            # Delete chunks from ChromaDB
            try:
                text_col.delete(where={"document_id": cf.document_id})
            except Exception:
                pass
            if image_col:
                try:
                    image_col.delete(where={"document_id": cf.document_id})
                except Exception:
                    pass
            # Delete Document record
            doc = db.query(Document).filter(Document.id == cf.document_id).first()
            if doc:
                db.delete(doc)

        # Delete local file
        if cf.local_path:
            from pathlib import Path
            local = Path(cf.local_path)
            if local.exists():
                local.unlink()

        db.delete(cf)

    # Invalidate search index
    try:
        from cane.rag.hybrid_search import invalidate_index
        invalidate_index(sync.tenant_id, sync.workspace_id)
    except Exception:
        pass

    db.delete(sync)


def _run_sync_background(sync_id: str, tenant_id: str):
    """Background task wrapper for sync execution."""
    from cane.integrations.connector_sync import run_sync
    run_sync(sync_id)
