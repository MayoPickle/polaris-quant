// Minimal typed client for the Polaris Quant backend.
// Framework-agnostic fetch wrapper; works in Server and Client Components.

import type {
  Account,
  BacktestCompareRequest,
  BacktestCompareResult,
  BacktestRequest,
  BacktestResult,
  BacktestUniverse,
  BatchBacktestJob,
  BatchBacktestReport,
  BatchBacktestRequest,
  Health,
  MarketBarsResponse,
  Order,
  OrderCreate,
  Position,
  Quote,
  StrategyDescriptor,
  StrategyInstance,
  StrategyInstanceCreate,
  StrategyInstanceUpdate,
} from "@/types";

const BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    cache: "no-store",
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`API ${res.status}: ${detail}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  health: () => request<Health>("/health"),

  // Strategies
  availableStrategies: () =>
    request<StrategyDescriptor[]>("/strategies/available"),
  listStrategies: () => request<StrategyInstance[]>("/strategies"),
  createStrategy: (body: StrategyInstanceCreate) =>
    request<StrategyInstance>("/strategies", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateStrategy: (id: number, body: StrategyInstanceUpdate) =>
    request<StrategyInstance>(`/strategies/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  backtest: (body: BacktestRequest) =>
    request<BacktestResult>("/strategies/backtest", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  backtestCompare: (body: BacktestCompareRequest) =>
    request<BacktestCompareResult>("/strategies/backtest/compare", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  backtestUniverses: () =>
    request<BacktestUniverse[]>("/strategies/backtest/universes"),
  createBatchBacktest: (body: BatchBacktestRequest) =>
    request<BatchBacktestJob>("/strategies/backtest/batch", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  batchBacktest: (jobId: string) =>
    request<BatchBacktestJob>(`/strategies/backtest/batch/${jobId}`),
  batchBacktestReport: (jobId: string) =>
    request<BatchBacktestReport>(`/strategies/backtest/batch/${jobId}/report`),
  cancelBatchBacktest: (jobId: string) =>
    request<BatchBacktestJob>(`/strategies/backtest/batch/${jobId}`, {
      method: "DELETE",
    }),

  // Orders
  listOrders: () => request<Order[]>("/orders"),
  createOrder: (body: OrderCreate) =>
    request<Order>("/orders", { method: "POST", body: JSON.stringify(body) }),

  // Portfolio & market
  listPositions: () => request<Position[]>("/positions"),
  account: () => request<Account>("/account"),
  quote: (symbol: string) => request<Quote>(`/market/quote/${symbol}`),
  marketBars: (
    symbols: string[],
    options: { timeframe?: string; lookback_days?: number } = {}
  ) => {
    const params = new URLSearchParams({
      symbols: symbols.join(","),
      timeframe: options.timeframe ?? "1Day",
      lookback_days: String(options.lookback_days ?? 90),
    });
    return request<MarketBarsResponse>(`/market/bars?${params}`);
  },
  marketClock: () => request<{ is_open: boolean }>("/market/clock"),
};
