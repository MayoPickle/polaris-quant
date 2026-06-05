"""Persistent batch backtest jobs and universe symbols."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, DateTime, Enum, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models import user as _user  # noqa: F401
from app.models.mixins import TimestampMixin


JOB_STATUSES = ("queued", "running", "completed", "failed", "cancelled")
RESULT_STATUSES = ("completed", "failed", "cancelled")


class UniverseSymbol(Base, TimestampMixin):
    __tablename__ = "universe_symbols"
    __table_args__ = (UniqueConstraint("universe", "symbol", name="uq_universe_symbol"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    universe: Mapped[str] = mapped_column(String(32), index=True)
    symbol: Mapped[str] = mapped_column(String(16), index=True)
    name: Mapped[str] = mapped_column(String(160), default="")
    source: Mapped[str] = mapped_column(String(240), default="")
    is_active: Mapped[bool] = mapped_column(default=True)


class BacktestJob(Base, TimestampMixin):
    __tablename__ = "backtest_jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)

    strategy_key: Mapped[str] = mapped_column(String(64), index=True)
    params: Mapped[dict] = mapped_column(JSON, default=dict)
    timeframe: Mapped[str] = mapped_column(String(16), default="1Day")
    lookback_days: Mapped[int] = mapped_column(Integer, default=365)
    initial_capital: Mapped[float] = mapped_column(Float, default=100_000.0)
    position_size_pct: Mapped[float] = mapped_column(Float, default=20.0)
    position_sizing: Mapped[dict] = mapped_column(JSON, default=dict)

    universes: Mapped[list] = mapped_column(JSON, default=list)
    symbols: Mapped[list] = mapped_column(JSON, default=list)
    total_symbols: Mapped[int] = mapped_column(Integer, default=0)
    completed_symbols: Mapped[int] = mapped_column(Integer, default=0)
    succeeded_symbols: Mapped[int] = mapped_column(Integer, default=0)
    failed_symbols: Mapped[int] = mapped_column(Integer, default=0)

    status: Mapped[str] = mapped_column(
        Enum(*JOB_STATUSES, name="backtest_job_status"),
        default="queued",
        index=True,
    )
    current_symbol: Mapped[str | None] = mapped_column(String(16), nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    report: Mapped[dict] = mapped_column(JSON, default=dict)
    rq_job_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class BacktestJobResult(Base, TimestampMixin):
    __tablename__ = "backtest_job_results"
    __table_args__ = (UniqueConstraint("job_id", "symbol", name="uq_backtest_job_result"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    job_id: Mapped[str] = mapped_column(ForeignKey("backtest_jobs.id", ondelete="CASCADE"), index=True)
    symbol: Mapped[str] = mapped_column(String(16), index=True)
    status: Mapped[str] = mapped_column(Enum(*RESULT_STATUSES, name="backtest_result_status"))
    error: Mapped[str | None] = mapped_column(Text, nullable=True)

    final_equity: Mapped[float | None] = mapped_column(Float, nullable=True)
    total_return_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    buy_hold_return_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    alpha_return_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    num_trades: Mapped[int | None] = mapped_column(Integer, nullable=True)
    win_rate_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_drawdown_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    sharpe: Mapped[float | None] = mapped_column(Float, nullable=True)

    equity_curve: Mapped[list] = mapped_column(JSON, default=list)
    trades: Mapped[list] = mapped_column(JSON, default=list)
