"""Dev helper: create all tables directly (no migration).

For development convenience only. In production, use Alembic migrations instead.

    python -m app.db.init_db
"""

from app.core.logging import configure_logging, get_logger
from app.db.base import Base
from app.db.base_all import *  # noqa: F401,F403 — register all models on Base.metadata
from app.db.session import engine

logger = get_logger(__name__)


def main() -> None:
    configure_logging()
    Base.metadata.create_all(bind=engine)
    logger.info("Created all tables on %s", engine.url)


if __name__ == "__main__":
    main()
