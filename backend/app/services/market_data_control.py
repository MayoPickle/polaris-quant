"""Control-plane helpers for market-data ingestion jobs."""

from __future__ import annotations

from datetime import datetime
from typing import Iterable

from fastapi import HTTPException
from rq import Worker
from rq.exceptions import InvalidJobOperation, NoSuchJobError
from rq.job import Job, JobStatus
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.logging import get_logger
from app.models.market_data import MarketDataCoverage, MarketDataIngestionJob
from app.services.market_data_ingestion_store import reconcile_coverage
from app.services.market_data_time import UTC, as_utc
from app.workers.queue import (
    get_market_data_queue,
    market_data_job_timeout_for_kind,
    market_data_queue_name_for_kind,
)

ACTIVE_JOB_STATUSES = {"queued", "running", "cancelling", "pausing"}
RESUMABLE_JOB_STATUSES = {"paused"}
TERMINAL_JOB_STATUSES = {"completed", "failed", "cancelled"}
STALE_RECOVERY_STATUSES = {"queued", "running", "cancelling", "pausing"}
WAITING_RQ_STATUSES = {
    JobStatus.CREATED.value,
    JobStatus.QUEUED.value,
    JobStatus.DEFERRED.value,
    JobStatus.SCHEDULED.value,
}

logger = get_logger(__name__)


def get_ingestion_job_or_404(db: Session, job_id: str) -> MarketDataIngestionJob:
    job = db.get(MarketDataIngestionJob, job_id)
    if job is None:
        raise HTTPException(404, "Market-data ingestion job not found.")
    return reconcile_stale_ingestion_job(db, job)


def reconcile_stale_ingestion_jobs(
    db: Session,
    jobs: Iterable[MarketDataIngestionJob],
) -> list[MarketDataIngestionJob]:
    return [reconcile_stale_ingestion_job(db, job) for job in jobs]


def reconcile_stale_ingestion_job(
    db: Session,
    job: MarketDataIngestionJob,
) -> MarketDataIngestionJob:
    if job.status not in STALE_RECOVERY_STATUSES:
        return job
    if not _job_control_state_is_stale(job):
        return job
    if _rq_job_is_waiting_or_active(job):
        return job

    previous_status = job.status
    _discard_rq_job_state(job)
    if previous_status == "cancelling":
        _recover_as_cancelled(job, previous_status)
    else:
        _recover_as_paused(job, previous_status)
    db.commit()
    db.refresh(job)
    return job


def pause_ingestion_job(db: Session, job: MarketDataIngestionJob) -> MarketDataIngestionJob:
    if job.status in TERMINAL_JOB_STATUSES:
        raise HTTPException(409, f"Cannot pause a {job.status} ingestion job.")
    if job.status == "paused":
        return job

    job.pause_requested = True
    if job.status == "queued":
        job.status = "paused"
        job.current_symbol = None
        job.ended_at = datetime.now(UTC)
    elif job.status in {"running", "cancelling"}:
        job.status = "pausing"
    db.commit()
    db.refresh(job)
    return job


def cancel_ingestion_job(db: Session, job: MarketDataIngestionJob) -> MarketDataIngestionJob:
    if job.status == "completed":
        raise HTTPException(409, "Completed ingestion jobs cannot be cancelled.")
    if job.status == "cancelled":
        return job

    job.pause_requested = False
    job.current_symbol = None
    if job.status in {"running", "pausing"}:
        job.status = "cancelling"
    else:
        job.status = "cancelled"
        job.ended_at = datetime.now(UTC)
    db.commit()
    db.refresh(job)
    return job


def delete_ingestion_job(db: Session, job: MarketDataIngestionJob) -> None:
    if job.status in ACTIVE_JOB_STATUSES:
        raise HTTPException(409, f"Cancel or pause a {job.status} ingestion job before deleting it.")

    db.delete(job)
    db.commit()


def prepare_resume_ingestion_job(db: Session, job: MarketDataIngestionJob) -> MarketDataIngestionJob:
    if job.status not in RESUMABLE_JOB_STATUSES:
        raise HTTPException(409, f"Only paused ingestion jobs can resume; current status is {job.status}.")

    job.status = "queued"
    job.pause_requested = False
    job.current_symbol = None
    job.ended_at = None
    job.error = None
    db.commit()
    db.refresh(job)
    return job


def fail_resume_ingestion_job(
    db: Session,
    job: MarketDataIngestionJob,
    error: str,
) -> MarketDataIngestionJob:
    job.status = "paused"
    job.pause_requested = True
    job.error = error
    db.commit()
    db.refresh(job)
    return job


def _job_control_state_is_stale(job: MarketDataIngestionJob) -> bool:
    threshold = max(60, settings.MARKET_DATA_STALE_JOB_SECONDS)
    updated_at = as_utc(job.updated_at)
    return (datetime.now(UTC) - updated_at).total_seconds() >= threshold


def _rq_job_is_waiting_or_active(job: MarketDataIngestionJob) -> bool:
    if not job.rq_job_id:
        return False
    try:
        queue = get_market_data_queue(
            market_data_queue_name_for_kind(job.kind),
            default_timeout=market_data_job_timeout_for_kind(job.kind),
        )
        rq_job = Job.fetch(job.rq_job_id, connection=queue.connection)
        status = rq_job.get_status().value
        if status in WAITING_RQ_STATUSES:
            return True
        if status == JobStatus.STARTED.value:
            return _rq_job_has_live_worker(queue, rq_job.id)
    except (InvalidJobOperation, NoSuchJobError):
        return False
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "Could not reconcile market-data ingestion job %s with RQ: %s",
            job.id,
            exc,
        )
        return True
    return False


def _rq_job_has_live_worker(queue, rq_job_id: str) -> bool:  # noqa: ANN001
    for worker in Worker.all(queue=queue):
        if worker.get_current_job_id() == rq_job_id and _worker_has_fresh_heartbeat(worker):
            return True
    return False


def _worker_has_fresh_heartbeat(worker) -> bool:  # noqa: ANN001
    if worker.last_heartbeat is None:
        return False
    threshold = max(60, settings.MARKET_DATA_STALE_JOB_SECONDS)
    age_seconds = (datetime.now(UTC) - as_utc(worker.last_heartbeat)).total_seconds()
    return age_seconds < threshold


def _discard_rq_job_state(job: MarketDataIngestionJob) -> None:
    if not job.rq_job_id:
        return
    try:
        queue = get_market_data_queue(
            market_data_queue_name_for_kind(job.kind),
            default_timeout=market_data_job_timeout_for_kind(job.kind),
        )
        rq_job = Job.fetch(job.rq_job_id, connection=queue.connection)
        status = rq_job.get_status().value
        if status == JobStatus.STARTED.value:
            queue.started_job_registry.remove(rq_job, delete_job=False)
        rq_job.cancel()
    except (InvalidJobOperation, NoSuchJobError):
        return
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "Could not discard stale RQ state for market-data ingestion job %s: %s",
            job.id,
            exc,
        )


def _recover_as_paused(job: MarketDataIngestionJob, previous_status: str) -> None:
    now = datetime.now(UTC)
    job.status = "paused"
    job.pause_requested = True
    job.current_symbol = None
    job.ended_at = now
    job.rq_job_id = None
    job.error = "Worker state was stale; paused automatically so this job can resume."
    _record_stale_recovery(job, previous_status, now)


def _recover_as_cancelled(job: MarketDataIngestionJob, previous_status: str) -> None:
    now = datetime.now(UTC)
    job.status = "cancelled"
    job.pause_requested = False
    job.current_symbol = None
    job.ended_at = now
    job.rq_job_id = None
    job.error = "Worker state was stale; cancellation completed automatically."
    _record_stale_recovery(job, previous_status, now)


def _record_stale_recovery(
    job: MarketDataIngestionJob,
    previous_status: str,
    recovered_at: datetime,
) -> None:
    progress_state = dict(job.progress_state or {})
    progress_state["stale_recovery"] = {
        "from_status": previous_status,
        "recovered_at": recovered_at.isoformat(),
    }
    job.progress_state = progress_state


def market_data_coverage_summary(db: Session) -> dict:
    coverage_count, symbols, first_ts, last_ts, rows = (
        db.query(
            func.count(MarketDataCoverage.id),
            func.count(func.distinct(MarketDataCoverage.symbol)),
            func.min(MarketDataCoverage.first_ts),
            func.max(MarketDataCoverage.last_ts),
            func.coalesce(func.sum(MarketDataCoverage.row_count), 0),
        ).one()
    )
    return {
        "coverage_count": int(coverage_count or 0),
        "symbols": int(symbols or 0),
        "row_count": int(rows or 0),
        "market_bar_rows": int(rows or 0),
        "first_ts": first_ts,
        "last_ts": last_ts,
    }


def reconcile_market_data_coverage(
    db: Session,
    *,
    provider: str,
    feed: str,
    timeframe: str,
    adjustment: str,
    symbol: str | None = None,
    limit: int | None = None,
) -> dict[str, int]:
    return reconcile_coverage(
        db,
        provider=provider,
        feed=feed,
        timeframe=timeframe,
        adjustment=adjustment,
        symbols=[symbol] if symbol else None,
        limit=limit or settings.MARKET_DATA_COVERAGE_RECONCILE_BATCH_SYMBOLS,
    )
