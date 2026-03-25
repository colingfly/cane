"""
services/rate_limit.py -- IP-based rate limiting for guest eval runs.
"""
from datetime import datetime, timedelta

_eval_rate_limits: dict[str, datetime] = {}


def check_guest_eval_rate(ip: str) -> str | None:
    """Returns error message if guest IP is rate-limited, else None."""
    last = _eval_rate_limits.get(ip)
    if last and datetime.utcnow() - last < timedelta(hours=1):
        remaining = timedelta(hours=1) - (datetime.utcnow() - last)
        mins = int(remaining.total_seconds() / 60)
        return f"Anonymous eval runs are limited to 1 per hour. Try again in {mins} minutes."
    return None


def record_guest_eval_run(ip: str):
    """Record that a guest eval run was triggered from this IP."""
    _eval_rate_limits[ip] = datetime.utcnow()
