"""Market data: quotes, historical bars, and clock."""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
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
    timeframe: Literal["1Min", "1Hour", "1Day"] = "1Day",
    lookback_days: int = Query(90, ge=1, le=365),
    broker: BrokerClient = Depends(get_broker_client),
) -> MarketBarsRead:
    normalized = _normalize_symbols(symbols)
    start, end = _bars_window(lookback_days)
    series: list[MarketBarSeriesRead] = []

    for symbol in normalized:
        try:
            bars = broker.get_bars(symbol, timeframe=timeframe, start=start, end=end)
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(502, f"Could not fetch market data for {symbol}: {exc}") from exc
        series.append(
            MarketBarSeriesRead(
                symbol=symbol,
                bars=[MarketBarRead(**bar.__dict__) for bar in bars],
            )
        )

    return MarketBarsRead(timeframe=timeframe, lookback_days=lookback_days, series=series)


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
    end = datetime.now(timezone.utc) - timedelta(minutes=20)
    return end - timedelta(days=lookback_days), end


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
