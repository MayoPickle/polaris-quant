export type MarketDataIngestionKind = "backfill" | "daily_sync" | "repair";

export type MarketDataIngestionStatus =
  | "queued"
  | "running"
  | "pausing"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

export interface MarketDataIngestionJobCreate {
  kind: MarketDataIngestionKind;
  provider?: string | null;
  feed?: string | null;
  timeframe?: "1Min" | "1Hour" | "1Day" | null;
  adjustment?: string | null;
  symbols?: string[];
  start_ts?: string | null;
  end_ts?: string | null;
}

export interface MarketDataIngestionJob {
  id: string;
  kind: MarketDataIngestionKind;
  provider: string;
  feed: string;
  timeframe: string;
  adjustment: string;
  symbols: string[];
  start_ts: string;
  end_ts: string;
  status: MarketDataIngestionStatus;
  total_symbols: number;
  completed_symbols: number;
  total_work_units: number;
  completed_work_units: number;
  pause_requested: boolean;
  progress_state: Record<string, unknown>;
  current_symbol: string | null;
  cursor: string | null;
  requested_rows: number;
  inserted_rows: number;
  error: string | null;
  rq_job_id: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  ended_at: string | null;
}

export interface MarketDataCoverage {
  provider: string;
  feed: string;
  timeframe: string;
  adjustment: string;
  symbol: string;
  first_ts: string | null;
  last_ts: string | null;
  last_success_at: string | null;
  last_error: string | null;
  row_count: number;
}

export interface MarketDataCoverageSummary {
  coverage_count: number;
  symbols: number;
  row_count: number;
  market_bar_rows: number;
  first_ts: string | null;
  last_ts: string | null;
}

export interface MarketDataAssetRefresh {
  refreshed: number;
}
