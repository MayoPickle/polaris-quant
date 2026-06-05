// Minimal typed client for the Polaris Quant backend.
// Framework-agnostic fetch wrapper; works in Server and Client Components.

import type {
  Account,
  AuthCredentials,
  AuthUser,
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
  SetupStatus,
  StrategyDescriptor,
  StrategyInstance,
  StrategyInstanceCreate,
  StrategyInstanceUpdate,
} from "@/types";
import type { Locale } from "@/lib/i18n/config";

const PUBLIC_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api/v1";
const SERVER_BASE_URL =
  process.env.SERVER_API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:8000/api/v1";

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function apiBaseUrl(): string {
  return trimTrailingSlash(
    typeof window === "undefined" ? SERVER_BASE_URL : PUBLIC_BASE_URL
  );
}

type HeaderProvider = () => HeadersInit | Promise<HeadersInit>;

async function request<T>(
  path: string,
  init?: RequestInit,
  locale?: Locale,
  headerProvider?: HeaderProvider
): Promise<T> {
  const headers = new Headers(await headerProvider?.());
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
  headers.set("Content-Type", "application/json");
  if (locale) headers.set("Accept-Language", locale);

  const res = await fetch(`${apiBaseUrl()}${path}`, {
    cache: "no-store",
    credentials: "include",
    ...init,
    headers,
  });
  if (!res.ok) {
    throw new Error(await responseErrorMessage(res));
  }
  return res.json() as Promise<T>;
}

async function responseErrorMessage(res: Response): Promise<string> {
  const text = await res.text();
  if (!text) return `API ${res.status}`;
  try {
    const payload = JSON.parse(text) as { detail?: unknown };
    if (typeof payload.detail === "string") return payload.detail;
    if (Array.isArray(payload.detail)) {
      return payload.detail
        .map((item) =>
          typeof item?.msg === "string" ? item.msg : JSON.stringify(item)
        )
        .join("; ");
    }
  } catch {
    // Fall through to raw text below.
  }
  return text;
}

export function createApiClient(headerProvider?: HeaderProvider) {
  return {
    health: () => request<Health>("/health", undefined, undefined, headerProvider),

    // Auth
    setupStatus: () =>
      request<SetupStatus>("/auth/setup-status", undefined, undefined, headerProvider),
    setup: (body: AuthCredentials) =>
      request<AuthUser>("/auth/setup", {
        method: "POST",
        body: JSON.stringify(body),
      }, undefined, headerProvider),
    login: (body: AuthCredentials) =>
      request<AuthUser>("/auth/login", {
        method: "POST",
        body: JSON.stringify(body),
      }, undefined, headerProvider),
    logout: () =>
      request<{ ok: boolean }>("/auth/logout", { method: "POST" }, undefined, headerProvider),
    me: () => request<AuthUser>("/auth/me", undefined, undefined, headerProvider),

    // Strategies
    availableStrategies: (locale?: Locale) =>
      request<StrategyDescriptor[]>("/strategies/available", undefined, locale, headerProvider),
    listStrategies: () => request<StrategyInstance[]>("/strategies", undefined, undefined, headerProvider),
    createStrategy: (body: StrategyInstanceCreate) =>
      request<StrategyInstance>("/strategies", {
        method: "POST",
        body: JSON.stringify(body),
      }, undefined, headerProvider),
    updateStrategy: (id: number, body: StrategyInstanceUpdate) =>
      request<StrategyInstance>(`/strategies/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }, undefined, headerProvider),
    backtest: (body: BacktestRequest) =>
      request<BacktestResult>("/strategies/backtest", {
        method: "POST",
        body: JSON.stringify(body),
      }, undefined, headerProvider),
    backtestCompare: (body: BacktestCompareRequest) =>
      request<BacktestCompareResult>("/strategies/backtest/compare", {
        method: "POST",
        body: JSON.stringify(body),
      }, undefined, headerProvider),
    backtestUniverses: (locale?: Locale) =>
      request<BacktestUniverse[]>("/strategies/backtest/universes", undefined, locale, headerProvider),
    createBatchBacktest: (body: BatchBacktestRequest) =>
      request<BatchBacktestJob>("/strategies/backtest/batch", {
        method: "POST",
        body: JSON.stringify(body),
      }, undefined, headerProvider),
    latestBatchBacktest: () =>
      request<BatchBacktestJob | null>("/strategies/backtest/batch/latest", undefined, undefined, headerProvider),
    batchBacktest: (jobId: string) =>
      request<BatchBacktestJob>(`/strategies/backtest/batch/${jobId}`, undefined, undefined, headerProvider),
    batchBacktestReport: (jobId: string) =>
      request<BatchBacktestReport>(`/strategies/backtest/batch/${jobId}/report`, undefined, undefined, headerProvider),
    cancelBatchBacktest: (jobId: string) =>
      request<BatchBacktestJob>(`/strategies/backtest/batch/${jobId}`, {
        method: "DELETE",
      }, undefined, headerProvider),

    // Orders
    listOrders: () => request<Order[]>("/orders", undefined, undefined, headerProvider),
    createOrder: (body: OrderCreate) =>
      request<Order>("/orders", { method: "POST", body: JSON.stringify(body) }, undefined, headerProvider),

    // Portfolio & market
    listPositions: () => request<Position[]>("/positions", undefined, undefined, headerProvider),
    account: () => request<Account>("/account", undefined, undefined, headerProvider),
    quote: (symbol: string) => request<Quote>(`/market/quote/${symbol}`, undefined, undefined, headerProvider),
    marketBars: (
      symbols: string[],
      options: { timeframe?: string; lookback_days?: number } = {}
    ) => {
      const params = new URLSearchParams({
        symbols: symbols.join(","),
        timeframe: options.timeframe ?? "1Day",
        lookback_days: String(options.lookback_days ?? 90),
      });
      return request<MarketBarsResponse>(`/market/bars?${params}`, undefined, undefined, headerProvider);
    },
    marketClock: () => request<{ is_open: boolean }>("/market/clock", undefined, undefined, headerProvider),
  };
}

export const api = createApiClient();
