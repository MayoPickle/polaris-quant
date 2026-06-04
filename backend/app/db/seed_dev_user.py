"""Seed the fixed development user used by the auth skeleton."""

from __future__ import annotations

from sqlalchemy import text

from app.core.logging import configure_logging, get_logger
from app.db.session import SessionLocal, engine
from app.models.user import User

logger = get_logger(__name__)

DEV_USER_ID = 1
DEV_USER_EMAIL = "dev@example.local"


def ensure_dev_user() -> None:
    with SessionLocal() as db:
        user = db.get(User, DEV_USER_ID)
        if user is None:
            db.add(
                User(
                    id=DEV_USER_ID,
                    email=DEV_USER_EMAIL,
                    hashed_password="dev-placeholder",
                    is_active=True,
                )
            )
            db.commit()
            logger.info("Seeded development user id=%s", DEV_USER_ID)
        else:
            logger.info("Development user id=%s already exists", DEV_USER_ID)

        if engine.dialect.name == "postgresql":
            db.execute(
                text(
                    "SELECT setval("
                    "pg_get_serial_sequence('users', 'id'), "
                    "GREATEST((SELECT MAX(id) FROM users), 1)"
                    ")"
                )
            )
            db.commit()


def main() -> None:
    configure_logging()
    ensure_dev_user()


if __name__ == "__main__":
    main()
