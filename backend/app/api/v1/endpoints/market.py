"""Market data: quotes, historical bars, and clock."""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.deps import get_broker_client
from app.brokers.base import BrokerClient
from app.schemas.order import MarketBarRead, MarketBarsRead, MarketBarSeriesRead, QuoteRead

router = APIRouter()

_SYMBOL_RE = re.compile(r"^[A-Z][A-Z0-9.-]{0,14}$")


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
