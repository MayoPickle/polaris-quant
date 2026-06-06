"""RQ job wrapper for market-data ingestion."""

from __future__ import annotations

from app.core.logging import get_logger
from app.services.market_data_ingestion import run_market_data_ingestion_job as run_job

logger = get_logger(__name__)


def run_market_data_ingestion_job(job_id: str) -> None:
    logger.info("Starting market-data ingestion job %s", job_id)
    run_job(job_id)
