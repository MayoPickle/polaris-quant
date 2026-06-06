"""Shared throttling and retry helpers for Alpaca market data calls."""

from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
import threading
import time


Clock = Callable[[], float]
Sleeper = Callable[[float], None]


@dataclass(frozen=True)
class RetryConfig:
    max_retries: int
    base_delay_seconds: float
    max_delay_seconds: float


class SharedRateLimiter:
    """Thread-safe process-level limiter for request starts."""

    def __init__(
        self,
        per_minute: int,
        *,
        clock: Clock = time.monotonic,
        sleeper: Sleeper = time.sleep,
    ) -> None:
        self._clock = clock
        self._sleeper = sleeper
        self._lock = threading.Lock()
        self._next_allowed_at = 0.0
        self._min_interval_seconds = _interval_for(per_minute)

    def configure(self, per_minute: int) -> None:
        with self._lock:
            self._min_interval_seconds = _interval_for(per_minute)

    def wait(self) -> None:
        with self._lock:
            interval = self._min_interval_seconds
            if interval <= 0:
                return

            now = self._clock()
            wait_seconds = max(0.0, self._next_allowed_at - now)
            self._next_allowed_at = max(now, self._next_allowed_at) + interval

        if wait_seconds > 0:
            self._sleeper(wait_seconds)


def is_rate_limit_error(exc: Exception) -> bool:
    response = _exception_response(exc)
    status_code = getattr(response, "status_code", None)
    if status_code == 429:
        return True
    return "too many requests" in str(exc).lower() or "429" in str(exc)


def retry_delay_for(
    exc: Exception,
    *,
    attempt: int,
    config: RetryConfig,
    now_wall: float | None = None,
) -> float:
    headers = _response_headers(exc)
    header_delay = _retry_after_delay(headers.get("Retry-After"), now_wall=now_wall)
    if header_delay is None:
        header_delay = _rate_limit_reset_delay(headers.get("X-RateLimit-Reset"), now_wall=now_wall)
    if header_delay is not None:
        return min(max(0.0, header_delay), config.max_delay_seconds)

    delay = config.base_delay_seconds * (2**attempt)
    return min(max(0.0, delay), config.max_delay_seconds)


def _interval_for(per_minute: int) -> float:
    return 60.0 / per_minute if per_minute > 0 else 0.0


def _exception_response(exc: Exception):
    return getattr(exc, "response", None) or getattr(exc, "_response", None)


def _response_headers(exc: Exception) -> Mapping[str, str]:
    response = _exception_response(exc)
    headers = getattr(response, "headers", None)
    return headers or {}


def _retry_after_delay(value: str | None, *, now_wall: float | None) -> float | None:
    if not value:
        return None
    value = value.strip()
    try:
        return float(value)
    except ValueError:
        pass

    try:
        retry_at = parsedate_to_datetime(value)
    except (TypeError, ValueError):
        return None
    if retry_at.tzinfo is None:
        retry_at = retry_at.replace(tzinfo=timezone.utc)
    now = datetime.fromtimestamp(now_wall or time.time(), timezone.utc)
    return (retry_at - now).total_seconds()


def _rate_limit_reset_delay(value: str | None, *, now_wall: float | None) -> float | None:
    if not value:
        return None
    try:
        reset_at = float(value)
    except ValueError:
        return None
    return reset_at - (now_wall or time.time())
