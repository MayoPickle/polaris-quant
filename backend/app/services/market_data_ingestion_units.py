"""Work-unit planning for market-data ingestion jobs."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from app.core.config import settings
from app.models.market_data import MarketDataIngestionJob
from app.services.market_data_time import (
    chunked,
    iter_calendar_day_windows,
    iter_regular_session_windows,
    normalize_symbols,
)


@dataclass(frozen=True)
class MarketDataWorkUnit:
    index: int
    chunk_index: int
    window_index: int
    symbols: list[str]
    window_start: datetime
    window_end: datetime

    @property
    def cursor(self) -> str:
        return f"{self.symbols[0]}..{self.symbols[-1]} {self.window_start.isoformat()}"


def initial_progress_state(symbols_per_request: int) -> dict:
    return {
        "symbols_per_request": symbols_per_request,
        "last_completed_unit": -1,
        "last_completed_cursor": None,
    }


def count_work_units_for(
    *,
    symbols: list[str],
    timeframe: str,
    start_ts: datetime,
    end_ts: datetime,
    symbols_per_request: int,
) -> int:
    chunks = list(chunked(normalize_symbols(symbols), symbols_per_request))
    windows = _windows_for(timeframe, start_ts, end_ts)
    return len(chunks) * len(windows)


def iter_work_units(job: MarketDataIngestionJob):
    chunks = _symbol_chunks(job)
    windows = _windows_for(job.timeframe, job.start_ts, job.end_ts)
    index = 0
    for chunk_index, symbols in enumerate(chunks):
        for window_index, (window_start, window_end) in enumerate(windows):
            yield MarketDataWorkUnit(
                index=index,
                chunk_index=chunk_index,
                window_index=window_index,
                symbols=symbols,
                window_start=window_start,
                window_end=window_end,
            )
            index += 1


def completed_symbols_for(job: MarketDataIngestionJob) -> int:
    windows = _windows_for(job.timeframe, job.start_ts, job.end_ts)
    if not windows:
        return 0
    completed_chunks = max(0, job.completed_work_units // len(windows))
    chunks = _symbol_chunks(job)
    return min(job.total_symbols, sum(len(chunk) for chunk in chunks[:completed_chunks]))


def symbols_per_request_for(job: MarketDataIngestionJob) -> int:
    progress_state = job.progress_state or {}
    value = progress_state.get("symbols_per_request")
    if isinstance(value, int) and value > 0:
        return value
    return max(1, settings.MARKET_DATA_SYMBOLS_PER_REQUEST)


def _symbol_chunks(job: MarketDataIngestionJob) -> list[list[str]]:
    return list(chunked(normalize_symbols(job.symbols), symbols_per_request_for(job)))


def _windows_for(
    timeframe: str,
    start_ts: datetime,
    end_ts: datetime,
) -> list[tuple[datetime, datetime]]:
    if timeframe == "1Min":
        return list(iter_regular_session_windows(start_ts, end_ts, settings.MARKET_TIMEZONE))
    return list(iter_calendar_day_windows(start_ts, end_ts))
