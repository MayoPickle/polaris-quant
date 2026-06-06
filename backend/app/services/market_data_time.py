"""Time-window helpers for cached market data."""

from __future__ import annotations

from collections.abc import Iterable, Iterator, Sequence
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

UTC = timezone.utc
REGULAR_SESSION_START = time(9, 30)
REGULAR_SESSION_END = time(16, 0)


def as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def parse_utc_date(value: str) -> datetime:
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def is_regular_session(value: datetime, timezone_name: str) -> bool:
    local = as_utc(value).astimezone(ZoneInfo(timezone_name))
    return (
        local.weekday() < 5
        and REGULAR_SESSION_START <= local.time() < REGULAR_SESSION_END
    )


def iter_regular_session_windows(
    start: datetime,
    end: datetime,
    timezone_name: str,
) -> Iterator[tuple[datetime, datetime]]:
    start_utc = as_utc(start)
    end_utc = as_utc(end)
    if start_utc >= end_utc:
        return

    zone = ZoneInfo(timezone_name)
    current_day = start_utc.astimezone(zone).date()
    last_day = end_utc.astimezone(zone).date()
    while current_day <= last_day:
        if current_day.weekday() < 5:
            session_start, session_end = regular_session_bounds_utc(current_day, timezone_name)
            window_start = max(start_utc, session_start)
            window_end = min(end_utc, session_end)
            if window_start < window_end:
                yield window_start, window_end
        current_day += timedelta(days=1)


def regular_session_bounds_utc(
    session_date: date,
    timezone_name: str,
) -> tuple[datetime, datetime]:
    zone = ZoneInfo(timezone_name)
    start = datetime.combine(session_date, REGULAR_SESSION_START, tzinfo=zone)
    end = datetime.combine(session_date, REGULAR_SESSION_END, tzinfo=zone)
    return start.astimezone(UTC), end.astimezone(UTC)


def iter_calendar_day_windows(start: datetime, end: datetime) -> Iterator[tuple[datetime, datetime]]:
    current = as_utc(start)
    end_utc = as_utc(end)
    while current < end_utc:
        next_day = min(
            datetime.combine(current.date() + timedelta(days=1), time.min, tzinfo=UTC),
            end_utc,
        )
        yield current, next_day
        current = next_day


def chunked(values: Sequence[str], size: int) -> Iterator[list[str]]:
    chunk_size = max(1, size)
    for idx in range(0, len(values), chunk_size):
        yield list(values[idx : idx + chunk_size])


def normalize_symbols(values: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    symbols: list[str] = []
    for value in values:
        symbol = value.strip().upper()
        if symbol and symbol not in seen:
            seen.add(symbol)
            symbols.append(symbol)
    return symbols
