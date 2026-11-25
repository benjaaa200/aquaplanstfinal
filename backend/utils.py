"""Small shared helpers for the AquaPlants backend."""
from datetime import datetime, timezone


def naive_utc(value: datetime | None) -> datetime | None:
    """Normalize an aware or naive datetime to a naive UTC value."""
    if not value:
        return None
    if value.tzinfo:
        return value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


def utcnow() -> datetime:
    """Return the current UTC time as a naive datetime.

    Database sessions use UTC, so naive application datetimes represent UTC
    consistently across the SQLite test database and PostgreSQL.
    """
    return datetime.now(timezone.utc).replace(tzinfo=None)
