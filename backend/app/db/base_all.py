"""Imports every model so they register on `Base.metadata`.

Import this module (not the individual model files) wherever the full schema is
needed — e.g. Alembic's env.py or `Base.metadata.create_all()`.
"""

from app.db.base import Base  # noqa: F401
from app.models import backtest, broker_token, order, strategy, user  # noqa: F401
