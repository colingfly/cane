"""
database.py — SQLAlchemy engine, session factory, and base.
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

from cane.core.config import DATABASE_URL

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,       # reconnect stale connections
    pool_size=10,
    max_overflow=20,
    echo=False,               # set True to see SQL in console
)

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)

Base = declarative_base()


def get_db():
    """FastAPI dependency — yields a DB session, auto-closes."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Create all tables. Safe to call repeatedly."""
    try:
        Base.metadata.create_all(bind=engine)
    except Exception:
        pass  # table-exists race between gunicorn workers
