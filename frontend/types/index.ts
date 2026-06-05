// TypeScript types mirroring the backend Pydantic schemas.
// Keep in sync with backend/app/schemas/.

export interface StrategyDescriptor {
  key: string;
  name: string;
  description: string;
  param_schema: Record<string, unknown>;
}

export interface StrategyInstance {
  id: number;
  name: string;
  strategy_key: string;
  params: Record<string, unknown>;
  symbols: string[];
  schedule: string;
  is_active: boolean;
  last_run_at: string | null;
  last_error: string | null;
}

export interface StrategyInstanceCreate {
  name: string;
  strategy_key: string;
  params?: Record<string, unknown>;
  symbols?: string[];
  schedule?: string;
  is_active?: boolean;
  live_confirmed?: boolean;
}

export interface StrategyInstanceUpdate {
  name?: string;
  params?: Record<string, unknown>;
  symbols?: string[];
  schedule?: string;
  is_active?: boolean;
  live_confirmed?: boolean;
}

export interface Health {
  status: string;
  app: string;
  env: string;
  broker_env: "paper" | "live";
  trading_enabled: boolean;
  openai_sizing_enabled: boolean;
  position_model: string;
  default_position_allocation_pct: number;
}

export type OrderSide = "buy" | "sell";
export type OrderType = "market" | "limit" | "stop" | "stop_limit";

export interface OrderCreate {
  symbol: string;
  side: OrderSide;
  qty: number;
  order_type?: OrderType;
  limit_price?: number | null;
}

export interface Order {
  id: number;
  broker_order_id: string | null;
  symbol: string;
  side: string;
  order_type: string;
  qty: number;
  status: string;
  filled_qty: number;
  filled_avg_price: number | null;
}

export interface Position {
  symbol: string;
  qty: number;
  avg_entry_price: number;
  market_value: number;
  unrealized_pl: number;
}

export interface Quote {
  symbol: string;
  bid_price: number;
  ask_price: number;
  last_price: number;
}

export interface MarketBar {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketBarSeries {
  symbol: string;
  bars: MarketBar[];
}

export interface MarketBarsResponse {
  timeframe: string;
  lookback_days: number;
  series: MarketBarSeries[];
}

export interface Account {
  cash: number;
  equity: number;
  buying_power: number;
}

export interface BacktestRequest {
  strategy_key: string;
  params?: Record<string, unknown>;
  symbol: string;
  timeframe?: string;
  lookback_days?: number;
  initial_capital?: number;
}

export interface EquityPoint {
  timestamp: string;
  equity: number;
}

export interface BacktestResult {
  label?: string | null;
  symbol: string;
  strategy_key: string;
  initial_capital: number;
  final_equity: number;
  total_return_pct: number;
  buy_hold_return_pct: number;
  alpha_return_pct: number;
  num_trades: number;
  win_rate_pct: number;
  max_drawdown_pct: number;
  sharpe: number;
  equity_curve: EquityPoint[];
  trades: Record<string, unknown>[];
}

export interface BacktestRun {
  label?: string;
  strategy_key: string;
  params?: Record<string, unknown>;
  symbol: string;
}

export interface BacktestCompareRequest {
  runs: BacktestRun[];
  timeframe?: string;
  lookback_days?: number;
  initial_capital?: number;
}

export interface BacktestCompareResult {
  results: BacktestResult[];
}

export interface BacktestUniverse {
  key: string;
  name: string;
  description: string;
}

export type BatchBacktestStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface BatchBacktestRequest {
  strategy_key: string;
  params?: Record<string, unknown>;
  symbols?: string[];
  symbols_text?: string;
  universes?: string[];
  timeframe?: string;
  lookback_days?: number;
  initial_capital?: number;
}

export interface BatchBacktestJob {
  id: string;
  status: BatchBacktestStatus;
  strategy_key: string;
  params: Record<string, unknown>;
  timeframe: string;
  lookback_days: number;
  initial_capital: number;
  universes: string[];
  symbols: string[];
  total_symbols: number;
  completed_symbols: number;
  succeeded_symbols: number;
  failed_symbols: number;
  current_symbol: string | null;
  error: string | null;
  report: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  ended_at: string | null;
}

export interface BatchBacktestSymbolResult {
  symbol: string;
  status: "completed" | "failed" | "cancelled";
  error: string | null;
  final_equity: number | null;
  total_return_pct: number | null;
  buy_hold_return_pct: number | null;
  alpha_return_pct: number | null;
  num_trades: number | null;
  win_rate_pct: number | null;
  max_drawdown_pct: number | null;
  sharpe: number | null;
  equity_curve: EquityPoint[];
  trades: Record<string, unknown>[];
}

export interface BatchBacktestSummary {
  status?: BatchBacktestStatus;
  total_symbols?: number;
  completed_symbols?: number;
  succeeded_symbols?: number;
  failed_symbols?: number;
  average_return_pct?: number;
  median_return_pct?: number;
  average_sharpe?: number;
  average_max_drawdown_pct?: number;
  total_trades?: number;
  best_return?: Record<string, unknown>[];
  worst_return?: Record<string, unknown>[];
  best_sharpe?: Record<string, unknown>[];
  lowest_drawdown?: Record<string, unknown>[];
  representative_symbols?: {
    best?: string | null;
    median?: string | null;
    worst?: string | null;
  };
  return_distribution?: { range: string; start: number; end: number; count: number }[];
  failures?: { symbol: string; error: string | null }[];
}

export interface BatchBacktestReport {
  job: BatchBacktestJob;
  summary: BatchBacktestSummary;
  results: BatchBacktestSymbolResult[];
}
