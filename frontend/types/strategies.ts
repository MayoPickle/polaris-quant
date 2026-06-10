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
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  next_run_at: string | null;
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

export interface StrategySignal {
  id: number;
  strategy_instance_id: number;
  strategy_name: string;
  strategy_key: string;
  symbol: string;
  side: "buy" | "sell" | "hold";
  qty: number;
  status: string;
  reason: string | null;
  allocation_pct: number | null;
  allocation_source: string | null;
  allocation_rationale: string | null;
  bar_timestamp: string | null;
  order_id: number | null;
  broker_order_id: string | null;
  created_at: string;
}
