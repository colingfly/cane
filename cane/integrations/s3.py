"""
s3.py - S3-compatible storage client for Live Connectors.

Handles connection testing, bucket/prefix browsing, file listing,
and file download for any S3-compatible endpoint (AWS S3, Ceph, MinIO).

Credentials are stored as encrypted JSON in ConnectorCredential.refresh_token.
"""
import json
import mimetypes
from pathlib import Path

try:
    import boto3
    from botocore.exceptions import ClientError, EndpointConnectionError, NoCredentialsError
except ImportError:
    boto3 = None
    ClientError = Exception
    EndpointConnectionError = Exception
    NoCredentialsError = Exception

from cane.core.config import EXT_MAP
from cane.core.crypto import encrypt, decrypt


# Reverse of EXT_MAP: extension -> file_type
SUPPORTED_EXTENSIONS = set(EXT_MAP.keys())


def _parse_creds(credential) -> dict:
    """
    Decrypt and parse S3 credentials from the ConnectorCredential.refresh_token field.
    Returns dict with: access_key, secret_key, endpoint_url, region
    """
    raw = decrypt(credential.refresh_token)
    if not raw:
        raise ValueError("No S3 credentials stored for this credential")
    return json.loads(raw)


def get_s3_client(credential):
    """Create a boto3 S3 client from stored credentials."""
    creds = _parse_creds(credential)
    kwargs = {
        "service_name": "s3",
        "aws_access_key_id": creds["access_key"],
        "aws_secret_access_key": creds["secret_key"],
        "region_name": creds.get("region", "us-east-1"),
    }
    endpoint = creds.get("endpoint_url", "")
    if endpoint:
        kwargs["endpoint_url"] = endpoint
    return boto3.client(**kwargs)


def test_connection(endpoint_url: str, access_key: str, secret_key: str, region: str = "us-east-1") -> dict:
    """
    Test S3 connection with the given credentials.
    Returns {"ok": True, "buckets": [...]} on success, raises on failure.
    """
    kwargs = {
        "service_name": "s3",
        "aws_access_key_id": access_key,
        "aws_secret_access_key": secret_key,
        "region_name": region or "us-east-1",
    }
    if endpoint_url:
        kwargs["endpoint_url"] = endpoint_url

    client = boto3.client(**kwargs)
    resp = client.list_buckets()
    buckets = [
        {"id": b["Name"], "name": b["Name"]}
        for b in resp.get("Buckets", [])
    ]
    return {"ok": True, "buckets": buckets}


def list_buckets(credential) -> list:
    """List all buckets accessible with these credentials."""
    client = get_s3_client(credential)
    resp = client.list_buckets()
    return [
        {"id": b["Name"], "name": b["Name"]}
        for b in resp.get("Buckets", [])
    ]


def list_prefixes(credential, bucket: str, prefix: str = "") -> dict:
    """
    List 'folders' (common prefixes) and files at a given level in a bucket.
    Non-recursive - shows one level at a time for browsing.
    Returns {"prefixes": [...], "files": [...]}.
    """
    client = get_s3_client(credential)

    # Ensure prefix ends with / if not empty
    if prefix and not prefix.endswith("/"):
        prefix += "/"

    paginator = client.get_paginator("list_objects_v2")
    pages = paginator.paginate(
        Bucket=bucket,
        Prefix=prefix,
        Delimiter="/",
    )

    prefixes = []
    files = []

    for page in pages:
        # Common prefixes = "folders"
        for cp in page.get("CommonPrefixes", []):
            p = cp["Prefix"]
            # Display name is just the last segment
            display = p[len(prefix):].rstrip("/")
            if display:
                prefixes.append({
                    "id": p,
                    "name": display,
                    "full_path": p,
                })

        # Objects at this level
        for obj in page.get("Contents", []):
            key = obj["Key"]
            # Skip the prefix itself (some S3 impls return it)
            if key == prefix:
                continue
            # Only include files at this level (not in sub-prefixes)
            relative = key[len(prefix):]
            if "/" in relative:
                continue

            ext = get_file_extension(key)
            if not ext:
                continue  # unsupported file type

            files.append({
                "id": key,
                "name": relative,
                "size": obj.get("Size", 0),
                "last_modified": obj["LastModified"].isoformat() if obj.get("LastModified") else "",
            })

    return {"prefixes": prefixes, "files": files}


def list_objects(credential, bucket: str, prefix: str = "") -> list:
    """
    List all supported files under a prefix (recursive).
    Returns list of dicts matching the shape expected by the sync engine:
    {"id": key, "name": filename, "mimeType": mime, "modifiedTime": iso, "size": int}
    """
    client = get_s3_client(credential)

    # Ensure prefix ends with / if not empty
    if prefix and not prefix.endswith("/"):
        prefix += "/"

    paginator = client.get_paginator("list_objects_v2")
    pages = paginator.paginate(Bucket=bucket, Prefix=prefix)

    results = []
    for page in pages:
        for obj in page.get("Contents", []):
            key = obj["Key"]
            # Skip "folder" markers (zero-byte keys ending in /)
            if key.endswith("/"):
                continue

            ext = get_file_extension(key)
            if not ext:
                continue  # unsupported file type

            filename = key.rsplit("/", 1)[-1] if "/" in key else key
            mime = guess_mime_type(key)

            results.append({
                "id": key,
                "name": filename,
                "mimeType": mime,
                "modifiedTime": obj["LastModified"].isoformat() if obj.get("LastModified") else "",
                "size": obj.get("Size", 0),
                "key": key,
                "etag": obj.get("ETag", ""),
            })

    return results


def download_object(credential, bucket: str, key: str, dest_path: str) -> None:
    """Download an S3 object to a local file path."""
    client = get_s3_client(credential)
    # Ensure parent directory exists
    Path(dest_path).parent.mkdir(parents=True, exist_ok=True)
    client.download_file(bucket, key, dest_path)


def get_file_extension(key: str) -> str:
    """
    Get the file extension from an S3 object key.
    Returns the extension if supported (in EXT_MAP), empty string otherwise.
    """
    name = key.rsplit("/", 1)[-1] if "/" in key else key
    ext = Path(name).suffix.lower()
    if ext in SUPPORTED_EXTENSIONS:
        return ext
    return ""


def guess_mime_type(key: str) -> str:
    """Guess MIME type from S3 object key using extension."""
    mime, _ = mimetypes.guess_type(key)
    if mime:
        return mime
    # Fallback for common types
    ext = Path(key).suffix.lower()
    fallback = {
        ".pdf": "application/pdf",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ".csv": "text/csv",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".mp3": "audio/mpeg",
        ".mp4": "video/mp4",
    }
    return fallback.get(ext, "application/octet-stream")


def parse_bucket_prefix(remote_folder_id: str) -> tuple:
    """
    Parse a remote_folder_id into (bucket, prefix).
    Format: "bucket-name" or "bucket-name/some/prefix/"
    """
    if "/" in remote_folder_id:
        bucket = remote_folder_id.split("/", 1)[0]
        prefix = remote_folder_id.split("/", 1)[1]
        return bucket, prefix
    return remote_folder_id, ""
