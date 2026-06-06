"""Alpaca market data throttling helpers."""

from __future__ import annotations

from app.brokers.alpaca.rate_limit import (
    RetryConfig,
    SharedRateLimiter,
    is_rate_limit_error,
    retry_delay_for,
)


class FakeResponse:
    def __init__(self, status_code: int, headers: dict[str, str] | None = None) -> None:
        self.status_code = status_code
        self.headers = headers or {}


class FakeHTTPError(Exception):
    def __init__(self, status_code: int, headers: dict[str, str] | None = None) -> None:
        super().__init__(f"HTTP {status_code}")
        self.response = FakeResponse(status_code, headers)


def test_shared_rate_limiter_spaces_request_starts() -> None:
    now = 0.0
    sleeps: list[float] = []

    def clock() -> float:
        return now

    def sleep(seconds: float) -> None:
        nonlocal now
        sleeps.append(seconds)
        now += seconds

    limiter = SharedRateLimiter(60, clock=clock, sleeper=sleep)

    limiter.wait()
    limiter.wait()
    limiter.wait()

    assert sleeps == [1.0, 1.0]


def test_shared_rate_limiter_can_be_disabled() -> None:
    sleeps: list[float] = []
    limiter = SharedRateLimiter(0, clock=lambda: 0.0, sleeper=sleeps.append)

    limiter.wait()
    limiter.wait()

    assert sleeps == []


def test_rate_limit_error_detection_uses_status_or_message() -> None:
    assert is_rate_limit_error(FakeHTTPError(429))
    assert is_rate_limit_error(RuntimeError('{"message": "too many requests."}'))
    assert not is_rate_limit_error(FakeHTTPError(500))


def test_retry_delay_prefers_retry_after_header() -> None:
    config = RetryConfig(max_retries=4, base_delay_seconds=5.0, max_delay_seconds=60.0)

    delay = retry_delay_for(
        FakeHTTPError(429, {"Retry-After": "7"}),
        attempt=2,
        config=config,
        now_wall=100.0,
    )

    assert delay == 7.0


def test_retry_delay_falls_back_to_capped_exponential_backoff() -> None:
    config = RetryConfig(max_retries=4, base_delay_seconds=5.0, max_delay_seconds=30.0)

    assert retry_delay_for(FakeHTTPError(429), attempt=0, config=config) == 5.0
    assert retry_delay_for(FakeHTTPError(429), attempt=3, config=config) == 30.0
