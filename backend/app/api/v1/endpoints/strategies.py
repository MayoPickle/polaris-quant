"""Strategy catalog + user strategy instances."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_broker_client, get_current_user_id
from app.brokers.base import BrokerClient
from app.db.session import get_db
from app.models.strategy import StrategyInstance
from app.schemas.strategy import (
    BacktestCompareRequest,
    BacktestCompareResult,
    BacktestRequest,
    BacktestResultRead,
    StrategyDescriptor,
    StrategyInstanceCreate,
    StrategyInstanceRead,
)
from app.strategies import registry
from app.strategies.backtest import BacktestResult, run_backtest

router = APIRouter()


@router.get("/available", response_model=list[StrategyDescriptor])
def list_available_strategies() -> list[StrategyDescriptor]:
    """Strategies the user can pick from, with their parameter schema."""
    return [
        StrategyDescriptor(
            key=cls.key,
            name=cls.name,
            description=cls.description,
            param_schema=cls.param_schema,
        )
        for cls in registry.list_strategies()
    ]


@router.get("", response_model=list[StrategyInstanceRead])
def list_instances(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> list[StrategyInstance]:
    return (
        db.query(StrategyInstance).filter(StrategyInstance.user_id == user_id).all()
    )


@router.post("", response_model=StrategyInstanceRead, status_code=201)
def create_instance(
    payload: StrategyInstanceCreate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> StrategyInstance:
    try:
        registry.get_strategy_class(payload.strategy_key)
    except KeyError:
        raise HTTPException(400, f"Unknown strategy: {payload.strategy_key!r}")

    instance = StrategyInstance(user_id=user_id, **payload.model_dump())
    db.add(instance)
    db.commit()
    db.refresh(instance)
    return instance


def _backtest_window(lookback_days: int) -> tuple[datetime, datetime]:
    # Free data feed: skip the most recent bars to avoid the SIP delay window.
    end = datetime.now(timezone.utc) - timedelta(minutes=20)
    return end - timedelta(days=lookback_days), end


def _run_one(
    broker: BrokerClient,
    *,
    strategy_key: str,
    params: dict,
    symbol: str,
    timeframe: str,
    initial_capital: float,
    bars,
    label: str | None = None,
) -> BacktestResult:
    try:
        strategy = registry.create_strategy(strategy_key, params)
    except KeyError:
        raise HTTPException(400, f"Unknown strategy: {strategy_key!r}")
    if len(bars) < 5:
        raise HTTPException(422, f"Not enough historical data for {symbol} to backtest.")
    result = run_backtest(
        strategy, symbol, bars, timeframe=timeframe, initial_capital=initial_capital
    )
    result.label = label
    return result


@router.post("/backtest", response_model=BacktestResultRead)
def backtest(
    payload: BacktestRequest,
    broker: BrokerClient = Depends(get_broker_client),
) -> BacktestResultRead:
    symbol = payload.symbol.upper()
    start, end = _backtest_window(payload.lookback_days)
    try:
        bars = broker.get_bars(symbol, timeframe=payload.timeframe, start=start, end=end)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, f"Could not fetch market data: {exc}")

    result = _run_one(
        broker,
        strategy_key=payload.strategy_key,
        params=payload.params,
        symbol=symbol,
        timeframe=payload.timeframe,
        initial_capital=payload.initial_capital,
        bars=bars,
    )
    return BacktestResultRead(**result.__dict__)


@router.post("/backtest/compare", response_model=BacktestCompareResult)
def backtest_compare(
    payload: BacktestCompareRequest,
    broker: BrokerClient = Depends(get_broker_client),
) -> BacktestCompareResult:
    start, end = _backtest_window(payload.lookback_days)
    bars_cache: dict[str, list] = {}
    results: list[BacktestResultRead] = []

    for run in payload.runs:
        symbol = run.symbol.upper()
        if symbol not in bars_cache:
            try:
                bars_cache[symbol] = broker.get_bars(
                    symbol, timeframe=payload.timeframe, start=start, end=end
                )
            except Exception as exc:  # noqa: BLE001
                raise HTTPException(502, f"Could not fetch market data for {symbol}: {exc}")

        result = _run_one(
            broker,
            strategy_key=run.strategy_key,
            params=run.params,
            symbol=symbol,
            timeframe=payload.timeframe,
            initial_capital=payload.initial_capital,
            bars=bars_cache[symbol],
            label=run.label,
        )
        results.append(BacktestResultRead(**result.__dict__))

    return BacktestCompareResult(results=results)
