"""RQ job for batch backtests."""

from __future__ import annotations

from concurrent.futures import FIRST_COMPLETED, Future, ThreadPoolExecutor, wait
from dataclasses import dataclass
import time
from datetime import datetime, timedelta, timezone

from rq.exceptions import StopRequested
from rq.timeouts import JobTimeoutException

from app.core.config import settings
from app.core.logging import get_logger
from app.db.session import SessionLocal
from app.models.backtest import BacktestJob, BacktestJobResult
from app.services.backtest_batch_service import (
    build_batch_summary,
    failed_result,
    result_from_backtest,
)
from app.services.market_data_cache import get_cached_bars
from app.strategies import registry
from app.strategies.backtest import run_backtest
from app.workers.jobs.batch_backtest_state import mark_cancelled, replace_result

logger = get_logger(__name__)
WORKER_CONTROL_EXCEPTIONS = (JobTimeoutException, StopRequested)


@dataclass(frozen=True)
class BatchJobSnapshot:
    id: str
    strategy_key: str
    params: dict
    timeframe: str
    lookback_days: int
    initial_capital: float
    position_size_pct: float
    position_sizing: dict
    symbols: tuple[str, ...]


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
        job.current_symbol = None
        db.commit()

    job_snapshot = _load_job_snapshot(job_id)
    start, end = _backtest_window(job_snapshot.lookback_days)
    cancelled = _run_symbols_concurrently(job_snapshot, start, end)

    with SessionLocal() as db:
        job = db.get(BacktestJob, job_id)
        if job is None:
            return
        if cancelled or job.status == "cancelled":
            mark_cancelled(db, job)
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


def _run_symbols_concurrently(
    job: BatchJobSnapshot,
    start: datetime,
    end: datetime,
) -> bool:
    if not job.symbols:
        return False

    max_workers = max(1, min(settings.BACKTEST_BATCH_CONCURRENCY, len(job.symbols)))
    pending: dict[Future, str] = {}
    next_symbol_index = 0
    cancel_requested = False

    with ThreadPoolExecutor(max_workers=max_workers, thread_name_prefix="batch-backtest") as executor:

        def submit_next() -> bool:
            nonlocal next_symbol_index, cancel_requested
            if next_symbol_index >= len(job.symbols):
                return False

            symbol = job.symbols[next_symbol_index]
            if not _mark_symbol_dispatched(job.id, symbol):
                cancel_requested = True
                return False

            next_symbol_index += 1
            future = executor.submit(_run_symbol_backtest, job, symbol, start, end)
            pending[future] = symbol
            if settings.BACKTEST_SYMBOL_THROTTLE_SECONDS > 0:
                time.sleep(settings.BACKTEST_SYMBOL_THROTTLE_SECONDS)
            return True

        try:
            while len(pending) < max_workers and submit_next():
                pass

            while pending:
                done, _ = wait(pending, return_when=FIRST_COMPLETED)

                for future in done:
                    pending.pop(future)
                    row = future.result()
                    _record_symbol_result(job.id, row)

                if _job_is_cancelled(job.id):
                    cancel_requested = True

                while not cancel_requested and len(pending) < max_workers and submit_next():
                    pass
        except WORKER_CONTROL_EXCEPTIONS:
            for future in pending:
                future.cancel()
            raise

    return cancel_requested or _job_is_cancelled(job.id)


def _run_symbol_backtest(
    job: BatchJobSnapshot,
    symbol: str,
    start: datetime,
    end: datetime,
) -> BacktestJobResult:
    try:
        bars = get_cached_bars(symbol, timeframe=job.timeframe, start=start, end=end)
        if len(bars) < 5:
            raise ValueError(f"Not enough historical data for {symbol} to backtest.")
        strategy = registry.create_strategy(job.strategy_key, job.params)
        result = run_backtest(
            strategy,
            symbol,
            bars,
            timeframe=job.timeframe,
            initial_capital=job.initial_capital,
            position_size_pct=job.position_size_pct,
            position_sizing=job.position_sizing,
        )
        return result_from_backtest(job.id, result)
    except WORKER_CONTROL_EXCEPTIONS:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.warning("Batch backtest %s failed for %s: %s", job.id, symbol, exc)
        return failed_result(job.id, symbol, str(exc))


def _load_job_snapshot(job_id: str) -> BatchJobSnapshot:
    with SessionLocal() as db:
        job = db.get(BacktestJob, job_id)
        if job is None:
            raise RuntimeError(f"Batch backtest job {job_id} not found")
        return BatchJobSnapshot(
            id=job.id,
            strategy_key=job.strategy_key,
            params=dict(job.params or {}),
            timeframe=job.timeframe,
            lookback_days=job.lookback_days,
            initial_capital=job.initial_capital,
            position_size_pct=job.position_size_pct,
            position_sizing=dict(job.position_sizing or {}),
            symbols=tuple(job.symbols or ()),
        )


def _mark_symbol_dispatched(job_id: str, symbol: str) -> bool:
    with SessionLocal() as db:
        job = db.get(BacktestJob, job_id)
        if job is None:
            return False
        if job.status == "cancelled":
            mark_cancelled(db, job)
            return False
        job.current_symbol = symbol
        db.commit()
        return True


def _record_symbol_result(job_id: str, row: BacktestJobResult) -> bool:
    with SessionLocal() as db:
        job = db.get(BacktestJob, job_id)
        if job is None:
            return False
        replace_result(db, row)
        job.completed_symbols += 1
        if row.status == "completed":
            job.succeeded_symbols += 1
        else:
            job.failed_symbols += 1
        job.current_symbol = None
        db.commit()
        return True


def _job_is_cancelled(job_id: str) -> bool:
    with SessionLocal() as db:
        job = db.get(BacktestJob, job_id)
        return job is None or job.status == "cancelled"


def _backtest_window(lookback_days: int) -> tuple[datetime, datetime]:
    end = datetime.now(timezone.utc) - timedelta(minutes=20)
    return end - timedelta(days=lookback_days), end
