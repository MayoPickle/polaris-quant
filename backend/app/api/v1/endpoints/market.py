"""Market data: quotes, historical bars, and clock."""

from __future__ import annotations

import re
from datetime import date, datetime, time, timedelta, timezone
import math
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.deps import get_broker_client
from app.brokers.base import BrokerClient, MarketSnapshot
from app.schemas.order import (
    MarketBarRead,
    MarketBarsRead,
    MarketBarSeriesRead,
    MarketSnapshotRead,
    MarketSnapshotsRead,
    QuoteRead,
)

router = APIRouter()

_SYMBOL_RE = re.compile(r"^[A-Z][A-Z0-9.-]{0,14}$")
_MAX_SNAPSHOT_SYMBOLS = 20
_DELAYED_DATA_MINUTES = 20
_MINUTE_RANGE_DAYS = 1
_HOURLY_RANGE_DAYS = 7


@router.get("/clock")
def market_clock(broker: BrokerClient = Depends(get_broker_client)) -> dict:
    return {"is_open": broker.is_market_open()}


@router.get("/quote/{symbol}", response_model=QuoteRead)
def get_quote(symbol: str, broker: BrokerClient = Depends(get_broker_client)) -> QuoteRead:
    q = broker.get_quote(symbol.upper())
    return QuoteRead(
        symbol=q.symbol,
        bid_price=q.bid_price,
        ask_price=q.ask_price,
        last_price=q.last_price,
    )


@router.get("/bars", response_model=MarketBarsRead)
def get_bars(
    symbols: str = Query(..., min_length=1),
    timeframe: Literal["1Min", "1Hour", "1Day"] | None = None,
    lookback_days: int = Query(90, ge=1, le=365),
    start_date: date | None = None,
    end_date: date | None = None,
    broker: BrokerClient = Depends(get_broker_client),
) -> MarketBarsRead:
    normalized = _normalize_symbols(symbols)
    start, end, window_days = _bars_window_for_request(
        lookback_days=lookback_days,
        start_date=start_date,
        end_date=end_date,
    )
    resolved_timeframe = timeframe or (
        _auto_timeframe(window_days) if start_date and end_date else "1Day"
    )
    series: list[MarketBarSeriesRead] = []

    for symbol in normalized:
        try:
            bars = broker.get_bars(symbol, timeframe=resolved_timeframe, start=start, end=end)
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(502, f"Could not fetch market data for {symbol}: {exc}") from exc
        series.append(
            MarketBarSeriesRead(
                symbol=symbol,
                bars=[MarketBarRead(**bar.__dict__) for bar in bars],
            )
        )

    return MarketBarsRead(
        timeframe=resolved_timeframe,
        lookback_days=window_days,
        start_date=start.date().isoformat(),
        end_date=(end_date.isoformat() if end_date else end.date().isoformat()),
        series=series,
    )


@router.get("/snapshots", response_model=MarketSnapshotsRead)
def get_snapshots(
    symbols: str = Query(..., min_length=1),
    broker: BrokerClient = Depends(get_broker_client),
) -> MarketSnapshotsRead:
    normalized = _normalize_symbols(symbols)
    if len(normalized) > _MAX_SNAPSHOT_SYMBOLS:
        raise HTTPException(422, f"At most {_MAX_SNAPSHOT_SYMBOLS} symbols are supported.")

    try:
        snapshots = broker.get_market_snapshots(normalized)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, f"Could not fetch market snapshots: {exc}") from exc

    return MarketSnapshotsRead(
        snapshots=[_snapshot_read(snapshot) for snapshot in snapshots]
    )


def _normalize_symbols(symbols: str) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for raw_symbol in symbols.split(","):
        symbol = raw_symbol.strip().upper()
        if not symbol:
            continue
        if not _SYMBOL_RE.fullmatch(symbol):
            raise HTTPException(422, f"Invalid symbol: {raw_symbol.strip()!r}")
        if symbol not in seen:
            seen.add(symbol)
            out.append(symbol)

    if not out:
        raise HTTPException(422, "At least one symbol is required.")
    return out


def _bars_window(lookback_days: int) -> tuple[datetime, datetime]:
    # Free data feed: skip the most recent bars to avoid the SIP delay window.
    end = datetime.now(timezone.utc) - timedelta(minutes=_DELAYED_DATA_MINUTES)
    return end - timedelta(days=lookback_days), end


def _bars_window_for_request(
    *,
    lookback_days: int,
    start_date: date | None,
    end_date: date | None,
) -> tuple[datetime, datetime, int]:
    if start_date is None and end_date is None:
        start, end = _bars_window(lookback_days)
        return start, end, lookback_days

    if start_date is None or end_date is None:
        raise HTTPException(422, "Both start_date and end_date are required.")
    if start_date > end_date:
        raise HTTPException(422, "start_date must be on or before end_date.")

    delayed_now = datetime.now(timezone.utc) - timedelta(minutes=_DELAYED_DATA_MINUTES)
    if end_date > delayed_now.date():
        raise HTTPException(422, "end_date cannot be in the future.")

    start = datetime.combine(start_date, time.min, tzinfo=timezone.utc)
    requested_end = datetime.combine(
        end_date + timedelta(days=1),
        time.min,
        tzinfo=timezone.utc,
    )
    end = min(requested_end, delayed_now)
    if start >= end:
        raise HTTPException(422, "Date range does not contain available market time.")

    return start, end, (end_date - start_date).days + 1


def _auto_timeframe(window_days: int) -> Literal["1Min", "1Hour", "1Day"]:
    if window_days <= _MINUTE_RANGE_DAYS:
        return "1Min"
    if window_days <= _HOURLY_RANGE_DAYS:
        return "1Hour"
    return "1Day"


def _snapshot_read(snapshot: MarketSnapshot) -> MarketSnapshotRead:
    bid = _positive_number(snapshot.bid_price)
    ask = _positive_number(snapshot.ask_price)
    if bid is not None and ask is not None and ask < bid:
        bid = None
        ask = None

    spread = None
    midpoint = None
    if bid is not None and ask is not None:
        spread = ask - bid
        midpoint = (bid + ask) / 2

    day_low = _positive_number(snapshot.day_low)
    day_high = _positive_number(snapshot.day_high)
    if day_low is not None and day_high is not None and day_high < day_low:
        day_low = None
        day_high = None

    return MarketSnapshotRead(
        symbol=snapshot.symbol,
        latest_trade_price=_positive_number(snapshot.latest_trade_price),
        latest_trade_timestamp=snapshot.latest_trade_timestamp,
        latest_trade_size=_positive_number(snapshot.latest_trade_size),
        bid_price=bid,
        ask_price=ask,
        spread=spread,
        midpoint_price=midpoint,
        day_open=_positive_number(snapshot.day_open),
        day_high=day_high,
        day_low=day_low,
        day_close=_positive_number(snapshot.day_close),
        day_volume=_non_negative_number(snapshot.day_volume),
        previous_close=_positive_number(snapshot.previous_close),
    )


def _positive_number(value: float | None) -> float | None:
    number = _finite_number(value)
    if number is None or number <= 0:
        return None
    return number


def _non_negative_number(value: float | None) -> float | None:
    number = _finite_number(value)
    if number is None or number < 0:
        return None
    return number


def _finite_number(value: float | None) -> float | None:
    if value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(number):
        return None
    return number
