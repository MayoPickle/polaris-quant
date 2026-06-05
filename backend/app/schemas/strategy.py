"""Pydantic DTOs for strategies (request/response), kept separate from ORM models."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class StrategyDescriptor(BaseModel):
    """Describes an available strategy from the registry (for the picker UI)."""

    key: str
    name: str
    description: str
    # JSON-schema-like description of accepted params, for the frontend form.
    param_schema: dict


class StrategyInstanceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    strategy_key: str
    params: dict = Field(default_factory=dict)
    symbols: list[str] = Field(default_factory=list)
    schedule: str = ""
    is_active: bool = False
    live_confirmed: bool = False


class StrategyInstanceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    params: dict | None = None
    symbols: list[str] | None = None
    schedule: str | None = None
    is_active: bool | None = None
    live_confirmed: bool = False


class StrategyInstanceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    strategy_key: str
    params: dict
    symbols: list[str]
    schedule: str
    is_active: bool
    last_run_at: datetime | None = None
    last_error: str | None = None


class BacktestRequest(BaseModel):
    strategy_key: str
    params: dict = Field(default_factory=dict)
    symbol: str
    timeframe: str = "1Day"
    lookback_days: int = Field(default=365, ge=5, le=2000)
    initial_capital: float = Field(default=100_000, gt=0)


class EquityPoint(BaseModel):
    timestamp: str
    equity: float


class BacktestResultRead(BaseModel):
    label: str | None = None
    symbol: str
    strategy_key: str
    initial_capital: float
    final_equity: float
    total_return_pct: float
    buy_hold_return_pct: float
    alpha_return_pct: float
    num_trades: int
    win_rate_pct: float
    max_drawdown_pct: float
    sharpe: float
    equity_curve: list[EquityPoint]
    trades: list[dict]


class BacktestRun(BaseModel):
    label: str | None = None
    strategy_key: str
    params: dict = Field(default_factory=dict)
    symbol: str


class BacktestCompareRequest(BaseModel):
    runs: list[BacktestRun] = Field(min_length=1, max_length=6)
    timeframe: str = "1Day"
    lookback_days: int = Field(default=365, ge=5, le=2000)
    initial_capital: float = Field(default=100_000, gt=0)


class BacktestCompareResult(BaseModel):
    results: list[BacktestResultRead]


class BacktestUniverseRead(BaseModel):
    key: str
    name: str
    description: str


class BatchBacktestRequest(BaseModel):
    strategy_key: str
    params: dict = Field(default_factory=dict)
    symbols: list[str] = Field(default_factory=list)
    symbols_text: str = ""
    universes: list[str] = Field(default_factory=list)
    timeframe: str = "1Day"
    lookback_days: int = Field(default=365, ge=5, le=2000)
    initial_capital: float = Field(default=100_000, gt=0)


class BatchBacktestJobRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    status: Literal["queued", "running", "completed", "failed", "cancelled"]
    strategy_key: str
    params: dict
    timeframe: str
    lookback_days: int
    initial_capital: float
    universes: list[str]
    symbols: list[str]
    total_symbols: int
    completed_symbols: int
    succeeded_symbols: int
    failed_symbols: int
    current_symbol: str | None = None
    error: str | None = None
    report: dict
    created_at: datetime
    updated_at: datetime
    started_at: datetime | None = None
    ended_at: datetime | None = None


class BatchBacktestSymbolResult(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    symbol: str
    status: Literal["completed", "failed", "cancelled"]
    error: str | None = None
    final_equity: float | None = None
    total_return_pct: float | None = None
    buy_hold_return_pct: float | None = None
    alpha_return_pct: float | None = None
    num_trades: int | None = None
    win_rate_pct: float | None = None
    max_drawdown_pct: float | None = None
    sharpe: float | None = None
    equity_curve: list[EquityPoint] = Field(default_factory=list)
    trades: list[dict] = Field(default_factory=list)


class BatchBacktestReportRead(BaseModel):
    job: BatchBacktestJobRead
    summary: dict
    results: list[BatchBacktestSymbolResult]
