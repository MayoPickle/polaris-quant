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

export interface MarketClock {
  is_open: boolean;
}

export interface MarketSnapshot {
  symbol: string;
  latest_trade_price: number | null;
  latest_trade_timestamp: string | null;
  latest_trade_size: number | null;
  bid_price: number | null;
  ask_price: number | null;
  spread: number | null;
  midpoint_price: number | null;
  day_open: number | null;
  day_high: number | null;
  day_low: number | null;
  day_close: number | null;
  day_volume: number | null;
  previous_close: number | null;
}

export interface MarketSnapshotsResponse {
  snapshots: MarketSnapshot[];
}
