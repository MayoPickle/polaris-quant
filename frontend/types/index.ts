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
}

export interface StrategyInstanceCreate {
  name: string;
  strategy_key: string;
  params?: Record<string, unknown>;
  symbols?: string[];
  schedule?: string;
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
