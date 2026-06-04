"""Worker process entrypoint.

Run separately from the web server:
    python -m app.workers.runtime
"""

from __future__ import annotations

from app.core.logging import configure_logging, get_logger
from app.strategies import registry
from app.workers.scheduler import build_scheduler

logger = get_logger(__name__)


def main() -> None:
    configure_logging()
    registry.load_builtin_strategies()
    scheduler = build_scheduler()
    logger.info("Worker started; scheduler running. Press Ctrl+C to exit.")
    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        logger.info("Worker shutting down")


if __name__ == "__main__":
    main()
