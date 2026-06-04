"""Pydantic DTOs for orders and positions."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class OrderCreate(BaseModel):
    symbol: str
    side: Literal["buy", "sell"]
    qty: float = Field(gt=0)
    order_type: Literal["market", "limit", "stop", "stop_limit"] = "market"
    limit_price: float | None = None


class OrderRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    broker_order_id: str | None
    symbol: str
    side: str
    order_type: str
    qty: float
    status: str
    filled_qty: float
    filled_avg_price: float | None


class PositionRead(BaseModel):
    symbol: str
    qty: float
    avg_entry_price: float
    market_value: float
    unrealized_pl: float


class QuoteRead(BaseModel):
    symbol: str
    bid_price: float
    ask_price: float
    last_price: float


class MarketBarRead(BaseModel):
    timestamp: str
    open: float
    high: float
    low: float
    close: float
    volume: float


class MarketBarSeriesRead(BaseModel):
    symbol: str
    bars: list[MarketBarRead]


class MarketBarsRead(BaseModel):
    timeframe: str
    lookback_days: int
    series: list[MarketBarSeriesRead]


class AccountRead(BaseModel):
    cash: float
    equity: float
    buying_power: float
