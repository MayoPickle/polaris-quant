import type { BatchBacktestReport, BatchBacktestSymbolResult } from "@/types";

import type { AggregateMetrics, RankedResult, RankingSortKey, SortDirection } from "./types";

export function sortRankedResults(
  rows: RankedResult[],
  key: RankingSortKey,
  direction: SortDirection
) {
  return [...rows].sort((a, b) => {
    const comparison =
      key === "symbol"
        ? a.symbol.localeCompare(b.symbol)
        : compareNullableNumbers(sortValue(a, key), sortValue(b, key));
    const directed = direction === "asc" ? comparison : -comparison;
    return directed || a.rank - b.rank || a.symbol.localeCompare(b.symbol);
  });
}

function sortValue(row: RankedResult, key: Exclude<RankingSortKey, "symbol">) {
  if (key === "rank") return row.rank;
  return row[key];
}

function compareNullableNumbers(
  a: number | null | undefined,
  b: number | null | undefined
) {
  const aMissing = a === null || a === undefined || Number.isNaN(a);
  const bMissing = b === null || b === undefined || Number.isNaN(b);
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;
  return a - b;
}

export function defaultSortDirection(key: RankingSortKey): SortDirection {
  if (key === "rank" || key === "symbol" || key === "max_drawdown_pct") return "asc";
  return "desc";
}

export function aggregateMetrics(
  report: BatchBacktestReport,
  completed: BatchBacktestSymbolResult[],
  failed: BatchBacktestSymbolResult[]
): AggregateMetrics {
  const totalSymbols = report.job.total_symbols || completed.length + failed.length;
  const successfulSymbols = completed.length;

  return {
    successfulSymbols,
    averageReturnPct: averageNumeric(completed.map((r) => r.total_return_pct)),
    averageBuyHoldReturnPct:
      report.summary.average_buy_hold_return_pct ??
      averageNumeric(completed.map((r) => r.buy_hold_return_pct)),
    averageAlphaReturnPct:
      report.summary.average_alpha_return_pct ??
      averageNumeric(completed.map((r) => r.alpha_return_pct)),
    medianReturnPct:
      report.summary.median_return_pct ??
      medianNumeric(completed.map((r) => r.total_return_pct)),
    averageSharpe:
      report.summary.average_sharpe ??
      averageNumeric(completed.map((r) => r.sharpe)),
    averageMaxDrawdownPct:
      report.summary.average_max_drawdown_pct ??
      averageNumeric(completed.map((r) => r.max_drawdown_pct)),
    averageWinRatePct: averageNumeric(completed.map((r) => r.win_rate_pct)),
    averageTrades: averageNumeric(completed.map((r) => r.num_trades)),
    averageFinalEquity: averageNumeric(completed.map((r) => r.final_equity)),
    totalTrades:
      report.summary.total_trades ??
      completed.reduce((sum, row) => sum + (row.num_trades ?? 0), 0),
    successRatePct: totalSymbols > 0 ? (successfulSymbols / totalSymbols) * 100 : null,
  };
}

function averageNumeric(values: Array<number | null | undefined>) {
  const nums = values.filter(isFiniteNumber);
  if (nums.length === 0) return null;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

function medianNumeric(values: Array<number | null | undefined>) {
  const nums = values.filter(isFiniteNumber).sort((a, b) => a - b);
  if (nums.length === 0) return null;
  const mid = Math.floor(nums.length / 2);
  if (nums.length % 2 === 1) return nums[mid];
  return (nums[mid - 1] + nums[mid]) / 2;
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function representativeChartData(report: BatchBacktestReport) {
  const reps = report.summary.representative_symbols ?? {};
  const symbols = [reps.best, reps.median, reps.worst].filter(
    (symbol, index, arr): symbol is string =>
      !!symbol && arr.indexOf(symbol) === index
  );
  const rows = report.results.filter((r) => symbols.includes(r.symbol));
  const byTs = new Map<string, Record<string, number | string>>();
  for (const row of rows) {
    for (const point of row.equity_curve) {
      const item = byTs.get(point.timestamp) ?? { timestamp: point.timestamp };
      item[row.symbol] = point.equity;
      byTs.set(point.timestamp, item);
    }
  }
  return {
    symbols,
    chartData: [...byTs.values()].sort((a, b) =>
      String(a.timestamp).localeCompare(String(b.timestamp))
    ),
  };
}

