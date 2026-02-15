"""
seed.py — Initialize the database and create your admin account.

Run once:
    python seed.py

This will:
  1. Create all tables in MySQL
  2. Create your platform admin account
  3. Create a demo tenant + workspace for testing
"""
import sys
from pathlib import Path

# Ensure imports work
_root = str(Path(__file__).resolve().parent)
if _root not in sys.path:
    sys.path.insert(0, _root)

from database import init_db, SessionLocal
from db_models import Tenant, User, Workspace
from auth import hash_password


def seed():
    print("Initializing Cane database...\n")

    # Create tables
    init_db()
    print("  ✓ Tables created\n")

    db = SessionLocal()

    try:
        # ── Admin account (you) ──
        admin_email = input("  Your admin email: ").strip()
        admin_password = input("  Your admin password: ").strip()
        admin_name = input("  Your name: ").strip()

        # Check if admin already exists
        existing = db.query(User).filter(User.email == admin_email).first()
        if existing:
            print(f"\n  ⚠ User {admin_email} already exists. Skipping.\n")
        else:
            # Admin gets a special internal tenant
            admin_tenant = Tenant(
                name="Cane Platform",
                slug="cane-platform",
                plan="admin",
            )
            db.add(admin_tenant)
            db.flush()

            admin_user = User(
                tenant_id=admin_tenant.id,
                email=admin_email,
                password_hash=hash_password(admin_password),
                name=admin_name,
                role="admin",
            )
            db.add(admin_user)
            db.flush()
            print(f"  ✓ Admin account created: {admin_email}\n")

        # ── Demo tenant ──
        create_demo = input("  Create a demo tenant for testing? (y/n): ").strip().lower()
        if create_demo == "y":
            demo_name = input("  Demo company name: ").strip() or "Demo Company"
            demo_slug = demo_name.lower().replace(" ", "-").replace("'", "")

            existing_tenant = db.query(Tenant).filter(Tenant.slug == demo_slug).first()
            if existing_tenant:
                print(f"  ⚠ Tenant '{demo_slug}' already exists. Skipping.\n")
            else:
                tenant = Tenant(name=demo_name, slug=demo_slug)
                db.add(tenant)
                db.flush()

                # Default workspace
                ws = Workspace(
                    tenant_id=tenant.id,
                    name="General",
                    description="Default workspace",
                    is_default=True,
                )
                db.add(ws)
                db.flush()

                # Owner account for the demo tenant
                owner_email = input(f"  Owner email for {demo_name}: ").strip()
                owner_password = input(f"  Owner password: ").strip()
                owner_name = input(f"  Owner name: ").strip()

                owner = User(
                    tenant_id=tenant.id,
                    email=owner_email,
                    password_hash=hash_password(owner_password),
                    name=owner_name,
                    role="owner",
                )
                db.add(owner)
                db.flush()

                print(f"  ✓ Tenant created: {demo_name}")
                print(f"  ✓ Default workspace: General")
                print(f"  ✓ Owner account: {owner_email}\n")

        db.commit()
        print("Done! You can now run: python app.py\n")

    except Exception as e:
        db.rollback()
        print(f"\n  ✗ Error: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
