"""Simple in-memory sliding-window rate limiter for authentication endpoints.

For multi-instance deployments swap this for a shared store (e.g. Redis); the interface stays the same.
"""
import threading
import time
from collections import defaultdict, deque

from app.core.exceptions import TooManyRequests


class RateLimiter:
    def __init__(self, limit: int, window_seconds: int):
        self.limit = limit
        self.window = window_seconds
        self._hits: dict[str, deque] = defaultdict(deque)
        self._lock = threading.Lock()

    def hit(self, key: str) -> None:
        now = time.monotonic()
        with self._lock:
            q = self._hits[key]
            while q and now - q[0] > self.window:
                q.popleft()
            if len(q) >= self.limit:
                wait = int(self.window - (now - q[0])) + 1
                raise TooManyRequests(f"Too many attempts. Please try again in {wait} seconds.")
            q.append(now)

    def reset(self, key: str) -> None:
        with self._lock:
            self._hits.pop(key, None)

    def clear(self) -> None:
        with self._lock:
            self._hits.clear()
