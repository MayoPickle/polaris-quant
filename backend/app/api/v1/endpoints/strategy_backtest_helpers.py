"""Shared helpers for strategy backtest endpoints."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import HTTPException

from app.schemas.strategy import PositionSizingConfig
from app.strategies import registry
from app.strategies.backtest import BacktestResult, run_backtest
from app.strategies.position_sizing import normalize_position_sizing


def backtest_window(lookback_days: int) -> tuple[datetime, datetime]:
    # Free data feed: skip the most recent bars to avoid the SIP delay window.
    end = datetime.now(timezone.utc) - timedelta(minutes=20)
    return end - timedelta(days=lookback_days), end


def resolve_position_sizing(
    config: PositionSizingConfig | None,
    position_size_pct: float,
    *,
    universe_size: int | None = None,
) -> dict:
    raw = config.model_dump() if config is not None else None
    try:
        return normalize_position_sizing(
            raw,
            fallback_position_size_pct=position_size_pct,
            universe_size=universe_size,
        )
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


def run_one(
    strategy_key: str,
    params: dict,
    symbol: str,
    timeframe: str,
    initial_capital: float,
    position_size_pct: float,
    position_sizing: dict,
    bars,
    label: str | None = None,
) -> BacktestResult:
    try:
        strategy = registry.create_strategy(strategy_key, params)
    except KeyError:
        raise HTTPException(400, f"Unknown strategy: {strategy_key!r}") from None
    if len(bars) < 5:
        raise HTTPException(422, f"Not enough historical data for {symbol} to backtest.")
    result = run_backtest(
        strategy,
        symbol,
        bars,
        timeframe=timeframe,
        initial_capital=initial_capital,
        position_size_pct=position_size_pct,
        position_sizing=position_sizing,
    )
    result.label = label
    return result
