"""Alpaca market-data provider used by cache ingestion."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from app.brokers.alpaca.rate_limit import (
    RetryConfig,
    SharedRateLimiter,
    is_rate_limit_error,
    retry_delay_for,
)
from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

_LIMITER = SharedRateLimiter(settings.ALPACA_DATA_RATE_LIMIT_PER_MINUTE)


@dataclass(frozen=True)
class ProviderAsset:
    symbol: str
    asset_id: str
    name: str
    asset_class: str
    exchange: str
    status: str
    tradable: bool
    marginable: bool
    shortable: bool
    easy_to_borrow: bool
    raw: dict


@dataclass(frozen=True)
class ProviderBar:
    symbol: str
    ts: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float
    trade_count: int | None
    vwap: float | None


class AlpacaMarketDataProvider:
    def __init__(self, api_key: str | None = None, api_secret: str | None = None) -> None:
        from alpaca.data.historical import StockHistoricalDataClient
        from alpaca.trading.client import TradingClient

        self._data = StockHistoricalDataClient(
            api_key or settings.ALPACA_API_KEY,
            api_secret or settings.ALPACA_API_SECRET,
        )
        self._trading = TradingClient(
            api_key or settings.ALPACA_API_KEY,
            api_secret or settings.ALPACA_API_SECRET,
            paper=settings.is_paper,
        )

    def list_us_equity_assets(self) -> list[ProviderAsset]:
        from alpaca.trading.enums import AssetClass
        from alpaca.trading.requests import GetAssetsRequest

        req = GetAssetsRequest(asset_class=AssetClass.US_EQUITY)
        assets = self._call("list assets", lambda: self._trading.get_all_assets(req))
        return [_to_provider_asset(asset) for asset in assets if _asset_symbol(asset)]

    def get_bars(
        self,
        symbols: list[str],
        *,
        timeframe: str,
        start: datetime,
        end: datetime,
        feed: str,
        adjustment: str,
    ) -> list[ProviderBar]:
        from alpaca.data.enums import Adjustment, DataFeed
        from alpaca.data.requests import StockBarsRequest
        from alpaca.data.timeframe import TimeFrame

        req = StockBarsRequest(
            symbol_or_symbols=symbols,
            timeframe=_timeframe(timeframe, TimeFrame),
            start=start,
            end=end,
            feed=DataFeed(feed),
            adjustment=Adjustment(adjustment),
            limit=10_000,
        )
        bar_set = self._call(
            f"bars {timeframe} {symbols[0]}..{symbols[-1]}",
            lambda: self._data.get_stock_bars(req),
        )
        out: list[ProviderBar] = []
        for symbol, rows in bar_set.data.items():
            out.extend(_to_provider_bar(symbol, row) for row in rows)
        return out

    def _call(self, operation: str, call):
        import time

        _LIMITER.configure(settings.ALPACA_DATA_RATE_LIMIT_PER_MINUTE)
        retry_config = RetryConfig(
            max_retries=max(0, settings.ALPACA_DATA_MAX_RETRIES),
            base_delay_seconds=max(0.0, settings.ALPACA_DATA_RETRY_BASE_SECONDS),
            max_delay_seconds=max(0.0, settings.ALPACA_DATA_RETRY_MAX_SECONDS),
        )
        for attempt in range(retry_config.max_retries + 1):
            _LIMITER.wait()
            try:
                return call()
            except Exception as exc:
                if not is_rate_limit_error(exc) or attempt >= retry_config.max_retries:
                    raise
                delay = retry_delay_for(exc, attempt=attempt, config=retry_config)
                logger.warning(
                    "Alpaca market data rate limited during %s; retrying in %.1fs",
                    operation,
                    delay,
                )
                time.sleep(delay)
        raise RuntimeError(f"Alpaca provider call did not return: {operation}")


def _timeframe(value: str, time_frame):
    return getattr(time_frame, {"1Min": "Minute", "1Hour": "Hour", "1Day": "Day"}.get(value, "Day"))


def _asset_symbol(asset: Any) -> str:
    return str(getattr(asset, "symbol", "") or "").upper()


def _to_provider_asset(asset: Any) -> ProviderAsset:
    raw = _raw(asset)
    return ProviderAsset(
        symbol=_asset_symbol(asset),
        asset_id=str(getattr(asset, "id", "") or ""),
        name=str(getattr(asset, "name", "") or ""),
        asset_class=_enum_value(getattr(asset, "asset_class", "us_equity")),
        exchange=_enum_value(getattr(asset, "exchange", "")),
        status=_enum_value(getattr(asset, "status", "")),
        tradable=bool(getattr(asset, "tradable", False)),
        marginable=bool(getattr(asset, "marginable", False)),
        shortable=bool(getattr(asset, "shortable", False)),
        easy_to_borrow=bool(getattr(asset, "easy_to_borrow", False)),
        raw=raw,
    )


def _to_provider_bar(symbol: str, bar: Any) -> ProviderBar:
    return ProviderBar(
        symbol=symbol.upper(),
        ts=bar.timestamp,
        open=float(bar.open),
        high=float(bar.high),
        low=float(bar.low),
        close=float(bar.close),
        volume=float(bar.volume),
        trade_count=_optional_int(getattr(bar, "trade_count", None)),
        vwap=_optional_float(getattr(bar, "vwap", None)),
    )


def _enum_value(value: Any) -> str:
    return str(getattr(value, "value", value) or "")


def _optional_float(value: Any) -> float | None:
    return float(value) if value is not None else None


def _optional_int(value: Any) -> int | None:
    return int(value) if value is not None else None


def _raw(value: Any) -> dict:
    if hasattr(value, "model_dump"):
        return value.model_dump(mode="json")
    if hasattr(value, "dict"):
        return value.dict()
    return dict(getattr(value, "__dict__", {}))
