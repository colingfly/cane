"""
auto_seed.py — Automatic database initialization for production.

Called on startup. Creates tables and admin account if they don't exist.
Uses environment variables:
  CANE_ADMIN_EMAIL
  CANE_ADMIN_PASSWORD
  CANE_ADMIN_NAME
"""
import os
import sys
from pathlib import Path

_root = str(Path(__file__).resolve().parent)
if _root not in sys.path:
    sys.path.insert(0, _root)

from database import init_db, SessionLocal
from db_models import User, Tenant, Workspace
from auth import hash_password


def auto_seed():
    """Create tables and seed admin if needed."""
    print("[AutoSeed] Initializing database...")
    init_db()
    print("[AutoSeed] Tables ready")

    # Check if admin exists
    db = SessionLocal()
    try:
        admin = db.query(User).filter(User.role == "admin").first()
        if admin:
            print(f"[AutoSeed] Admin already exists: {admin.email}")
            return

        # Create admin from env vars
        email = os.getenv("CANE_ADMIN_EMAIL", "")
        password = os.getenv("CANE_ADMIN_PASSWORD", "")
        name = os.getenv("CANE_ADMIN_NAME", "Admin")

        if not email or not password:
            print("[AutoSeed] ⚠️  No admin account and CANE_ADMIN_EMAIL/PASSWORD not set. Skipping.")
            return

        # Create platform tenant
        platform_tenant = Tenant(name="Cane Platform", slug="cane-platform")
        db.add(platform_tenant)
        db.flush()

        # Create admin user (bcrypt has 72-byte limit)
        admin = User(
            tenant_id=platform_tenant.id,
            email=email.lower().strip(),
            password_hash=hash_password(password[:72]),
            name=name,
            role="admin",
        )
        db.add(admin)

        # Default workspace
        ws = Workspace(
            tenant_id=platform_tenant.id,
            name="General",
            description="Default workspace",
            is_default=True,
        )
        db.add(ws)

        db.commit()
        print(f"[AutoSeed] ✓ Admin created: {email}")

    except Exception as e:
        db.rollback()
        print(f"[AutoSeed] Error: {e}")
    finally:
        db.close()


if __name__ == "__main__":
    auto_seed()
