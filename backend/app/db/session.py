"""Database engine and session factory.

The engine is selected by `DATABASE_URL`: SQLite in development, PostgreSQL in
production. `check_same_thread` is only needed for SQLite.
"""

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings

_database_url = settings.resolved_database_url
_connect_args = (
    {"check_same_thread": False} if _database_url.startswith("sqlite") else {}
)

engine = create_engine(
    _database_url,
    connect_args=_connect_args,
    pool_pre_ping=True,
    echo=settings.SQL_ECHO,
)

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency that yields a request-scoped session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
