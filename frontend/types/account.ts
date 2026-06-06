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

export interface Account {
  cash: number;
  equity: number;
  buying_power: number;
}

export interface Position {
  symbol: string;
  qty: number;
  avg_entry_price: number;
  market_value: number;
  unrealized_pl: number;
}

