"""Pydantic DTOs for cached market data."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


IngestionKind = Literal["backfill", "daily_sync", "repair"]
IngestionStatus = Literal[
    "queued",
    "running",
    "cancelling",
    "pausing",
    "paused",
    "completed",
    "failed",
    "cancelled",
]
MarketTimeframe = Literal["1Min", "1Hour", "1Day"]


class MarketAssetRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    symbol: str
    asset_id: str
    name: str
    asset_class: str
    exchange: str
    status: str
    tradable: bool
    marginable: bool
    shortable: bool
    easy_to_borrow: bool


class MarketAssetRefreshRead(BaseModel):
    refreshed: int


class MarketDataIngestionJobCreate(BaseModel):
    kind: IngestionKind = "backfill"
    provider: str | None = None
    feed: str | None = None
    timeframe: MarketTimeframe | None = None
    adjustment: str | None = None
    symbols: list[str] = Field(default_factory=list)
    start_ts: datetime | None = None
    end_ts: datetime | None = None


class MarketDataIngestionJobRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    kind: str
    provider: str
    feed: str
    timeframe: str
    adjustment: str
    symbols: list[str]
    start_ts: datetime
    end_ts: datetime
    status: IngestionStatus
    total_symbols: int
    completed_symbols: int
    total_work_units: int
    completed_work_units: int
    pause_requested: bool
    progress_state: dict
    current_symbol: str | None = None
    cursor: str | None = None
    requested_rows: int
    inserted_rows: int
    error: str | None = None
    rq_job_id: str | None = None
    created_at: datetime
    updated_at: datetime
    started_at: datetime | None = None
    ended_at: datetime | None = None


class MarketDataCoverageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    provider: str
    feed: str
    timeframe: str
    adjustment: str
    symbol: str
    first_ts: datetime | None = None
    last_ts: datetime | None = None
    last_success_at: datetime | None = None
    last_error: str | None = None
    row_count: int


class MarketDataCoverageSummaryRead(BaseModel):
    coverage_count: int
    symbols: int
    row_count: int
    market_bar_rows: int
    first_ts: datetime | None = None
    last_ts: datetime | None = None


class MarketDataCoverageReconcileRead(BaseModel):
    reconciled_symbols: int
    row_count: int
