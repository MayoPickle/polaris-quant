"""RQ worker process for market-data ingestion.

Run with:
    python -m app.workers.market_data_worker
"""

from __future__ import annotations

from rq import SimpleWorker, Worker

from app.core.config import settings
from app.core.logging import configure_logging, get_logger
from app.workers.queue import get_redis_connection

logger = get_logger(__name__)


def main() -> None:
    configure_logging()
    connection = get_redis_connection()
    worker_cls = SimpleWorker if settings.MARKET_DATA_WORKER_MODE == "simple" else Worker
    logger.info(
        "Starting %s for queue %s",
        worker_cls.__name__,
        settings.MARKET_DATA_QUEUE_NAME,
    )
    worker_cls([settings.MARKET_DATA_QUEUE_NAME], connection=connection).work()


if __name__ == "__main__":
    main()
