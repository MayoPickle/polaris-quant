"""Read-only access to cached historical market bars."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.brokers.base import Bar
from app.core.config import settings
from app.db.session import SessionLocal
from app.models.market_data import MarketBar, MarketDataCoverage
from app.services.market_data_time import as_utc, iter_regular_session_windows


class MarketDataMissingError(ValueError):
    """Raised when a historical backtest asks for data outside DB coverage."""


def get_cached_bars(
    symbol: str,
    *,
    timeframe: str,
    start: datetime,
    end: datetime,
) -> list[Bar]:
    with SessionLocal() as db:
        return MarketDataCacheService(db).require_bars(
            symbol,
            timeframe=timeframe,
            start=start,
            end=end,
        )


class MarketDataCacheService:
    def __init__(self, db: Session) -> None:
        self._db = db

    def require_bars(
        self,
        symbol: str,
        *,
        timeframe: str,
        start: datetime,
        end: datetime,
        provider: str | None = None,
        feed: str | None = None,
        adjustment: str | None = None,
    ) -> list[Bar]:
        key = _cache_key(symbol, timeframe, provider, feed, adjustment)
        start_utc = as_utc(start)
        end_utc = as_utc(end)

        coverage = self._coverage(*key)
        if coverage is None or not _coverage_covers(coverage, timeframe, start_utc, end_utc):
            raise _missing(symbol, timeframe, start_utc, end_utc)

        rows = (
            self._db.query(MarketBar)
            .filter(
                MarketBar.provider == key[0],
                MarketBar.feed == key[1],
                MarketBar.timeframe == key[2],
                MarketBar.adjustment == key[3],
                MarketBar.symbol == key[4],
                MarketBar.ts >= start_utc,
                MarketBar.ts <= end_utc,
            )
            .order_by(MarketBar.ts.asc())
            .all()
        )
        if len(rows) < 5:
            raise _missing(symbol, timeframe, start_utc, end_utc)
        if timeframe == "1Min" and _has_intraday_gap(rows):
            raise _missing(symbol, timeframe, start_utc, end_utc)

        return [
            Bar(
                timestamp=as_utc(row.ts).isoformat(),
                open=row.open,
                high=row.high,
                low=row.low,
                close=row.close,
                volume=row.volume,
            )
            for row in rows
        ]

    def _coverage(
        self,
        provider: str,
        feed: str,
        timeframe: str,
        adjustment: str,
        symbol: str,
    ) -> MarketDataCoverage | None:
        return (
            self._db.query(MarketDataCoverage)
            .filter(
                MarketDataCoverage.provider == provider,
                MarketDataCoverage.feed == feed,
                MarketDataCoverage.timeframe == timeframe,
                MarketDataCoverage.adjustment == adjustment,
                MarketDataCoverage.symbol == symbol,
            )
            .one_or_none()
        )


def _cache_key(
    symbol: str,
    timeframe: str,
    provider: str | None,
    feed: str | None,
    adjustment: str | None,
) -> tuple[str, str, str, str, str]:
    return (
        provider or settings.MARKET_DATA_DEFAULT_PROVIDER,
        feed or settings.MARKET_DATA_DEFAULT_FEED,
        timeframe,
        adjustment or settings.MARKET_DATA_DEFAULT_ADJUSTMENT,
        symbol.upper(),
    )


def _coverage_covers(
    coverage: MarketDataCoverage,
    timeframe: str,
    start: datetime,
    end: datetime,
) -> bool:
    if coverage.first_ts is None or coverage.last_ts is None:
        return False
    required = _required_bounds(timeframe, start, end)
    if required is None:
        return False
    first_required, last_required = required
    return (
        as_utc(coverage.first_ts) <= first_required
        and as_utc(coverage.last_ts) >= last_required
        and coverage.row_count > 0
    )


def _required_bounds(
    timeframe: str,
    start: datetime,
    end: datetime,
) -> tuple[datetime, datetime] | None:
    if timeframe != "1Min":
        return start, end

    windows = list(iter_regular_session_windows(start, end, settings.MARKET_TIMEZONE))
    if not windows:
        return None
    first_start = windows[0][0]
    last_end = windows[-1][1]
    return first_start, last_end - timedelta(minutes=1)


def _has_intraday_gap(rows: Sequence[MarketBar]) -> bool:
    zone = ZoneInfo(settings.MARKET_TIMEZONE)
    previous: datetime | None = None
    previous_local_date = None
    for row in rows:
        current = as_utc(row.ts)
        local_date = current.astimezone(zone).date()
        if (
            previous is not None
            and previous_local_date == local_date
            and current - previous > timedelta(minutes=1)
        ):
            return True
        previous = current
        previous_local_date = local_date
    return False


def _missing(symbol: str, timeframe: str, start: datetime, end: datetime) -> MarketDataMissingError:
    return MarketDataMissingError(
        "Market data missing for "
        f"{symbol.upper()} {timeframe} {start.date().isoformat()}..{end.date().isoformat()}; "
        "run ingestion first."
    )
