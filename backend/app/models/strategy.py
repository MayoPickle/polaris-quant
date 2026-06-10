"""Strategy instances and the signals they produce.

A `StrategyInstance` is a user-activated strategy: a registry key (which built-in
strategy), its parameters, the symbols it trades, a schedule, and on/off state.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import TimestampMixin


class StrategyInstance(Base, TimestampMixin):
    __tablename__ = "strategy_instances"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)

    name: Mapped[str] = mapped_column(String(120))
    # Registry key of the strategy implementation, e.g. "sma_cross".
    strategy_key: Mapped[str] = mapped_column(String(64), index=True)
    # Free-form parameters validated against the strategy's param schema.
    params: Mapped[dict] = mapped_column(JSON, default=dict)
    # Symbols this instance trades, e.g. ["AAPL", "MSFT"].
    symbols: Mapped[list] = mapped_column(JSON, default=list)
    # Cron-like schedule expression handled by the worker, e.g. "*/15 9-16 * * mon-fri".
    schedule: Mapped[str] = mapped_column(String(120), default="")

    is_active: Mapped[bool] = mapped_column(Boolean, default=False)
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Signal(Base, TimestampMixin):
    __tablename__ = "signals"

    id: Mapped[int] = mapped_column(primary_key=True)
    strategy_instance_id: Mapped[int] = mapped_column(
        ForeignKey("strategy_instances.id"), index=True
    )
    symbol: Mapped[str] = mapped_column(String(16), index=True)
    side: Mapped[str] = mapped_column(Enum("buy", "sell", "hold", name="signal_side"))
    qty: Mapped[float] = mapped_column(default=0.0)
    # Strategy-specific context (indicator values, reason, etc.).
    meta: Mapped[dict] = mapped_column(JSON, default=dict)
