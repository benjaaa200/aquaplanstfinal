"""Small shared helpers for the AquaPlants backend."""
from datetime import datetime, timezone


def utcnow() -> datetime:
    """Return the current UTC time as a naive datetime.

    Database sessions use UTC, so naive application datetimes represent UTC
    consistently across the SQLite test database and PostgreSQL.
    """
    return datetime.now(timezone.utc).replace(tzinfo=None)
