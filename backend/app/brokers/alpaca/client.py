"""Alpaca implementation of `BrokerClient`, backed by the official alpaca-py SDK.

Maps Alpaca SDK objects to the broker-agnostic dataclasses in `brokers.base`.
Uses paper or live based on the `paper` flag; market data uses the configured
feed (IEX is free, SIP requires a subscription).
"""

from __future__ import annotations

from datetime import datetime
import time

from app.brokers.base import (
    Account,
    Bar,
    BrokerClient,
    OrderRequest,
    OrderResult,
    Position,
    Quote,
)
from app.brokers.alpaca.rate_limit import (
    RetryConfig,
    SharedRateLimiter,
    is_rate_limit_error,
    retry_delay_for,
)
from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

_MARKET_DATA_LIMITER = SharedRateLimiter(settings.ALPACA_DATA_RATE_LIMIT_PER_MINUTE)


class AlpacaClient(BrokerClient):
    def __init__(self, api_key: str, api_secret: str, paper: bool = True) -> None:
        # Imported lazily so the rest of the app loads even if alpaca-py isn't
        # installed yet (e.g. during early scaffolding).
        from alpaca.data.historical import StockHistoricalDataClient
        from alpaca.trading.client import TradingClient

        self._trading = TradingClient(api_key, api_secret, paper=paper)
        self._data = StockHistoricalDataClient(api_key, api_secret)
        self._feed = settings.ALPACA_DATA_FEED

    # ---- Market data ----
    def is_market_open(self) -> bool:
        return bool(self._trading.get_clock().is_open)

    def get_quote(self, symbol: str) -> Quote:
        from alpaca.data.requests import StockLatestQuoteRequest

        req = StockLatestQuoteRequest(symbol_or_symbols=symbol, feed=self._feed)
        quotes = self._call_market_data(
            f"latest quote for {symbol}",
            lambda: self._data.get_stock_latest_quote(req),
        )
        q = quotes[symbol]
        bid, ask = float(q.bid_price), float(q.ask_price)
        return Quote(
            symbol=symbol,
            bid_price=bid,
            ask_price=ask,
            last_price=(bid + ask) / 2 if bid and ask else (bid or ask),
        )

    _TIMEFRAMES = {"1Min": "Minute", "1Hour": "Hour", "1Day": "Day"}

    def get_bars(
        self,
        symbol: str,
        *,
        timeframe: str = "1Day",
        start: datetime | None = None,
        end: datetime | None = None,
    ) -> list[Bar]:
        from alpaca.data.requests import StockBarsRequest
        from alpaca.data.timeframe import TimeFrame

        tf = getattr(TimeFrame, self._TIMEFRAMES.get(timeframe, "Day"))
        req = StockBarsRequest(
            symbol_or_symbols=symbol,
            timeframe=tf,
            start=start,
            end=end,
            feed=self._feed,
        )
        bar_set = self._call_market_data(
            f"historical bars for {symbol}",
            lambda: self._data.get_stock_bars(req),
        )
        rows = bar_set.data.get(symbol, [])
        return [
            Bar(
                timestamp=b.timestamp.isoformat(),
                open=float(b.open),
                high=float(b.high),
                low=float(b.low),
                close=float(b.close),
                volume=float(b.volume),
            )
            for b in rows
        ]

    def _call_market_data(self, operation: str, call):
        _MARKET_DATA_LIMITER.configure(settings.ALPACA_DATA_RATE_LIMIT_PER_MINUTE)
        retry_config = RetryConfig(
            max_retries=max(0, settings.ALPACA_DATA_MAX_RETRIES),
            base_delay_seconds=max(0.0, settings.ALPACA_DATA_RETRY_BASE_SECONDS),
            max_delay_seconds=max(0.0, settings.ALPACA_DATA_RETRY_MAX_SECONDS),
        )

        for attempt in range(retry_config.max_retries + 1):
            _MARKET_DATA_LIMITER.wait()
            try:
                return call()
            except Exception as exc:
                if not is_rate_limit_error(exc) or attempt >= retry_config.max_retries:
                    raise

                delay = retry_delay_for(exc, attempt=attempt, config=retry_config)
                logger.warning(
                    "Alpaca market data rate limited during %s; retrying in %.1fs "
                    "(attempt %s/%s)",
                    operation,
                    delay,
                    attempt + 1,
                    retry_config.max_retries,
                )
                time.sleep(delay)

        raise RuntimeError(f"Alpaca market data call did not return: {operation}")

    # ---- Account ----
    def get_account(self) -> Account:
        a = self._trading.get_account()
        return Account(
            cash=float(a.cash),
            equity=float(a.equity),
            buying_power=float(a.buying_power),
        )

    def get_positions(self) -> list[Position]:
        out: list[Position] = []
        for p in self._trading.get_all_positions():
            out.append(
                Position(
                    symbol=p.symbol,
                    qty=float(p.qty),
                    avg_entry_price=float(p.avg_entry_price),
                    market_value=float(p.market_value),
                    unrealized_pl=float(p.unrealized_pl),
                )
            )
        return out

    # ---- Orders ----
    def submit_order(self, request: OrderRequest) -> OrderResult:
        from alpaca.trading.enums import OrderSide, TimeInForce
        from alpaca.trading.requests import LimitOrderRequest, MarketOrderRequest

        side = OrderSide.BUY if request.side == "buy" else OrderSide.SELL
        if request.order_type == "limit":
            order_req = LimitOrderRequest(
                symbol=request.symbol,
                qty=request.qty,
                side=side,
                time_in_force=TimeInForce.DAY,
                limit_price=request.limit_price,
                client_order_id=request.client_order_id,
            )
        else:
            order_req = MarketOrderRequest(
                symbol=request.symbol,
                qty=request.qty,
                side=side,
                time_in_force=TimeInForce.DAY,
                client_order_id=request.client_order_id,
            )
        o = self._trading.submit_order(order_req)
        return self._to_result(o)

    def get_order(self, broker_order_id: str) -> OrderResult:
        o = self._trading.get_order_by_id(broker_order_id)
        return self._to_result(o)

    def cancel_order(self, broker_order_id: str) -> None:
        self._trading.cancel_order_by_id(broker_order_id)

    @staticmethod
    def _to_result(o) -> OrderResult:
        return OrderResult(
            broker_order_id=str(o.id),
            symbol=o.symbol,
            side="buy" if str(o.side).lower().endswith("buy") else "sell",
            qty=float(o.qty),
            status=str(o.status).split(".")[-1].lower(),
            filled_qty=float(o.filled_qty or 0),
            filled_avg_price=float(o.filled_avg_price) if o.filled_avg_price else None,
            raw={"id": str(o.id)},
        )
