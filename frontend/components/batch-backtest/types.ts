import type { BatchBacktestSymbolResult } from "@/types";

export type ParamSpec = { type?: string; default?: number; title?: string };

export type RankingSortKey =
  | "rank"
  | "symbol"
  | "total_return_pct"
  | "buy_hold_return_pct"
  | "alpha_return_pct"
  | "sharpe"
  | "max_drawdown_pct"
  | "win_rate_pct"
  | "num_trades"
  | "final_equity";

export type SortDirection = "asc" | "desc";
export type RankedResult = BatchBacktestSymbolResult & { rank: number };

export type AggregateMetrics = {
  successfulSymbols: number;
  averageReturnPct: number | null;
  averageBuyHoldReturnPct: number | null;
  averageAlphaReturnPct: number | null;
  medianReturnPct: number | null;
  averageSharpe: number | null;
  averageMaxDrawdownPct: number | null;
  averageWinRatePct: number | null;
  averageTrades: number | null;
  averageFinalEquity: number | null;
  totalTrades: number;
  successRatePct: number | null;
};

