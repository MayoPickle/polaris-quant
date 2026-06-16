"""Redis/RQ queue helpers."""

from __future__ import annotations

from redis import Redis
from rq import Queue

from app.core.config import settings


def get_redis_connection() -> Redis:
    return Redis.from_url(settings.REDIS_URL)


def get_backtest_queue() -> Queue:
    return Queue(
        settings.BACKTEST_QUEUE_NAME,
        connection=get_redis_connection(),
        default_timeout=settings.BACKTEST_JOB_TIMEOUT_SECONDS,
    )


def get_market_data_queue(
    queue_name: str | None = None,
    *,
    default_timeout: int | None = None,
) -> Queue:
    return Queue(
        queue_name or settings.MARKET_DATA_QUEUE_NAME,
        connection=get_redis_connection(),
        default_timeout=default_timeout or settings.MARKET_DATA_JOB_TIMEOUT_SECONDS,
    )


def market_data_queue_name_for_kind(kind: str | None) -> str:
    if kind and kind != "daily_sync":
        return settings.MARKET_DATA_BACKFILL_QUEUE_NAME
    return settings.MARKET_DATA_QUEUE_NAME


def market_data_job_timeout_for_kind(kind: str | None) -> int:
    if kind and kind != "daily_sync":
        return settings.MARKET_DATA_BACKFILL_JOB_TIMEOUT_SECONDS
    return settings.MARKET_DATA_JOB_TIMEOUT_SECONDS


def enqueue_batch_backtest(job_id: str) -> str:
    queue = get_backtest_queue()
    job = queue.enqueue(
        "app.workers.jobs.run_batch_backtest.run_batch_backtest_job",
        job_id,
        job_id=job_id,
        job_timeout=settings.BACKTEST_JOB_TIMEOUT_SECONDS,
    )
    return job.id


def enqueue_market_data_ingestion(job_id: str, *, kind: str | None = None) -> str:
    timeout = market_data_job_timeout_for_kind(kind)
    queue = get_market_data_queue(
        market_data_queue_name_for_kind(kind),
        default_timeout=timeout,
    )
    job = queue.enqueue(
        "app.workers.jobs.run_market_data_ingestion.run_market_data_ingestion_job",
        job_id,
        job_id=job_id,
        job_timeout=timeout,
    )
    return job.id
