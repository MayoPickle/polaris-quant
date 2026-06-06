export interface Quote {
  symbol: string;
  bid_price: number;
  ask_price: number;
  last_price: number;
}

interface MarketBar {
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
