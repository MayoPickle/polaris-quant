"""Strategy catalog + user strategy instances."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, Header, HTTPException
from apscheduler.triggers.cron import CronTrigger
from rq.job import Job
from sqlalchemy.orm import Session

from app.api.deps import get_broker_client, get_current_user_id
from app.brokers.base import BrokerClient
from app.core.config import settings
from app.core.i18n import negotiate_locale
from app.db.session import get_db
from app.models.backtest import BacktestJob, BacktestJobResult
from app.models.strategy import StrategyInstance
from app.schemas.strategy import (
    BatchBacktestJobRead,
    BatchBacktestReportRead,
    BatchBacktestRequest,
    BatchBacktestSymbolResult,
    BacktestUniverseRead,
    BacktestCompareRequest,
    BacktestCompareResult,
    BacktestRequest,
    BacktestResultRead,
    PositionSizingConfig,
    StrategyDescriptor,
    StrategyInstanceCreate,
    StrategyInstanceRead,
    StrategyInstanceUpdate,
)
from app.services.backtest_batch_service import (
    build_batch_summary,
    list_universes,
    resolve_batch_symbols,
)
from app.strategies import registry
from app.strategies.backtest import BacktestResult, run_backtest
from app.strategies.metadata_i18n import localized_strategy_metadata
from app.strategies.position_sizing import (
    normalize_position_sizing,
    position_sizing_summary_pct,
)
from app.workers.queue import enqueue_batch_backtest, get_redis_connection

router = APIRouter()


@router.get("/available", response_model=list[StrategyDescriptor])
def list_available_strategies(
    accept_language: str | None = Header(default=None),
) -> list[StrategyDescriptor]:
    """Strategies the user can pick from, with their parameter schema."""
    locale = negotiate_locale(accept_language)
    return [
        _strategy_descriptor(cls, locale)
        for cls in registry.list_strategies()
    ]


def _strategy_descriptor(cls, locale: str) -> StrategyDescriptor:
    name, description, param_schema = localized_strategy_metadata(cls, locale)
    return StrategyDescriptor(
        key=cls.key,
        name=name,
        description=description,
        param_schema=param_schema,
    )


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
    _validate_strategy_payload(
        payload.strategy_key,
        symbols=payload.symbols,
        schedule=payload.schedule,
        is_active=payload.is_active,
        live_confirmed=payload.live_confirmed,
    )

    data = payload.model_dump(exclude={"live_confirmed"})
    if data["is_active"] and not data["schedule"]:
        data["schedule"] = settings.DEFAULT_STRATEGY_SCHEDULE
    data["symbols"] = _normalize_symbols(data["symbols"])

    instance = StrategyInstance(user_id=user_id, **data)
    db.add(instance)
    db.commit()
    db.refresh(instance)
    return instance


@router.patch("/{instance_id}", response_model=StrategyInstanceRead)
def update_instance(
    instance_id: int,
    payload: StrategyInstanceUpdate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> StrategyInstance:
    instance = _get_instance(db, user_id, instance_id)
    next_strategy_key = instance.strategy_key
    next_symbols = payload.symbols if payload.symbols is not None else instance.symbols
    next_schedule = payload.schedule if payload.schedule is not None else instance.schedule
    next_is_active = payload.is_active if payload.is_active is not None else instance.is_active

    _validate_strategy_payload(
        next_strategy_key,
        symbols=next_symbols,
        schedule=next_schedule,
        is_active=next_is_active,
        live_confirmed=payload.live_confirmed,
    )

    if payload.name is not None:
        instance.name = payload.name
    if payload.params is not None:
        instance.params = payload.params
    if payload.symbols is not None:
        instance.symbols = _normalize_symbols(payload.symbols)
    if payload.schedule is not None:
        instance.schedule = payload.schedule
    if payload.is_active is not None:
        instance.is_active = payload.is_active
        if payload.is_active and not instance.schedule:
            instance.schedule = settings.DEFAULT_STRATEGY_SCHEDULE
        if payload.is_active:
            instance.last_error = None

    db.commit()
    db.refresh(instance)
    return instance


def _validate_strategy_payload(
    strategy_key: str,
    *,
    symbols: list[str],
    schedule: str,
    is_active: bool,
    live_confirmed: bool,
) -> None:
    try:
        registry.get_strategy_class(strategy_key)
    except KeyError:
        raise HTTPException(400, f"Unknown strategy: {strategy_key!r}")

    if not is_active:
        return
    if settings.ALPACA_ENV == "live" and not live_confirmed:
        raise HTTPException(400, "Type LIVE to confirm live automated trading.")
    if not _normalize_symbols(symbols):
        raise HTTPException(422, "Active strategies require at least one symbol.")
    try:
        CronTrigger.from_crontab(schedule or settings.DEFAULT_STRATEGY_SCHEDULE)
    except ValueError as exc:
        raise HTTPException(422, f"Invalid cron schedule: {exc}") from exc


def _normalize_symbols(symbols: list[str]) -> list[str]:
    return sorted({s.strip().upper() for s in symbols if s.strip()})


def _get_instance(db: Session, user_id: int, instance_id: int) -> StrategyInstance:
    instance = (
        db.query(StrategyInstance)
        .filter(StrategyInstance.id == instance_id, StrategyInstance.user_id == user_id)
        .one_or_none()
    )
    if instance is None:
        raise HTTPException(404, "Strategy instance not found.")
    return instance


def _backtest_window(lookback_days: int) -> tuple[datetime, datetime]:
    # Free data feed: skip the most recent bars to avoid the SIP delay window.
    end = datetime.now(timezone.utc) - timedelta(minutes=20)
    return end - timedelta(days=lookback_days), end


def _resolve_position_sizing(
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
        raise HTTPException(422, str(exc))


def _run_one(
    broker: BrokerClient,
    *,
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
        raise HTTPException(400, f"Unknown strategy: {strategy_key!r}")
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
        position_size_pct=payload.position_size_pct,
        position_sizing=_resolve_position_sizing(
            payload.position_sizing,
            payload.position_size_pct,
        ),
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
            position_size_pct=payload.position_size_pct,
            position_sizing=_resolve_position_sizing(
                payload.position_sizing,
                payload.position_size_pct,
            ),
            bars=bars_cache[symbol],
            label=run.label,
        )
        results.append(BacktestResultRead(**result.__dict__))

    return BacktestCompareResult(results=results)


@router.get("/backtest/universes", response_model=list[BacktestUniverseRead])
def backtest_universes(
    accept_language: str | None = Header(default=None),
) -> list[BacktestUniverseRead]:
    locale = negotiate_locale(accept_language)
    return [BacktestUniverseRead(**u) for u in list_universes(locale)]


@router.post("/backtest/batch", response_model=BatchBacktestJobRead, status_code=201)
def create_batch_backtest(
    payload: BatchBacktestRequest,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> BacktestJob:
    try:
        registry.get_strategy_class(payload.strategy_key)
    except KeyError:
        raise HTTPException(400, f"Unknown strategy: {payload.strategy_key!r}")

    try:
        symbols = resolve_batch_symbols(
            db,
            imported_symbols=payload.symbols,
            symbols_text=payload.symbols_text,
            universe_keys=payload.universes,
        )
    except ValueError as exc:
        raise HTTPException(422, str(exc))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, f"Could not resolve universe symbols: {exc}")

    position_sizing = _resolve_position_sizing(
        payload.position_sizing,
        payload.position_size_pct,
        universe_size=len(symbols),
    )

    job = BacktestJob(
        id=str(uuid4()),
        user_id=user_id,
        strategy_key=payload.strategy_key,
        params=payload.params,
        timeframe=payload.timeframe,
        lookback_days=payload.lookback_days,
        initial_capital=payload.initial_capital,
        position_size_pct=position_sizing_summary_pct(position_sizing),
        position_sizing=position_sizing,
        universes=payload.universes,
        symbols=symbols,
        total_symbols=len(symbols),
        status="queued",
        report={},
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    try:
        job.rq_job_id = enqueue_batch_backtest(job.id)
    except Exception as exc:  # noqa: BLE001
        job.status = "failed"
        job.error = f"Could not enqueue batch backtest: {exc}"
        db.commit()
        db.refresh(job)
        raise HTTPException(503, job.error)

    db.commit()
    db.refresh(job)
    return job


@router.get("/backtest/batch/latest", response_model=BatchBacktestJobRead | None)
def get_latest_batch_backtest(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> BacktestJob | None:
    return (
        db.query(BacktestJob)
        .filter(BacktestJob.user_id == user_id)
        .order_by(BacktestJob.created_at.desc(), BacktestJob.id.desc())
        .first()
    )


@router.get("/backtest/batch/{job_id}", response_model=BatchBacktestJobRead)
def get_batch_backtest(
    job_id: str,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> BacktestJob:
    return _get_batch_job(db, user_id, job_id)


@router.get("/backtest/batch/{job_id}/report", response_model=BatchBacktestReportRead)
def get_batch_backtest_report(
    job_id: str,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> BatchBacktestReportRead:
    job = _get_batch_job(db, user_id, job_id)
    rows = (
        db.query(BacktestJobResult)
        .filter(BacktestJobResult.job_id == job.id)
        .order_by(BacktestJobResult.symbol)
        .all()
    )
    summary = job.report or build_batch_summary(job, rows)
    return BatchBacktestReportRead(
        job=BatchBacktestJobRead.model_validate(job),
        summary=summary,
        results=[BatchBacktestSymbolResult.model_validate(row) for row in rows],
    )


@router.delete("/backtest/batch/{job_id}", response_model=BatchBacktestJobRead)
def cancel_batch_backtest(
    job_id: str,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> BacktestJob:
    job = _get_batch_job(db, user_id, job_id)
    if job.status in {"completed", "failed", "cancelled"}:
        return job

    job.status = "cancelled"
    job.current_symbol = None
    job.ended_at = datetime.now(timezone.utc)
    db.commit()

    try:
        rq_job = Job.fetch(job.rq_job_id or job.id, connection=get_redis_connection())
        rq_job.cancel()
    except Exception:  # noqa: BLE001
        pass

    db.refresh(job)
    return job


def _get_batch_job(db: Session, user_id: int, job_id: str) -> BacktestJob:
    job = (
        db.query(BacktestJob)
        .filter(BacktestJob.id == job_id, BacktestJob.user_id == user_id)
        .one_or_none()
    )
    if job is None:
        raise HTTPException(404, "Batch backtest job not found.")
    return job
