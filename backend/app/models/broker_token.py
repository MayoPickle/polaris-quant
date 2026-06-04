"""Encrypted broker credentials, scoped per user.

For Alpaca these are an API key id + secret (long-lived). The secret is stored
encrypted at rest via `app.core.security.encrypt_secret`. The schema is broker-
agnostic so other brokers (e.g. an OAuth-based one) can reuse the same table.
"""

from __future__ import annotations

from sqlalchemy import String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import TimestampMixin


class BrokerToken(Base, TimestampMixin):
    __tablename__ = "broker_tokens"
    __table_args__ = (UniqueConstraint("user_id", "broker", "env", name="uq_user_broker_env"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(index=True)

    broker: Mapped[str] = mapped_column(String(32), default="alpaca")
    env: Mapped[str] = mapped_column(String(16), default="paper")  # paper | live

    api_key: Mapped[str] = mapped_column(String(255))
    # Encrypted; never store the plaintext secret.
    api_secret_encrypted: Mapped[str] = mapped_column(String(512))
