"""Pydantic DTOs for strategies (request/response), kept separate from ORM models."""

from __future__ import annotations

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


class StrategyInstanceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    strategy_key: str
    params: dict
    symbols: list[str]
    schedule: str
    is_active: bool


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
