"""Centralized logging configuration."""

import logging

from app.core.config import settings


def configure_logging() -> None:
    logging.basicConfig(
        level=settings.LOG_LEVEL,
        format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    sqlalchemy_level = getattr(
        logging,
        settings.SQLALCHEMY_LOG_LEVEL.upper(),
        logging.WARNING,
    )
    logging.getLogger("sqlalchemy.engine").setLevel(sqlalchemy_level)
    logging.getLogger("sqlalchemy.pool").setLevel(sqlalchemy_level)


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)
