"""Control-plane helpers for market-data ingestion jobs."""

from __future__ import annotations

from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.market_data import MarketBar, MarketDataCoverage, MarketDataIngestionJob
from app.services.market_data_time import UTC

ACTIVE_JOB_STATUSES = {"queued", "running", "pausing", "paused"}
TERMINAL_JOB_STATUSES = {"completed", "failed", "cancelled"}


def get_ingestion_job_or_404(db: Session, job_id: str) -> MarketDataIngestionJob:
    job = db.get(MarketDataIngestionJob, job_id)
    if job is None:
        raise HTTPException(404, "Market-data ingestion job not found.")
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
    elif job.status == "running":
        job.status = "pausing"
    db.commit()
    db.refresh(job)
    return job


def prepare_resume_ingestion_job(db: Session, job: MarketDataIngestionJob) -> MarketDataIngestionJob:
    if job.status != "paused":
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
    bar_rows = db.query(func.count(MarketBar.ts)).scalar() or 0
    return {
        "coverage_count": int(coverage_count or 0),
        "symbols": int(symbols or 0),
        "row_count": int(rows or 0),
        "market_bar_rows": int(bar_rows),
        "first_ts": first_ts,
        "last_ts": last_ts,
    }
