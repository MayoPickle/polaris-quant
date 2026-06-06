"""Batch strategy backtest endpoints."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, Header, HTTPException
from rq.job import Job
from sqlalchemy.orm import Session

from app.api.deps import get_current_user_id
from app.api.v1.endpoints.strategy_backtest_helpers import resolve_position_sizing
from app.core.i18n import negotiate_locale
from app.db.session import get_db
from app.models.backtest import BacktestJob, BacktestJobResult
from app.schemas.strategy import (
    BatchBacktestJobRead,
    BatchBacktestReportRead,
    BatchBacktestRequest,
    BatchBacktestSymbolResult,
    BacktestUniverseRead,
)
from app.services.backtest_batch_service import (
    build_batch_summary,
    list_universes,
    resolve_batch_symbols,
)
from app.strategies import registry
from app.strategies.position_sizing import position_sizing_summary_pct
from app.workers.queue import enqueue_batch_backtest, get_redis_connection

router = APIRouter()


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
        raise HTTPException(400, f"Unknown strategy: {payload.strategy_key!r}") from None

    try:
        symbols = resolve_batch_symbols(
            db,
            imported_symbols=payload.symbols,
            symbols_text=payload.symbols_text,
            universe_keys=payload.universes,
        )
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, f"Could not resolve universe symbols: {exc}") from exc

    position_sizing = resolve_position_sizing(
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
        raise HTTPException(503, job.error) from exc

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

