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

