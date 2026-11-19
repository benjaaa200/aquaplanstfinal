"""Small thread-safe TTL cache for expensive read endpoints.

The API runs synchronous endpoints in a worker thread pool, so a plain dict is
not enough; access is guarded by a lock. Entries are short lived to keep the
data fresh without requiring explicit invalidation.
"""
import threading
import time
from typing import Any

from backend.config import (
    LOGIN_IP_MAX_ATTEMPTS,
    LOGIN_MAX_ATTEMPTS,
    LOGIN_WINDOW_SECONDS,
)


class TTLCache:
    def __init__(self, default_ttl: float = 5.0, maxsize: int = 512):
        self.default_ttl = default_ttl
        self.maxsize = maxsize
        self._data: dict[Any, tuple[float, Any]] = {}
        self._lock = threading.Lock()

    def get(self, key: Any) -> Any | None:
        now = time.monotonic()
        with self._lock:
            item = self._data.get(key)
            if item is None:
                return None
            expires_at, value = item
            if expires_at <= now:
                self._data.pop(key, None)
                return None
            return value

    def set(self, key: Any, value: Any, ttl: float | None = None) -> None:
        expires_at = time.monotonic() + (
            self.default_ttl if ttl is None else ttl
        )
        with self._lock:
            if len(self._data) >= self.maxsize:
                self._evict_locked()
            self._data[key] = (expires_at, value)

    def _evict_locked(self) -> None:
        now = time.monotonic()
        expired = [key for key, (expires_at, _) in self._data.items() if expires_at <= now]
        for key in expired:
            self._data.pop(key, None)
        while len(self._data) >= self.maxsize:
            self._data.pop(next(iter(self._data)), None)

    def clear(self) -> None:
        with self._lock:
            self._data.clear()


class RateLimiter:
    """Sliding-window limiter keyed by a string (IP, identifier, etc.)."""

    def __init__(self, limit: int, window_seconds: float, max_keys: int = 2048):
        self.limit = limit
        self.window_seconds = window_seconds
        self.max_keys = max_keys
        self._events: dict[str, list[float]] = {}
        self._lock = threading.Lock()

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        cutoff = now - self.window_seconds
        with self._lock:
            if len(self._events) >= self.max_keys and key not in self._events:
                self._events.clear()
            events = [stamp for stamp in self._events.get(key, ()) if stamp > cutoff]
            if len(events) >= self.limit:
                self._events[key] = events
                return False
            events.append(now)
            self._events[key] = events
            return True

    def reset(self, key: str) -> None:
        """Forget the events recorded for one key (for example after success)."""
        with self._lock:
            self._events.pop(key, None)

    def clear(self) -> None:
        """Drop every recorded event; used by tests and manual resets."""
        with self._lock:
            self._events.clear()


# Responses of read-only endpoints that are polled often by the dashboards.
api_cache = TTLCache(default_ttl=5.0, maxsize=256)

# Prevents re-running the pending-alerts routine on every notification poll.
alert_throttle = TTLCache(default_ttl=45.0, maxsize=256)

# One notification per crop+variable every 30 minutes to avoid sensor spam.
sensor_notification_throttle = TTLCache(default_ttl=1800.0, maxsize=1024)

# Password-recovery requests: 5 per identifier and 20 per IP per hour.
reset_identifier_limiter = RateLimiter(limit=5, window_seconds=3600)
reset_ip_limiter = RateLimiter(limit=20, window_seconds=3600)

# Magic-link verification: links are high entropy, so only cap per IP abuse.
reset_link_ip_limiter = RateLimiter(limit=30, window_seconds=3600)

# Login attempts: 5 per identifier and 100 per IP inside a 5-minute window.
# The identifier key includes the IP so one attacker cannot lock a victim out.
login_identifier_limiter = RateLimiter(
    limit=LOGIN_MAX_ATTEMPTS, window_seconds=LOGIN_WINDOW_SECONDS
)
login_ip_limiter = RateLimiter(
    limit=LOGIN_IP_MAX_ATTEMPTS, window_seconds=LOGIN_WINDOW_SECONDS
)
