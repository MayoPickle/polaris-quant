"""Single and comparison strategy backtest endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.strategy import (
    BacktestCompareRequest,
    BacktestCompareResult,
    BacktestRequest,
    BacktestResultRead,
)
from app.services.market_data_cache import MarketDataCacheService, MarketDataMissingError
from app.api.v1.endpoints.strategy_backtest_helpers import (
    backtest_window,
    resolve_position_sizing,
    run_one,
)

router = APIRouter()


@router.post("/backtest", response_model=BacktestResultRead)
def backtest(
    payload: BacktestRequest,
    db: Session = Depends(get_db),
) -> BacktestResultRead:
    symbol = payload.symbol.upper()
    start, end = backtest_window(payload.lookback_days)
    try:
        bars = MarketDataCacheService(db).require_bars(
            symbol,
            timeframe=payload.timeframe,
            start=start,
            end=end,
        )
    except MarketDataMissingError as exc:
        raise HTTPException(422, str(exc)) from exc

    result = run_one(
        strategy_key=payload.strategy_key,
        params=payload.params,
        symbol=symbol,
        timeframe=payload.timeframe,
        initial_capital=payload.initial_capital,
        position_size_pct=payload.position_size_pct,
        position_sizing=resolve_position_sizing(
            payload.position_sizing,
            payload.position_size_pct,
        ),
        bars=bars,
    )
    return BacktestResultRead(**result.__dict__)


@router.post("/backtest/compare", response_model=BacktestCompareResult)
def backtest_compare(
    payload: BacktestCompareRequest,
    db: Session = Depends(get_db),
) -> BacktestCompareResult:
    start, end = backtest_window(payload.lookback_days)
    bars_cache: dict[str, list] = {}
    results: list[BacktestResultRead] = []

    for run in payload.runs:
        symbol = run.symbol.upper()
        if symbol not in bars_cache:
            try:
                bars_cache[symbol] = MarketDataCacheService(db).require_bars(
                    symbol,
                    timeframe=payload.timeframe,
                    start=start,
                    end=end,
                )
            except MarketDataMissingError as exc:
                raise HTTPException(422, str(exc)) from exc

        result = run_one(
            strategy_key=run.strategy_key,
            params=run.params,
            symbol=symbol,
            timeframe=payload.timeframe,
            initial_capital=payload.initial_capital,
            position_size_pct=payload.position_size_pct,
            position_sizing=resolve_position_sizing(
                payload.position_sizing,
                payload.position_size_pct,
            ),
            bars=bars_cache[symbol],
            label=run.label,
        )
        results.append(BacktestResultRead(**result.__dict__))

    return BacktestCompareResult(results=results)
