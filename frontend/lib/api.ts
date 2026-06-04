// Minimal typed client for the Polaris Quant backend.
// Framework-agnostic fetch wrapper; works in Server and Client Components.

import type {
  Account,
  BacktestCompareRequest,
  BacktestCompareResult,
  BacktestRequest,
  BacktestResult,
  Order,
  OrderCreate,
  Position,
  Quote,
  StrategyDescriptor,
  StrategyInstance,
  StrategyInstanceCreate,
} from "@/types";

const BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`API ${res.status}: ${detail}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  // Strategies
  availableStrategies: () =>
    request<StrategyDescriptor[]>("/strategies/available"),
  listStrategies: () => request<StrategyInstance[]>("/strategies"),
  createStrategy: (body: StrategyInstanceCreate) =>
    request<StrategyInstance>("/strategies", {
      method: "POST",
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

  // Orders
  listOrders: () => request<Order[]>("/orders"),
  createOrder: (body: OrderCreate) =>
    request<Order>("/orders", { method: "POST", body: JSON.stringify(body) }),

  // Portfolio & market
  listPositions: () => request<Position[]>("/positions"),
  account: () => request<Account>("/account"),
  quote: (symbol: string) => request<Quote>(`/market/quote/${symbol}`),
  marketClock: () => request<{ is_open: boolean }>("/market/clock"),
};
