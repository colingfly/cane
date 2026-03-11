"""
connector_sync.py — Sync engine for Live Connectors.

Handles initial sync (download all files from a folder), incremental sync
(detect changes via Google Drive Changes API), and the background polling loop.

Reuses the existing Ingestor pipeline — no new extraction code needed.
"""
import traceback
import threading
import asyncio
from pathlib import Path
from datetime import datetime

from config import CONNECTOR_SYNC_DIR
from database import SessionLocal
from db_models import Document
from connector_models import ConnectorCredential, ConnectorSync, ConnectorFile
from services import gdrive


# Simple lock to prevent concurrent syncs of the same sync_id
_sync_locks: dict[str, threading.Lock] = {}


def _get_lock(sync_id: str) -> threading.Lock:
    if sync_id not in _sync_locks:
        _sync_locks[sync_id] = threading.Lock()
    return _sync_locks[sync_id]


def run_sync(sync_id: str):
    """
    Run a sync — initial or incremental depending on whether we have a change token.
    Called from background tasks or the polling loop.
    """
    lock = _get_lock(sync_id)
    if not lock.acquire(blocking=False):
        print(f"  [Sync] {sync_id[:8]} already running, skipping")
        return

    try:
        db = SessionLocal()
        try:
            sync = db.query(ConnectorSync).filter(ConnectorSync.id == sync_id).first()
            if not sync:
                print(f"  [Sync] Sync {sync_id[:8]} not found")
                return

            cred = db.query(ConnectorCredential).filter(
                ConnectorCredential.id == sync.credential_id
            ).first()
            if not cred or not cred.is_active:
                sync.last_sync_status = "error"
                sync.last_sync_message = "Credential not found or inactive"
                db.commit()
                return

            sync.last_sync_status = "running"
            db.commit()

            if sync.last_change_token:
                _run_incremental_sync(sync, cred, db)
            else:
                _run_initial_sync(sync, cred, db)

        except Exception as e:
            traceback.print_exc()
            try:
                sync = db.query(ConnectorSync).filter(ConnectorSync.id == sync_id).first()
                if sync:
                    sync.last_sync_status = "error"
                    sync.last_sync_message = str(e)[:500]
                    sync.last_sync_at = datetime.utcnow()
                    db.commit()
            except Exception:
                pass
        finally:
            db.close()
    finally:
        lock.release()


def _run_initial_sync(sync: ConnectorSync, cred: ConnectorCredential, db):
    """Download all files from the folder and ingest them."""
    print(f"  [Sync] Initial sync for folder '{sync.remote_folder_name}'")

    # List all files in the folder
    files = gdrive.list_folder_contents(cred, sync.remote_folder_id)
    db.commit()  # persist token refresh

    synced_count = 0
    errors = []

    for file_meta in files:
        try:
            _download_and_ingest_file(sync, cred, file_meta, db)
            synced_count += 1
        except Exception as e:
            traceback.print_exc()
            errors.append(f"{file_meta.get('name', '?')}: {str(e)[:100]}")

    # Get the initial change token for future incremental syncs
    try:
        page_token = gdrive.get_start_page_token(cred)
        sync.last_change_token = page_token
        db.commit()
    except Exception as e:
        print(f"  [Sync] Warning: couldn't get change token: {e}")

    # Update sync status
    sync.last_sync_at = datetime.utcnow()
    sync.files_synced = synced_count
    if errors:
        sync.last_sync_status = "error" if synced_count == 0 else "success"
        sync.last_sync_message = f"Synced {synced_count}/{len(files)} files. Errors: {'; '.join(errors[:3])}"
    else:
        sync.last_sync_status = "success"
        sync.last_sync_message = f"Synced {synced_count} files"
    db.commit()

    print(f"  [Sync] Initial sync complete: {synced_count}/{len(files)} files")


def _run_incremental_sync(sync: ConnectorSync, cred: ConnectorCredential, db):
    """Use Changes API to detect and process file changes."""
    print(f"  [Sync] Incremental sync for folder '{sync.remote_folder_name}'")

    changes, new_token = gdrive.get_changes(cred, sync.last_change_token, sync.remote_folder_id)
    db.commit()  # persist token refresh

    added = 0
    updated = 0
    removed = 0
    errors = []

    for change in changes:
        file_id = change["file_id"]
        try:
            if change["removed"]:
                # File was deleted or trashed
                _remove_synced_file(sync, file_id, db)
                removed += 1
            else:
                # Check if we already have this file
                existing = db.query(ConnectorFile).filter(
                    ConnectorFile.sync_id == sync.id,
                    ConnectorFile.remote_file_id == file_id,
                    ConnectorFile.status != "deleted",
                ).first()

                mime = change["mime_type"]
                ext = gdrive.get_file_extension(mime)
                if not ext:
                    continue  # unsupported file type

                if existing:
                    # File was modified — re-download and re-ingest
                    _remove_synced_file(sync, file_id, db)
                    file_meta = {
                        "id": file_id,
                        "name": change["name"],
                        "mimeType": mime,
                        "modifiedTime": change["modified_time"],
                        "size": str(change["size"]),
                    }
                    _download_and_ingest_file(sync, cred, file_meta, db)
                    updated += 1
                else:
                    # New file
                    file_meta = {
                        "id": file_id,
                        "name": change["name"],
                        "mimeType": mime,
                        "modifiedTime": change["modified_time"],
                        "size": str(change["size"]),
                    }
                    _download_and_ingest_file(sync, cred, file_meta, db)
                    added += 1
        except Exception as e:
            traceback.print_exc()
            errors.append(f"{change.get('name', file_id[:8])}: {str(e)[:100]}")

    # Update change token and status
    sync.last_change_token = new_token
    sync.last_sync_at = datetime.utcnow()

    # Recount files
    file_count = db.query(ConnectorFile).filter(
        ConnectorFile.sync_id == sync.id,
        ConnectorFile.status == "ready",
    ).count()
    sync.files_synced = file_count

    parts = []
    if added:
        parts.append(f"{added} added")
    if updated:
        parts.append(f"{updated} updated")
    if removed:
        parts.append(f"{removed} removed")
    if not parts:
        parts.append("No changes")
    if errors:
        parts.append(f"{len(errors)} errors")

    sync.last_sync_status = "error" if errors and not (added or updated or removed) else "success"
    sync.last_sync_message = ", ".join(parts)
    db.commit()

    print(f"  [Sync] Incremental sync complete: {', '.join(parts)}")


def _download_and_ingest_file(
    sync: ConnectorSync,
    cred: ConnectorCredential,
    file_meta: dict,
    db,
):
    """Download one file from Drive and run it through the ingestor."""
    file_id = file_meta["id"]
    name = file_meta.get("name", "unknown")
    mime = file_meta.get("mimeType", "")
    modified_str = file_meta.get("modifiedTime", "")
    size = int(file_meta.get("size", 0) or 0)

    ext = gdrive.get_file_extension(mime)
    if not ext:
        raise ValueError(f"Unsupported MIME type: {mime}")

    # Determine local filename (use Drive name + correct extension)
    base_name = Path(name).stem
    local_name = f"{base_name}{ext}"

    # Create sync-specific download directory
    sync_dir = CONNECTOR_SYNC_DIR / sync.tenant_id / sync.id
    sync_dir.mkdir(parents=True, exist_ok=True)
    dest_path = sync_dir / local_name

    # Handle name collisions
    counter = 1
    while dest_path.exists():
        dest_path = sync_dir / f"{base_name}_{counter}{ext}"
        counter += 1

    # Create ConnectorFile record
    cf = ConnectorFile(
        sync_id=sync.id,
        tenant_id=sync.tenant_id,
        remote_file_id=file_id,
        remote_name=name,
        remote_mime_type=mime,
        remote_size_bytes=size,
        local_path=str(dest_path),
        status="downloading",
    )
    if modified_str:
        try:
            cf.remote_modified_at = datetime.fromisoformat(modified_str.replace("Z", "+00:00"))
        except Exception:
            pass
    db.add(cf)
    db.commit()
    db.refresh(cf)

    try:
        # Download
        gdrive.download_file(cred, file_id, mime, str(dest_path))
        db.commit()  # persist token refresh

        cf.status = "ingesting"
        db.commit()

        # Create Document record
        from config import EXT_MAP
        file_type = EXT_MAP.get(ext, "")
        file_size = dest_path.stat().st_size if dest_path.exists() else size

        doc = Document(
            tenant_id=sync.tenant_id,
            workspace_id=sync.workspace_id,
            uploaded_by=None,  # synced, not uploaded by a user
            filename=dest_path.name,
            file_type=file_type,
            file_size_bytes=file_size,
            status="processing",
        )
        db.add(doc)
        db.commit()
        db.refresh(doc)

        cf.document_id = doc.id
        db.commit()

        # Get workspace name for enrichment
        from db_models import Workspace
        ws = db.query(Workspace).filter(Workspace.id == sync.workspace_id).first()
        ws_name = ws.name if ws else ""

        from db_models import Tenant
        tenant = db.query(Tenant).filter(Tenant.id == sync.tenant_id).first()
        tenant_name = tenant.name if tenant else ""

        # Run through the existing ingestor pipeline
        from ingestor import Ingestor
        ing = Ingestor()
        result = ing.ingest(
            filepath=str(dest_path),
            tenant_id=sync.tenant_id,
            workspace_id=sync.workspace_id,
            document_id=doc.id,
            company_name=tenant_name,
            workspace_name=ws_name,
            force=True,
        )

        if result.ok:
            doc.status = "ready"
            doc.chunk_count = len(result.chunks)
            doc.image_count = len(result.images)
            doc.processed_at = datetime.utcnow()
            cf.status = "ready"
            try:
                from hybrid_search import invalidate_index
                invalidate_index(sync.tenant_id, sync.workspace_id)
            except Exception:
                pass
        else:
            doc.status = "error"
            doc.error_message = result.error
            cf.status = "error"
            cf.error_message = result.error or "Ingestion failed"

        db.commit()
        print(f"  [Sync] Ingested '{name}' → {doc.chunk_count} chunks, {doc.image_count} images")

    except Exception as e:
        cf.status = "error"
        cf.error_message = str(e)[:500]
        db.commit()
        raise


def _remove_synced_file(sync: ConnectorSync, remote_file_id: str, db):
    """Remove a previously synced file — delete chunks, Document, and ConnectorFile."""
    from services.chroma import text_col, image_col

    cf = db.query(ConnectorFile).filter(
        ConnectorFile.sync_id == sync.id,
        ConnectorFile.remote_file_id == remote_file_id,
        ConnectorFile.status != "deleted",
    ).first()

    if not cf:
        return

    # Delete ChromaDB chunks
    if cf.document_id:
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
        local = Path(cf.local_path)
        if local.exists():
            local.unlink()

    # Mark as deleted (or fully delete)
    db.delete(cf)
    db.commit()

    try:
        from hybrid_search import invalidate_index
        invalidate_index(sync.tenant_id, sync.workspace_id)
    except Exception:
        pass


# ══════════════════════════════════════════
#  Background Polling Loop
# ══════════════════════════════════════════

async def start_sync_loop():
    """
    Background loop that checks for active syncs needing refresh.
    Runs every 5 minutes. Called from app.py on startup.
    """
    print("  [Sync] Background sync loop started")
    while True:
        await asyncio.sleep(300)  # 5 minutes
        try:
            _check_and_run_syncs()
        except Exception as e:
            print(f"  [Sync] Loop error: {e}")


def _check_and_run_syncs():
    """Check all active syncs and run any that are due."""
    db = SessionLocal()
    try:
        syncs = db.query(ConnectorSync).filter(
            ConnectorSync.status == "active",
            ConnectorSync.last_sync_status != "running",
        ).all()

        now = datetime.utcnow()
        for sync in syncs:
            if sync.last_sync_at:
                from datetime import timedelta
                next_sync = sync.last_sync_at + timedelta(minutes=sync.sync_interval_minutes)
                if now < next_sync:
                    continue

            sync_id = sync.id
            db.expunge(sync)
            # Run in a thread to avoid blocking the async loop
            thread = threading.Thread(target=run_sync, args=(sync_id,), daemon=True)
            thread.start()

    except Exception as e:
        print(f"  [Sync] Check error: {e}")
    finally:
        db.close()
