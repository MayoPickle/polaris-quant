"""Broker abstraction.

Every broker integration implements `BrokerClient`. Business logic (services,
strategy engine, workers) depends only on this interface, never on a concrete
broker — so swapping Alpaca for another broker requires no changes upstream.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Literal

OrderSide = Literal["buy", "sell"]
OrderType = Literal["market", "limit", "stop", "stop_limit"]


@dataclass
class Account:
    cash: float
    equity: float
    buying_power: float


@dataclass
class Position:
    symbol: str
    qty: float
    avg_entry_price: float
    market_value: float
    unrealized_pl: float


@dataclass
class Quote:
    symbol: str
    bid_price: float
    ask_price: float
    last_price: float


@dataclass
class Bar:
    """A single OHLCV candle of market data."""

    timestamp: str
    open: float
    high: float
    low: float
    close: float
    volume: float


@dataclass
class MarketSnapshot:
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


@dataclass
class OrderRequest:
    symbol: str
    side: OrderSide
    qty: float
    order_type: OrderType = "market"
    limit_price: float | None = None
    stop_price: float | None = None
    extended_hours: bool = False
    client_order_id: str | None = None


@dataclass
class OrderResult:
    broker_order_id: str
    symbol: str
    side: OrderSide
    qty: float
    status: str
    filled_qty: float = 0.0
    filled_avg_price: float | None = None
    raw: dict = field(default_factory=dict)


class BrokerClient(ABC):
    """Read + trade interface that every broker integration must provide."""

    # ---- Market data ----
    @abstractmethod
    def is_market_open(self) -> bool: ...

    @abstractmethod
    def get_quote(self, symbol: str) -> Quote: ...

    @abstractmethod
    def get_bars(
        self,
        symbol: str,
        *,
        timeframe: str = "1Day",
        start: datetime | None = None,
        end: datetime | None = None,
    ) -> list[Bar]:
        """Historical OHLCV bars, oldest first."""
        ...

    @abstractmethod
    def get_market_snapshots(self, symbols: list[str]) -> list[MarketSnapshot]:
        """Latest trade, quote, and daily summary data for symbols."""
        ...

    # ---- Account ----
    @abstractmethod
    def get_account(self) -> Account: ...

    @abstractmethod
    def get_positions(self) -> list[Position]: ...

    # ---- Orders ----
    @abstractmethod
    def submit_order(self, request: OrderRequest) -> OrderResult: ...

    @abstractmethod
    def get_order(self, broker_order_id: str) -> OrderResult: ...

    @abstractmethod
    def cancel_order(self, broker_order_id: str) -> None: ...
