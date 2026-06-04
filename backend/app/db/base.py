"""SQLAlchemy declarative base.

This module only defines `Base`; it intentionally imports no models so that
model modules can import `Base` without a circular dependency. The aggregate
of all models (for Alembic autogenerate) lives in `app.db.base_all`.
"""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass
