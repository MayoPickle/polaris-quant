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
  MarketClock,
  MarketBarsResponse,
  MarketSnapshotsResponse,
  MarketDataAssetRefresh,
  MarketDataCoverage,
  MarketDataCoverageReconcile,
  MarketDataCoverageSummary,
  MarketDataIngestionJob,
  MarketDataIngestionJobCreate,
  Order,
  OrderCreate,
  Position,
  Quote,
  SetupStatus,
  StrategyDescriptor,
  StrategyInstance,
  StrategyInstanceCreate,
  StrategyInstanceUpdate,
  StrategySignal,
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
  if (res.status === 204) {
    return undefined as T;
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
    me: () => request<AuthUser>("/auth/me", undefined, undefined, headerProvider),

    // Strategies
    availableStrategies: (locale?: Locale) =>
      request<StrategyDescriptor[]>("/strategies/available", undefined, locale, headerProvider),
    listStrategies: (options: { includeArchived?: boolean } = {}) => {
      const params = new URLSearchParams();
      if (options.includeArchived) params.set("include_archived", "true");
      const query = params.toString();
      return request<StrategyInstance[]>(
        `/strategies${query ? `?${query}` : ""}`,
        undefined,
        undefined,
        headerProvider
      );
    },
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
    archiveStrategy: (id: number) =>
      request<StrategyInstance>(`/strategies/${id}`, {
        method: "DELETE",
      }, undefined, headerProvider),
    strategySignals: (
      options: { strategyInstanceId?: number; limit?: number } = {}
    ) => {
      const params = new URLSearchParams();
      if (options.strategyInstanceId) {
        params.set("strategy_instance_id", String(options.strategyInstanceId));
      }
      if (options.limit) params.set("limit", String(options.limit));
      const query = params.toString();
      return request<StrategySignal[]>(
        `/strategies/signals${query ? `?${query}` : ""}`,
        undefined,
        undefined,
        headerProvider
      );
    },
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
    cancelOrder: (orderId: number) =>
      request<Order>(`/orders/${orderId}/cancel`, { method: "POST" }, undefined, headerProvider),

    // Portfolio & market
    listPositions: () => request<Position[]>("/positions", undefined, undefined, headerProvider),
    account: () => request<Account>("/account", undefined, undefined, headerProvider),
    quote: (symbol: string) => request<Quote>(`/market/quote/${symbol}`, undefined, undefined, headerProvider),
    marketBars: (
      symbols: string[],
      options: {
        timeframe?: string;
        lookback_days?: number;
        start_date?: string;
        end_date?: string;
      } = {}
    ) => {
      const params = new URLSearchParams({ symbols: symbols.join(",") });
      const hasDateRange = Boolean(options.start_date || options.end_date);
      if (options.timeframe) {
        params.set("timeframe", options.timeframe);
      } else if (!hasDateRange) {
        params.set("timeframe", "1Day");
      }
      if (options.lookback_days != null) {
        params.set("lookback_days", String(options.lookback_days));
      } else if (!hasDateRange) {
        params.set("lookback_days", "90");
      }
      if (options.start_date) params.set("start_date", options.start_date);
      if (options.end_date) params.set("end_date", options.end_date);
      return request<MarketBarsResponse>(`/market/bars?${params}`, undefined, undefined, headerProvider);
    },
    marketSnapshots: (symbols: string[]) => {
      const params = new URLSearchParams({ symbols: symbols.join(",") });
      return request<MarketSnapshotsResponse>(
        `/market/snapshots?${params}`,
        undefined,
        undefined,
        headerProvider
      );
    },
    marketClock: () => request<MarketClock>("/market/clock", undefined, undefined, headerProvider),

    // Market data ingestion
    marketDataRefreshAssets: () =>
      request<MarketDataAssetRefresh>(
        "/market-data/assets/refresh",
        { method: "POST" },
        undefined,
        headerProvider
      ),
    marketDataCreateIngestionJob: (body: MarketDataIngestionJobCreate) =>
      request<MarketDataIngestionJob>(
        "/market-data/ingestion-jobs",
        { method: "POST", body: JSON.stringify(body) },
        undefined,
        headerProvider
      ),
    marketDataIngestionJobs: (
      options: { kind?: string; status?: string; limit?: number; offset?: number } = {}
    ) => {
      const params = new URLSearchParams();
      if (options.kind) params.set("kind", options.kind);
      if (options.status) params.set("status", options.status);
      if (options.limit) params.set("limit", String(options.limit));
      if (options.offset) params.set("offset", String(options.offset));
      const query = params.toString();
      return request<MarketDataIngestionJob[]>(
        `/market-data/ingestion-jobs${query ? `?${query}` : ""}`,
        undefined,
        undefined,
        headerProvider
      );
    },
    marketDataIngestionJob: (jobId: string) =>
      request<MarketDataIngestionJob>(
        `/market-data/ingestion-jobs/${jobId}`,
        undefined,
        undefined,
        headerProvider
      ),
    marketDataPauseIngestionJob: (jobId: string) =>
      request<MarketDataIngestionJob>(
        `/market-data/ingestion-jobs/${jobId}/pause`,
        { method: "POST" },
        undefined,
        headerProvider
      ),
    marketDataResumeIngestionJob: (jobId: string) =>
      request<MarketDataIngestionJob>(
        `/market-data/ingestion-jobs/${jobId}/resume`,
        { method: "POST" },
        undefined,
        headerProvider
      ),
    marketDataCancelIngestionJob: (jobId: string) =>
      request<MarketDataIngestionJob>(
        `/market-data/ingestion-jobs/${jobId}/cancel`,
        { method: "POST" },
        undefined,
        headerProvider
      ),
    marketDataDeleteIngestionJob: (jobId: string) =>
      request<void>(
        `/market-data/ingestion-jobs/${jobId}`,
        { method: "DELETE" },
        undefined,
        headerProvider
      ),
    marketDataCoverage: (
      symbol: string,
      options: { provider?: string; feed?: string; timeframe?: string; adjustment?: string } = {}
    ) => {
      const params = new URLSearchParams({
        symbol,
        timeframe: options.timeframe ?? "1Min",
        provider: options.provider ?? "alpaca",
        feed: options.feed ?? "sip",
        adjustment: options.adjustment ?? "split",
      });
      return request<MarketDataCoverage[]>(
        `/market-data/coverage?${params}`,
        undefined,
        undefined,
        headerProvider
      );
    },
    marketDataCoverageSummary: () =>
      request<MarketDataCoverageSummary>(
        "/market-data/coverage/summary",
        undefined,
        undefined,
        headerProvider
      ),
    marketDataReconcileCoverage: (
      options: {
        symbol?: string;
        provider?: string;
        feed?: string;
        timeframe?: string;
        adjustment?: string;
        limit?: number;
      } = {}
    ) => {
      const params = new URLSearchParams({
        timeframe: options.timeframe ?? "1Min",
        provider: options.provider ?? "alpaca",
        feed: options.feed ?? "sip",
        adjustment: options.adjustment ?? "split",
      });
      if (options.symbol) params.set("symbol", options.symbol);
      if (options.limit) params.set("limit", String(options.limit));
      return request<MarketDataCoverageReconcile>(
        `/market-data/coverage/reconcile?${params}`,
        { method: "POST" },
        undefined,
        headerProvider
      );
    },
  };
}

export const api = createApiClient();
