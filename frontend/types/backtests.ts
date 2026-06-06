import type { PositionSizingConfig } from "./position-sizing";

interface EquityPoint {
  timestamp: string;
  equity: number;
}

export interface BacktestRequest {
  strategy_key: string;
  params?: Record<string, unknown>;
  symbol: string;
  timeframe?: string;
  lookback_days?: number;
  initial_capital?: number;
  position_size_pct?: number;
  position_sizing?: PositionSizingConfig;
}

export interface BacktestResult {
  label?: string | null;
  symbol: string;
  strategy_key: string;
  initial_capital: number;
  position_size_pct: number;
  position_sizing: PositionSizingConfig;
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

interface BacktestRun {
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
  position_size_pct?: number;
  position_sizing?: PositionSizingConfig;
}

export interface BacktestCompareResult {
  results: BacktestResult[];
}

export interface BacktestUniverse {
  key: string;
  name: string;
  description: string;
}

type BatchBacktestStatus =
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
  position_size_pct?: number;
  position_sizing?: PositionSizingConfig;
}

export interface BatchBacktestJob {
  id: string;
  status: BatchBacktestStatus;
  strategy_key: string;
  params: Record<string, unknown>;
  timeframe: string;
  lookback_days: number;
  initial_capital: number;
  position_size_pct: number;
  position_sizing: PositionSizingConfig;
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

interface BatchBacktestSummary {
  status?: BatchBacktestStatus;
  total_symbols?: number;
  completed_symbols?: number;
  succeeded_symbols?: number;
  failed_symbols?: number;
  average_return_pct?: number;
  average_buy_hold_return_pct?: number;
  average_alpha_return_pct?: number;
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

