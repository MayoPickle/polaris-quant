"""RQ job for batch backtests."""

from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone

from rq.exceptions import StopRequested
from rq.timeouts import JobTimeoutException
from sqlalchemy.orm import Session

from app.brokers.factory import get_broker
from app.core.config import settings
from app.core.logging import get_logger
from app.db.session import SessionLocal
from app.models.backtest import BacktestJob, BacktestJobResult
from app.services.backtest_batch_service import (
    build_batch_summary,
    failed_result,
    result_from_backtest,
)
from app.strategies import registry
from app.strategies.backtest import run_backtest

logger = get_logger(__name__)
WORKER_CONTROL_EXCEPTIONS = (JobTimeoutException, StopRequested)


def run_batch_backtest_job(job_id: str) -> None:
    try:
        _run_batch_backtest_job(job_id)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Batch backtest job %s failed", job_id)
        with SessionLocal() as db:
            job = db.get(BacktestJob, job_id)
            if job:
                job.status = "failed"
                job.error = str(exc)
                job.current_symbol = None
                job.ended_at = datetime.now(timezone.utc)
                db.commit()


def _run_batch_backtest_job(job_id: str) -> None:
    registry.load_builtin_strategies()
    broker = get_broker("alpaca")

    with SessionLocal() as db:
        job = db.get(BacktestJob, job_id)
        if job is None:
            logger.warning("Batch backtest job %s not found", job_id)
            return
        if job.status == "cancelled":
            return

        job.status = "running"
        job.started_at = datetime.now(timezone.utc)
        job.error = None
        db.commit()

    start, end = _backtest_window(_load_job(job_id).lookback_days)

    for symbol in _load_job(job_id).symbols:
        with SessionLocal() as db:
            job = db.get(BacktestJob, job_id)
            if job is None or job.status == "cancelled":
                _mark_cancelled(db, job) if job else None
                return
            job.current_symbol = symbol
            db.commit()

        try:
            bars = broker.get_bars(symbol, timeframe=_load_job(job_id).timeframe, start=start, end=end)
            job_snapshot = _load_job(job_id)
            if len(bars) < 5:
                raise ValueError(f"Not enough historical data for {symbol} to backtest.")
            strategy = registry.create_strategy(job_snapshot.strategy_key, job_snapshot.params)
            result = run_backtest(
                strategy,
                symbol,
                bars,
                timeframe=job_snapshot.timeframe,
                initial_capital=job_snapshot.initial_capital,
                position_size_pct=job_snapshot.position_size_pct,
                position_sizing=job_snapshot.position_sizing,
            )
            row = result_from_backtest(job_id, result)
        except WORKER_CONTROL_EXCEPTIONS:
            raise
        except Exception as exc:  # noqa: BLE001
            logger.warning("Batch backtest %s failed for %s: %s", job_id, symbol, exc)
            row = failed_result(job_id, symbol, str(exc))

        with SessionLocal() as db:
            job = db.get(BacktestJob, job_id)
            if job is None:
                return
            _replace_result(db, row)
            job.completed_symbols += 1
            if row.status == "completed":
                job.succeeded_symbols += 1
            else:
                job.failed_symbols += 1
            job.current_symbol = None
            db.commit()

        if settings.BACKTEST_SYMBOL_THROTTLE_SECONDS > 0:
            time.sleep(settings.BACKTEST_SYMBOL_THROTTLE_SECONDS)

    with SessionLocal() as db:
        job = db.get(BacktestJob, job_id)
        if job is None:
            return
        if job.status == "cancelled":
            _mark_cancelled(db, job)
            return
        results = (
            db.query(BacktestJobResult)
            .filter(BacktestJobResult.job_id == job_id)
            .order_by(BacktestJobResult.symbol)
            .all()
        )
        job.status = "completed"
        job.report = build_batch_summary(job, results)
        job.current_symbol = None
        job.ended_at = datetime.now(timezone.utc)
        db.commit()


def _load_job(job_id: str) -> BacktestJob:
    with SessionLocal() as db:
        job = db.get(BacktestJob, job_id)
        if job is None:
            raise RuntimeError(f"Batch backtest job {job_id} not found")
        # Detach all scalar/JSON fields the worker needs outside this session.
        db.expunge(job)
        return job


def _replace_result(db: Session, row: BacktestJobResult) -> None:
    existing = (
        db.query(BacktestJobResult)
        .filter(BacktestJobResult.job_id == row.job_id, BacktestJobResult.symbol == row.symbol)
        .one_or_none()
    )
    if existing:
        existing.status = row.status
        existing.error = row.error
        existing.final_equity = row.final_equity
        existing.total_return_pct = row.total_return_pct
        existing.buy_hold_return_pct = row.buy_hold_return_pct
        existing.alpha_return_pct = row.alpha_return_pct
        existing.num_trades = row.num_trades
        existing.win_rate_pct = row.win_rate_pct
        existing.max_drawdown_pct = row.max_drawdown_pct
        existing.sharpe = row.sharpe
        existing.equity_curve = row.equity_curve
        existing.trades = row.trades
    else:
        db.add(row)


def _mark_cancelled(db: Session, job: BacktestJob) -> None:
    job.status = "cancelled"
    job.current_symbol = None
    job.ended_at = datetime.now(timezone.utc)
    db.commit()


def _backtest_window(lookback_days: int) -> tuple[datetime, datetime]:
    end = datetime.now(timezone.utc) - timedelta(minutes=20)
    return end - timedelta(days=lookback_days), end
