"""Pydantic DTOs for orders and positions."""

from __future__ import annotations

from datetime import datetime
import re
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, computed_field, field_validator, model_validator


_SYMBOL_RE = re.compile(r"^[A-Z][A-Z0-9.-]{0,14}$")


class OrderCreate(BaseModel):
    symbol: str
    side: Literal["buy", "sell"]
    qty: float = Field(gt=0)
    order_type: Literal["market", "limit", "stop", "stop_limit"] = "market"
    limit_price: float | None = None
    stop_price: float | None = None
    extended_hours: bool = False

    @field_validator("symbol")
    @classmethod
    def normalize_symbol(cls, value: str) -> str:
        symbol = value.strip().upper()
        if not _SYMBOL_RE.fullmatch(symbol):
            raise ValueError("Enter a valid symbol.")
        return symbol

    @model_validator(mode="after")
    def validate_order_prices(self) -> "OrderCreate":
        if self.limit_price is not None and self.limit_price <= 0:
            raise ValueError("Limit orders require a limit price greater than zero.")
        if self.stop_price is not None and self.stop_price <= 0:
            raise ValueError("Stop orders require a stop price greater than zero.")
        if self.order_type == "limit" and self.limit_price is None:
            raise ValueError("Limit orders require a limit price greater than zero.")
        if self.order_type == "stop" and self.stop_price is None:
            raise ValueError("Stop orders require a stop price greater than zero.")
        if self.order_type == "stop_limit":
            if self.stop_price is None:
                raise ValueError("Stop-limit orders require a stop price greater than zero.")
            if self.limit_price is None:
                raise ValueError("Stop-limit orders require a limit price greater than zero.")
        if self.extended_hours and self.order_type != "limit":
            raise ValueError("Extended-hours orders must be limit orders.")
        return self


class OrderRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    broker_order_id: str | None
    broker_env: Literal["paper", "live"] = "paper"
    created_at: datetime
    strategy_instance_id: int | None
    symbol: str
    side: str
    order_type: str
    qty: float
    limit_price: float | None
    stop_price: float | None
    raw: dict[str, Any] | None = Field(default=None, exclude=True)
    status: str
    filled_qty: float
    filled_avg_price: float | None

    @computed_field
    @property
    def source(self) -> Literal["manual", "automated"]:
        return "automated" if self.strategy_instance_id is not None else "manual"

    @computed_field
    @property
    def extended_hours(self) -> bool:
        return bool((self.raw or {}).get("extended_hours"))


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
    start_date: str | None = None
    end_date: str | None = None
    series: list[MarketBarSeriesRead]


class MarketSnapshotRead(BaseModel):
    symbol: str
    latest_trade_price: float | None = None
    latest_trade_timestamp: str | None = None
    latest_trade_size: float | None = None
    bid_price: float | None = None
    ask_price: float | None = None
    spread: float | None = None
    midpoint_price: float | None = None
    day_open: float | None = None
    day_high: float | None = None
    day_low: float | None = None
    day_close: float | None = None
    day_volume: float | None = None
    previous_close: float | None = None


class MarketSnapshotsRead(BaseModel):
    snapshots: list[MarketSnapshotRead]


class AccountRead(BaseModel):
    cash: float
    equity: float
    buying_power: float
