"""Cached market data and ingestion progress."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    DateTime,
    Float,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import TimestampMixin


INGESTION_STATUSES = (
    "queued",
    "running",
    "cancelling",
    "pausing",
    "paused",
    "completed",
    "failed",
    "cancelled",
)
INGESTION_KINDS = ("backfill", "daily_sync", "repair")


class MarketAsset(Base, TimestampMixin):
    __tablename__ = "market_assets"

    symbol: Mapped[str] = mapped_column(String(16), primary_key=True)
    asset_id: Mapped[str] = mapped_column(String(64), default="")
    name: Mapped[str] = mapped_column(String(255), default="")
    asset_class: Mapped[str] = mapped_column(String(32), default="us_equity", index=True)
    exchange: Mapped[str] = mapped_column(String(32), default="", index=True)
    status: Mapped[str] = mapped_column(String(32), default="", index=True)
    tradable: Mapped[bool] = mapped_column(Boolean, default=False)
    marginable: Mapped[bool] = mapped_column(Boolean, default=False)
    shortable: Mapped[bool] = mapped_column(Boolean, default=False)
    easy_to_borrow: Mapped[bool] = mapped_column(Boolean, default=False)
    raw: Mapped[dict] = mapped_column(JSON, default=dict)


class MarketBar(Base):
    __tablename__ = "market_bars"

    provider: Mapped[str] = mapped_column(String(32), primary_key=True)
    feed: Mapped[str] = mapped_column(String(16), primary_key=True)
    timeframe: Mapped[str] = mapped_column(String(16), primary_key=True)
    adjustment: Mapped[str] = mapped_column(String(16), primary_key=True)
    symbol: Mapped[str] = mapped_column(String(16), primary_key=True)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True)

    open: Mapped[float] = mapped_column(Float)
    high: Mapped[float] = mapped_column(Float)
    low: Mapped[float] = mapped_column(Float)
    close: Mapped[float] = mapped_column(Float)
    volume: Mapped[float] = mapped_column(Float)
    trade_count: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    vwap: Mapped[float | None] = mapped_column(Float, nullable=True)
    currency: Mapped[str] = mapped_column(String(8), default="USD")
    ingested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )


class MarketDataCoverage(Base, TimestampMixin):
    __tablename__ = "market_data_coverage"
    __table_args__ = (
        UniqueConstraint(
            "provider",
            "feed",
            "timeframe",
            "adjustment",
            "symbol",
            name="uq_market_data_coverage_key",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    provider: Mapped[str] = mapped_column(String(32), index=True)
    feed: Mapped[str] = mapped_column(String(16), index=True)
    timeframe: Mapped[str] = mapped_column(String(16), index=True)
    adjustment: Mapped[str] = mapped_column(String(16), index=True)
    symbol: Mapped[str] = mapped_column(String(16), index=True)
    first_ts: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_ts: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_success_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    row_count: Mapped[int] = mapped_column(BigInteger, default=0)


class MarketDataIngestionJob(Base, TimestampMixin):
    __tablename__ = "market_data_ingestion_jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    kind: Mapped[str] = mapped_column(String(32), default="backfill", index=True)
    provider: Mapped[str] = mapped_column(String(32), index=True)
    feed: Mapped[str] = mapped_column(String(16), index=True)
    timeframe: Mapped[str] = mapped_column(String(16), index=True)
    adjustment: Mapped[str] = mapped_column(String(16), index=True)
    symbols: Mapped[list] = mapped_column(JSON, default=list)
    start_ts: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    end_ts: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    status: Mapped[str] = mapped_column(String(32), default="queued", index=True)
    total_symbols: Mapped[int] = mapped_column(Integer, default=0)
    completed_symbols: Mapped[int] = mapped_column(Integer, default=0)
    total_work_units: Mapped[int] = mapped_column(Integer, default=0)
    completed_work_units: Mapped[int] = mapped_column(Integer, default=0)
    pause_requested: Mapped[bool] = mapped_column(Boolean, default=False)
    progress_state: Mapped[dict] = mapped_column(JSON, default=dict)
    current_symbol: Mapped[str | None] = mapped_column(String(16), nullable=True)
    cursor: Mapped[str | None] = mapped_column(Text, nullable=True)
    requested_rows: Mapped[int] = mapped_column(BigInteger, default=0)
    inserted_rows: Mapped[int] = mapped_column(BigInteger, default=0)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    rq_job_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
