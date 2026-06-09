"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ListChecks,
  RefreshCw,
  Search,
  Star,
} from "lucide-react";
import {
  Bar as RechartsBar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n/client";
import type { Locale } from "@/lib/i18n/config";
import {
  formatCurrency,
  formatDateTime,
  formatPercent,
} from "@/lib/i18n/format";
import { cn } from "@/lib/utils";
import type {
  MarketBar,
  MarketBarsResponse,
  MarketSnapshot,
  MarketSnapshotsResponse,
} from "@/types";

type Timeframe = "1Min" | "1Hour" | "1Day";

const LOOKBACK_OPTIONS = [1, 7, 14, 90] as const;
type LookbackDays = (typeof LOOKBACK_OPTIONS)[number];
const DEFAULT_LOOKBACK_DAYS: LookbackDays = 1;
const SNAPSHOT_POLL_MS = 3_000;
const BAR_POLL_MS: Record<Timeframe, number> = {
  "1Min": 30_000,
  "1Hour": 60_000,
  "1Day": 60_000,
};
const INITIAL_CHART_DIMENSION = { width: 840, height: 420 };
const SYMBOL_RE = /^[A-Z][A-Z0-9.-]{0,14}$/;
const MAX_FAVORITE_SYMBOLS = 20;
const MAX_SNAPSHOT_SYMBOLS = 20;
const FAVORITES_STORAGE_KEY = "polaris.market.favoriteSymbols.v1";
const FAVORITES_CHANGED_EVENT = "polaris-market-favorites-changed";
const MARKET_TIME_ZONE = "America/New_York";
const ONE_DAY_INTRADAY_TICKS = [
  [9, 0],
  [10, 30],
  [12, 0],
  [13, 30],
  [15, 0],
  [16, 30],
] as const;
const MARKET_TIME_PARTS_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: MARKET_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const MARKET_STYLE = {
  "--market-bg": "var(--background)",
  "--market-panel": "var(--card)",
  "--market-panel-2": "var(--muted)",
  "--market-border": "var(--border)",
  "--market-text": "var(--foreground)",
  "--market-muted": "var(--muted-foreground)",
  "--market-accent": "var(--primary)",
  "--market-accent-foreground": "var(--primary-foreground)",
  "--market-positive": "#16a34a",
  "--market-negative": "#dc2626",
} as CSSProperties;

const CHART_COLORS = {
  grid: "var(--market-border)",
  axis: "var(--market-muted)",
  price: "var(--market-text)",
  volume: "var(--market-text)",
  reference: "var(--market-muted)",
  surface: "var(--market-panel)",
  text: "var(--market-text)",
  muted: "var(--market-muted)",
};

type MarketDashboardProps = {
  initialSnapshots: MarketSnapshotsResponse | null;
  initialBars: MarketBarsResponse | null;
  initialFavoriteSymbols: string[];
  initialSymbol: string;
};

type ChartRow = {
  timestamp: string;
  timeMs: number;
  price: number;
  volume: number | null;
  live?: boolean;
};

type ChartDisplayRow = ChartRow & {
  chartX: number;
};

export function MarketDashboard({
  initialSnapshots,
  initialBars,
  initialFavoriteSymbols,
  initialSymbol,
}: MarketDashboardProps) {
  const { locale, t } = useI18n();
  const favoriteStorageValue = useSyncExternalStore(
    subscribeFavoriteSymbols,
    getFavoriteSymbolsSnapshot,
    getFavoriteSymbolsServerSnapshot
  );
  const favoriteSymbols = useMemo(
    () => parseFavoriteSymbols(favoriteStorageValue, initialFavoriteSymbols),
    [favoriteStorageValue, initialFavoriteSymbols]
  );
  const [selectedSymbol, setSelectedSymbol] = useState(initialSymbol);
  const [symbolInput, setSymbolInput] = useState(initialSymbol);
  const [lookbackDays, setLookbackDays] = useState<LookbackDays>(
    DEFAULT_LOOKBACK_DAYS
  );
  const timeframe = timeframeForLookback(lookbackDays);
  const [snapshots, setSnapshots] = useState<MarketSnapshot[]>(
    initialSnapshots?.snapshots ?? []
  );
  const [bars, setBars] = useState<MarketBar[]>(() =>
    barsForSymbol(initialBars, initialSymbol)
  );
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [snapshotRefreshing, setSnapshotRefreshing] = useState(false);
  const [barsRefreshing, setBarsRefreshing] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [watchlistOpen, setWatchlistOpen] = useState(false);

  const snapshotError = t.pages.market.snapshotError;
  const barsError = t.pages.market.barsError;
  const favoriteLimitError = t.pages.market.favoriteLimit;

  const favoriteSymbolSet = useMemo(
    () => new Set(favoriteSymbols),
    [favoriteSymbols]
  );
  const snapshotSymbols = useMemo(
    () => normalizeSymbols([selectedSymbol, ...favoriteSymbols]),
    [favoriteSymbols, selectedSymbol]
  );

  const snapshotBySymbol = useMemo(() => {
    return new Map(snapshots.map((snapshot) => [snapshot.symbol, snapshot]));
  }, [snapshots]);

  const selectedSnapshot = snapshotBySymbol.get(selectedSymbol) ?? null;
  const selectedIsFavorite = favoriteSymbolSet.has(selectedSymbol);
  const latestBar = bars.length > 0 ? bars[bars.length - 1] : null;
  const selectedLatestTradePrice = positiveNumber(
    selectedSnapshot?.latest_trade_price
  );
  const selectedLatestTradeTimestamp =
    selectedSnapshot?.latest_trade_timestamp ?? null;
  const selectedPreviousClosePrice = positiveNumber(
    selectedSnapshot?.previous_close
  );
  const selectedPrice = snapshotDisplayPrice(selectedSnapshot, latestBar?.close ?? null);
  const selectedChange = priceChange(selectedSnapshot, selectedPrice);
  const chartRows = buildChartRows(
    bars,
    selectedLatestTradePrice,
    selectedLatestTradeTimestamp
  );
  const recentBars = useMemo(() => bars.slice(-10).reverse(), [bars]);

  const loadSnapshots = useCallback(
    async (nextSymbols: string[], silent = false) => {
      const normalizedSymbols = normalizeSymbols(nextSymbols);
      if (normalizedSymbols.length === 0) return;
      if (!silent) setSnapshotRefreshing(true);
      try {
        const responses = await Promise.all(
          chunkSymbols(normalizedSymbols, MAX_SNAPSHOT_SYMBOLS).map((chunk) =>
            api.marketSnapshots(chunk)
          )
        );
        setSnapshots(responses.flatMap((response) => response.snapshots));
        setLastUpdated(new Date());
        setError(null);
      } catch {
        setError(snapshotError);
      } finally {
        if (!silent) setSnapshotRefreshing(false);
      }
    },
    [snapshotError]
  );

  const loadBars = useCallback(
    async (
      symbol: string,
      nextTimeframe: Timeframe,
      nextLookbackDays: number,
      silent = false
    ) => {
      if (!silent) setBarsRefreshing(true);
      try {
        const response = await api.marketBars([symbol], {
          timeframe: nextTimeframe,
          lookback_days: nextLookbackDays,
        });
        setBars(barsForSymbol(response, symbol));
        setError(null);
      } catch {
        setBars([]);
        setError(barsError);
      } finally {
        if (!silent) setBarsRefreshing(false);
      }
    },
    [barsError]
  );

  useEffect(() => {
    function updateVisibility() {
      setIsVisible(!document.hidden);
    }

    updateVisibility();
    document.addEventListener("visibilitychange", updateVisibility);
    return () => document.removeEventListener("visibilitychange", updateVisibility);
  }, []);

  useEffect(() => {
    if (!isVisible) return;
    const kick = window.setTimeout(() => {
      void loadSnapshots(snapshotSymbols, true);
    }, 0);
    const id = window.setInterval(() => {
      void loadSnapshots(snapshotSymbols, true);
    }, SNAPSHOT_POLL_MS);
    return () => {
      window.clearTimeout(kick);
      window.clearInterval(id);
    };
  }, [isVisible, loadSnapshots, snapshotSymbols]);

  useEffect(() => {
    if (!isVisible) return;
    const kick = window.setTimeout(() => {
      void loadBars(selectedSymbol, timeframe, lookbackDays, true);
    }, 0);
    const id = window.setInterval(() => {
      void loadBars(selectedSymbol, timeframe, lookbackDays, true);
    }, BAR_POLL_MS[timeframe]);
    return () => {
      window.clearTimeout(kick);
      window.clearInterval(id);
    };
  }, [isVisible, loadBars, selectedSymbol, timeframe, lookbackDays]);

  function submitSymbol(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextSymbol = symbolInput.trim().toUpperCase();
    if (!SYMBOL_RE.test(nextSymbol)) {
      setError(t.pages.market.invalidSymbol);
      return;
    }

    setSelectedSymbol(nextSymbol);
    setSymbolInput(nextSymbol);
    setError(null);
    void loadSnapshots(normalizeSymbols([nextSymbol, ...favoriteSymbols]));
    void loadBars(nextSymbol, timeframe, lookbackDays);
  }

  function selectSymbol(symbol: string) {
    setSelectedSymbol(symbol);
    setSymbolInput(symbol);
    setWatchlistOpen(false);
    void loadBars(symbol, timeframe, lookbackDays);
  }

  function changeLookback(values: string[]) {
    const nextLookbackDays = Number(values[0]);
    if (!LOOKBACK_OPTIONS.includes(nextLookbackDays as LookbackDays)) {
      return;
    }
    setLookbackDays(nextLookbackDays as LookbackDays);
  }

  function refreshAll() {
    void loadSnapshots(snapshotSymbols);
    void loadBars(selectedSymbol, timeframe, lookbackDays);
  }

  function addFavorite(symbol: string) {
    const normalized = normalizeSymbols([symbol])[0];
    if (!normalized || favoriteSymbolSet.has(normalized)) return;
    if (favoriteSymbols.length >= MAX_FAVORITE_SYMBOLS) {
      setError(favoriteLimitError);
      return;
    }

    writeFavoriteSymbols([normalized, ...favoriteSymbols]);
    setError(null);
    void loadSnapshots(normalizeSymbols([selectedSymbol, normalized, ...favoriteSymbols]));
  }

  function removeFavorite(symbol: string) {
    writeFavoriteSymbols(favoriteSymbols.filter((item) => item !== symbol));
  }

  function toggleSelectedFavorite() {
    if (selectedIsFavorite) {
      removeFavorite(selectedSymbol);
      return;
    }

    addFavorite(selectedSymbol);
  }

  const isRefreshing = snapshotRefreshing || barsRefreshing;
  const refreshLabel = isRefreshing
    ? t.pages.market.refreshing
    : t.pages.market.refreshNow;

  return (
    <div
      style={MARKET_STYLE}
      className="flex flex-col gap-4 text-foreground md:gap-5"
    >
      <section className="rounded-lg border bg-card px-3 py-3 text-card-foreground shadow-[0_1px_2px_rgba(15,23,42,0.03)] md:px-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(18rem,32rem)_1fr] lg:items-end">
          <form
            onSubmit={submitSymbol}
            className="min-w-0"
          >
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className="flex items-center justify-between gap-3 text-xs font-medium text-muted-foreground">
                <span>
                {t.pages.market.symbol}
                </span>
                <span className="hidden font-mono font-normal sm:inline">
                  {t.pages.market.lastUpdated}: {formatLocalTime(lastUpdated, locale)}
                </span>
              </span>
              <div className="flex h-11 min-w-0 items-center gap-2 rounded-lg border bg-background p-1 pl-3 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/20">
                <Search className="text-muted-foreground" data-icon="inline-start" />
                <input
                  value={symbolInput}
                  onChange={(event) => setSymbolInput(event.target.value)}
                  placeholder={t.pages.market.searchPlaceholder}
                  className="h-full min-w-0 flex-1 bg-transparent font-mono text-sm font-semibold uppercase text-foreground outline-none placeholder:text-muted-foreground"
                />
                <Button type="submit" size="sm" className="h-8 px-3">
                  {t.pages.market.loadSymbol}
                </Button>
              </div>
            </label>
          </form>

          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 lg:flex lg:flex-wrap lg:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setWatchlistOpen(true)}
              className="min-w-0 justify-center px-2"
            >
              <ListChecks data-icon="inline-start" />
              <span className="min-w-0 truncate">
                {t.pages.market.watchlistTitle}
              </span>
              <span className="rounded-md bg-muted px-1.5 font-mono text-xs text-muted-foreground">
                {favoriteSymbols.length}
              </span>
            </Button>
            <Button
              type="button"
              variant={selectedIsFavorite ? "secondary" : "outline"}
              onClick={toggleSelectedFavorite}
              className="min-w-0 justify-center px-2"
              aria-pressed={selectedIsFavorite}
            >
              <Star
                data-icon="inline-start"
                className={cn(selectedIsFavorite && "fill-current")}
              />
              {selectedIsFavorite
                ? t.pages.market.favoriteSaved
                : t.pages.market.addFavorite}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={refreshAll}
              disabled={isRefreshing}
              className="size-9 lg:w-auto lg:px-3"
              aria-label={refreshLabel}
              title={refreshLabel}
            >
              <RefreshCw
                data-icon="inline-start"
                className={cn(isRefreshing && "animate-spin")}
              />
              <span className="sr-only lg:not-sr-only lg:ml-1.5">
                {refreshLabel}
              </span>
            </Button>
          </div>
        </div>

        <div className="mt-2 font-mono text-xs text-muted-foreground sm:hidden">
          {t.pages.market.lastUpdated}: {formatLocalTime(lastUpdated, locale)}
        </div>

        {error && (
          <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}
      </section>

      <Dialog open={watchlistOpen} onOpenChange={setWatchlistOpen}>
        <DialogContent className="max-h-[min(38rem,calc(100dvh-2rem))] overflow-hidden p-0 sm:max-w-md">
          <DialogHeader className="border-b px-4 py-4 pr-12">
            <DialogTitle>{t.pages.market.watchlistTitle}</DialogTitle>
            <DialogDescription>{t.pages.market.watchlistDescription}</DialogDescription>
          </DialogHeader>
          <div className="max-h-[calc(100dvh-9rem)] overflow-y-auto p-3">
            <WatchlistList
              symbols={favoriteSymbols}
              snapshotBySymbol={snapshotBySymbol}
              selectedSymbol={selectedSymbol}
              onSelect={selectSymbol}
              onRemove={removeFavorite}
              locale={locale}
              emptyLabel={t.pages.market.noFavorites}
              removeFavoriteLabel={t.pages.market.removeFavorite}
            />
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex min-w-0 flex-col gap-3">
        <TerminalPanel
          title={t.pages.market.chartTitle}
          description={t.pages.market.chartDescription}
          actions={
            <div className="grid min-w-0 gap-2 sm:flex sm:flex-wrap sm:items-end sm:justify-end">
              <ControlGroup label={t.pages.market.lookback} className="w-full sm:w-auto">
                <ToggleGroup
                  value={[String(lookbackDays)]}
                  onValueChange={changeLookback}
                  variant="outline"
                  size="sm"
                  spacing={0}
                  aria-label={t.pages.market.lookback}
                  className="w-full"
                >
                  {LOOKBACK_OPTIONS.map((item) => (
                    <ToggleGroupItem
                      key={item}
                      value={String(item)}
                      className="min-w-0 flex-1 text-muted-foreground data-[state=on]:bg-primary data-[state=on]:text-primary-foreground sm:min-w-10 sm:flex-none"
                    >
                      {item}D
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </ControlGroup>
            </div>
          }
        >
          <div className="flex flex-col gap-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)] lg:items-end">
              <div className="min-w-0">
                <p className="font-mono text-sm font-semibold tracking-[0.08em] text-muted-foreground">
                  {selectedSymbol}
                </p>
                <div className="mt-1 flex flex-wrap items-baseline gap-2 md:gap-3">
                  <p className="min-w-0 font-mono text-xl font-semibold leading-tight tracking-tight text-foreground sm:text-2xl md:text-3xl">
                    {formatCurrencyMaybe(selectedPrice, locale)}
                  </p>
                  <ChangeBadge change={selectedChange} locale={locale} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <MiniStat
                  label={t.pages.market.previousClose}
                  value={formatCurrencyMaybe(
                    positiveNumber(selectedSnapshot?.previous_close),
                    locale
                  )}
                />
                <MiniStat
                  label={t.pages.market.dayVolume}
                  value={formatCompactMaybe(
                    nonNegativeNumber(selectedSnapshot?.day_volume),
                    locale
                  )}
                />
              </div>
            </div>
            <div className="-mx-3 overflow-x-auto px-3 sm:-mx-4 sm:px-4">
              <PriceChart
                rows={chartRows}
                locale={locale}
                timeframe={timeframe}
                lookbackDays={lookbackDays}
                previousClosePrice={selectedPreviousClosePrice}
                emptyLabel={t.pages.market.noBars}
                priceLabel={t.pages.market.close}
                volumeLabel={t.pages.market.volume}
              />
            </div>
          </div>
        </TerminalPanel>

        <QuotePanel
          snapshot={selectedSnapshot}
          locale={locale}
          title={t.pages.market.quoteTitle}
          labels={{
            latestTrade: t.pages.market.latestTrade,
            bid: t.pages.market.bid,
            ask: t.pages.market.ask,
            spread: t.pages.market.spread,
            midpoint: t.pages.market.midpoint,
            tradeSize: t.pages.market.tradeSize,
            tradeTime: t.pages.market.tradeTime,
            dayOpen: t.pages.market.dayOpen,
            dayHigh: t.pages.market.dayHigh,
            dayLow: t.pages.market.dayLow,
            dayClose: t.pages.market.dayClose,
            dayRange: t.pages.market.dayRange,
            previousClose: t.pages.market.previousClose,
          }}
        />

        <BarsTablePanel
          bars={recentBars}
          locale={locale}
          title={t.pages.market.ohlcTitle}
          emptyLabel={t.pages.market.noBars}
          labels={{
            timestamp: t.pages.market.timestamp,
            open: t.pages.market.open,
            high: t.pages.market.high,
            low: t.pages.market.low,
            close: t.pages.market.close,
            volume: t.pages.market.volume,
          }}
        />
      </div>

      <p className="text-xs leading-5 text-muted-foreground">
        {t.pages.market.marketDataNote}
      </p>
    </div>
  );
}

function ControlGroup({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-1", className)}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function TerminalPanel({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "min-w-0 overflow-hidden rounded-lg border bg-card text-card-foreground shadow-[0_1px_2px_rgba(15,23,42,0.03)]",
        className
      )}
    >
      <header className="flex flex-col gap-3 border-b px-3 py-3 sm:flex-row sm:items-start sm:justify-between sm:px-4">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold tracking-tight">
            {title}
          </h2>
          {description && (
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </header>
      <div className="p-3 sm:p-4">{children}</div>
    </section>
  );
}

function WatchlistList({
  symbols,
  snapshotBySymbol,
  selectedSymbol,
  onSelect,
  onRemove,
  locale,
  emptyLabel,
  removeFavoriteLabel,
}: {
  symbols: string[];
  snapshotBySymbol: Map<string, MarketSnapshot>;
  selectedSymbol: string;
  onSelect: (symbol: string) => void;
  onRemove: (symbol: string) => void;
  locale: Locale;
  emptyLabel: string;
  removeFavoriteLabel: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      {symbols.map((symbol) => {
        const snapshot = snapshotBySymbol.get(symbol) ?? null;
        const quote = quoteMicrostructure(snapshot);
        const price = snapshotDisplayPrice(snapshot);
        const change = priceChange(snapshot, price);

        return (
          <div
            key={symbol}
            className={cn(
              "flex items-start gap-1 rounded-lg border border-transparent px-2 py-2 transition-colors hover:border-border hover:bg-muted/50",
              selectedSymbol === symbol && "border-primary/30 bg-muted"
            )}
          >
            <button
              type="button"
              aria-pressed={selectedSymbol === symbol}
              onClick={() => onSelect(symbol)}
              className="min-w-0 flex-1 rounded-md px-1 text-left"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-sm font-semibold text-foreground">
                  {symbol}
                </span>
                <span className="font-mono text-sm text-foreground">
                  {formatCurrencyMaybe(price, locale)}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-2 text-xs">
                <span className="font-mono text-muted-foreground">
                  {formatCurrencyMaybe(quote.bid, locale)} /{" "}
                  {formatCurrencyMaybe(quote.ask, locale)}
                </span>
                <ChangeText change={change} locale={locale} />
              </div>
            </button>
            <button
              type="button"
              aria-label={`${removeFavoriteLabel}: ${symbol}`}
              onClick={() => onRemove(symbol)}
              className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
            >
              <Star className="size-3.5 fill-current" aria-hidden="true" />
            </button>
          </div>
        );
      })}
      {symbols.length === 0 && (
        <div className="rounded-lg border border-dashed bg-muted/20 px-3 py-8 text-center text-sm text-muted-foreground">
          {emptyLabel}
        </div>
      )}
    </div>
  );
}

function PriceChart({
  rows,
  locale,
  timeframe,
  lookbackDays,
  previousClosePrice,
  emptyLabel,
  priceLabel,
  volumeLabel,
}: {
  rows: ChartRow[];
  locale: Locale;
  timeframe: Timeframe;
  lookbackDays: number;
  previousClosePrice: number | null;
  emptyLabel: string;
  priceLabel: string;
  volumeLabel: string;
}) {
  const isOneDayIntradayWindow = timeframe !== "1Day" && lookbackDays === 1;
  const isCompressedIntradayWindow = timeframe !== "1Day" && !isOneDayIntradayWindow;
  const oneDayIntradayDomain = useMemo(
    () => (isOneDayIntradayWindow ? getOneDayIntradayDomain(rows) : null),
    [isOneDayIntradayWindow, rows]
  );
  const oneDayIntradayTicks = useMemo(
    () =>
      oneDayIntradayDomain
        ? buildOneDayIntradayTicks(oneDayIntradayDomain)
        : undefined,
    [oneDayIntradayDomain]
  );
  const chartMargin = isOneDayIntradayWindow
    ? { top: 12, right: 22, bottom: 8, left: 22 }
    : { top: 12, right: 16, bottom: 8, left: 4 };
  const visibleRows = useMemo(
    () =>
      oneDayIntradayDomain
        ? rows.filter(
            (row) =>
              row.timeMs >= oneDayIntradayDomain[0] &&
              row.timeMs <= oneDayIntradayDomain[1]
          )
        : rows,
    [oneDayIntradayDomain, rows]
  );
  const displayRows = useMemo<ChartDisplayRow[]>(
    () =>
      visibleRows.map((row, index) => ({
        ...row,
        chartX: isCompressedIntradayWindow ? index : row.timeMs,
      })),
    [isCompressedIntradayWindow, visibleRows]
  );
  const compressedTicks = useMemo(
    () =>
      isCompressedIntradayWindow
        ? buildCompressedIntradayTicks(displayRows)
        : undefined,
    [displayRows, isCompressedIntradayWindow]
  );
  const xAxisDomain = isCompressedIntradayWindow
    ? [0, Math.max(displayRows.length - 1, 1)]
    : oneDayIntradayDomain ?? ["dataMin", "dataMax"];
  const xAxisTicks = isCompressedIntradayWindow
    ? compressedTicks
    : oneDayIntradayTicks;
  const xAxisDataKey = isCompressedIntradayWindow ? "chartX" : "timeMs";

  if (displayRows.length === 0) {
    return (
      <div className="flex h-80 items-center justify-center rounded-lg border border-dashed bg-muted/20 text-sm text-muted-foreground">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="h-[18rem] min-w-full sm:h-[21rem] sm:min-w-[36rem] md:h-[24rem] md:min-w-0">
      <ResponsiveContainer
        width="100%"
        height="100%"
        initialDimension={INITIAL_CHART_DIMENSION}
      >
        <ComposedChart
          data={displayRows}
          margin={chartMargin}
        >
          <CartesianGrid
            stroke={CHART_COLORS.grid}
            strokeDasharray="3 3"
            vertical={false}
          />
          <XAxis
            dataKey={xAxisDataKey}
            type="number"
            domain={xAxisDomain}
            ticks={xAxisTicks}
            interval={
              isOneDayIntradayWindow || isCompressedIntradayWindow
                ? 0
                : undefined
            }
            allowDataOverflow
            tickFormatter={(value: number) =>
              formatChartAxisTick({
                value,
                locale,
                timeframe,
                intradayOneDay: isOneDayIntradayWindow,
                intradayOpenTimeMs: oneDayIntradayDomain?.[0] ?? null,
                compressedIntraday: isCompressedIntradayWindow,
                rows: displayRows,
              })
            }
            minTickGap={isOneDayIntradayWindow ? 16 : 32}
            tickMargin={6}
            tick={{ fill: CHART_COLORS.axis, fontSize: 11 }}
            axisLine={{ stroke: CHART_COLORS.grid }}
            tickLine={{ stroke: CHART_COLORS.grid }}
          />
          <YAxis
            yAxisId="price"
            domain={["auto", "auto"]}
            width={0}
            hide
          />
          <YAxis yAxisId="volume" orientation="right" hide />
          <Tooltip
            contentStyle={{
              background: CHART_COLORS.surface,
              border: `1px solid ${CHART_COLORS.grid}`,
              borderRadius: 8,
              color: CHART_COLORS.text,
            }}
            labelStyle={{ color: CHART_COLORS.muted }}
            formatter={(value, name) => {
              const numeric = Number(value ?? 0);
              if (name === "volume") {
                return [formatCompactMaybe(numeric, locale), volumeLabel];
              }
              return [
                formatTooltipPrice(numeric, previousClosePrice, locale),
                priceLabel,
              ];
            }}
            labelFormatter={(label) =>
              formatChartTooltipTime(label, locale, {
                compressedIntraday: isCompressedIntradayWindow,
                rows: displayRows,
              })
            }
          />
          <RechartsBar
            yAxisId="volume"
            dataKey="volume"
            fill={CHART_COLORS.volume}
            fillOpacity={0.08}
            barSize={16}
            isAnimationActive={false}
          />
          <Line
            yAxisId="price"
            type="monotone"
            dataKey="price"
            stroke={CHART_COLORS.price}
            strokeWidth={2}
            dot={false}
            activeDot={{
              r: 4,
              fill: CHART_COLORS.price,
              stroke: CHART_COLORS.surface,
              strokeWidth: 2,
            }}
            isAnimationActive={false}
          />
          {previousClosePrice != null && (
            <ReferenceLine
              yAxisId="price"
              y={previousClosePrice}
              stroke={CHART_COLORS.reference}
              strokeOpacity={0.72}
              strokeDasharray="4 4"
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function QuotePanel({
  snapshot,
  locale,
  title,
  labels,
}: {
  snapshot: MarketSnapshot | null;
  locale: Locale;
  title: string;
  labels: {
    latestTrade: string;
    bid: string;
    ask: string;
    spread: string;
    midpoint: string;
    tradeSize: string;
    tradeTime: string;
    dayOpen: string;
    dayHigh: string;
    dayLow: string;
    dayClose: string;
    dayRange: string;
    previousClose: string;
  };
}) {
  const quote = quoteMicrostructure(snapshot);
  const dayLow = positiveNumber(snapshot?.day_low);
  const dayHigh = positiveNumber(snapshot?.day_high);
  const dayRange =
    dayLow != null && dayHigh != null && dayHigh >= dayLow
      ? `${formatCurrencyMaybe(dayLow, locale)} - ${formatCurrencyMaybe(
          dayHigh,
          locale
        )}`
      : "--";

  return (
    <TerminalPanel title={title}>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <QuoteMetric
          label={labels.latestTrade}
          value={formatCurrencyMaybe(
            positiveNumber(snapshot?.latest_trade_price),
            locale
          )}
          emphatic
          className="sm:col-span-2 xl:col-span-1"
        />
        <QuoteMetric
          label={labels.bid}
          value={formatCurrencyMaybe(quote.bid, locale)}
        />
        <QuoteMetric
          label={labels.ask}
          value={formatCurrencyMaybe(quote.ask, locale)}
        />
        <QuoteMetric
          label={labels.spread}
          value={formatCurrencyMaybe(quote.spread, locale)}
        />
        <QuoteMetric
          label={labels.midpoint}
          value={formatCurrencyMaybe(quote.midpoint, locale)}
        />
        <QuoteMetric
          label={labels.dayRange}
          value={dayRange}
          className="sm:col-span-2"
        />
        <QuoteMetric
          label={labels.dayOpen}
          value={formatCurrencyMaybe(positiveNumber(snapshot?.day_open), locale)}
        />
        <QuoteMetric
          label={labels.dayClose}
          value={formatCurrencyMaybe(positiveNumber(snapshot?.day_close), locale)}
        />
        <QuoteMetric
          label={labels.previousClose}
          value={formatCurrencyMaybe(
            positiveNumber(snapshot?.previous_close),
            locale
          )}
        />
        <QuoteMetric
          label={labels.tradeSize}
          value={formatCompactMaybe(
            positiveNumber(snapshot?.latest_trade_size),
            locale
          )}
        />
        <QuoteMetric
          label={labels.tradeTime}
          value={
            snapshot?.latest_trade_timestamp
              ? formatDateTime(snapshot.latest_trade_timestamp, locale)
              : "--"
          }
          className="sm:col-span-2"
        />
      </div>
    </TerminalPanel>
  );
}

function QuoteMetric({
  label,
  value,
  emphatic = false,
  className,
}: {
  label: string;
  value: string;
  emphatic?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border bg-background px-3 py-2", className)}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 truncate font-mono font-semibold text-foreground",
          emphatic ? "text-xl" : "text-sm"
        )}
      >
        {value}
      </p>
    </div>
  );
}

function BarsTablePanel({
  bars,
  locale,
  title,
  emptyLabel,
  labels,
}: {
  bars: MarketBar[];
  locale: Locale;
  title: string;
  emptyLabel: string;
  labels: {
    timestamp: string;
    open: string;
    high: string;
    low: string;
    close: string;
    volume: string;
  };
}) {
  return (
    <TerminalPanel title={title}>
      {bars.length > 0 ? (
        <div className="-mx-3 overflow-x-auto px-3 sm:-mx-4 sm:px-4">
          <Table className="min-w-[38rem] font-mono text-xs sm:min-w-[42rem]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="bg-muted/60 text-muted-foreground">
                  {labels.timestamp}
                </TableHead>
                <TableHead className="bg-muted/60 text-right text-muted-foreground">
                  {labels.open}
                </TableHead>
                <TableHead className="bg-muted/60 text-right text-muted-foreground">
                  {labels.high}
                </TableHead>
                <TableHead className="bg-muted/60 text-right text-muted-foreground">
                  {labels.low}
                </TableHead>
                <TableHead className="bg-muted/60 text-right text-muted-foreground">
                  {labels.close}
                </TableHead>
                <TableHead className="bg-muted/60 text-right text-muted-foreground">
                  {labels.volume}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bars.map((bar) => (
                <TableRow
                  key={bar.timestamp}
                  className="hover:bg-muted/50"
                >
                  <TableCell className="text-muted-foreground">
                    {formatAxisTime(bar.timestamp, locale)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrencyMaybe(bar.open, locale)}
                  </TableCell>
                  <TableCell className="text-right text-green-600 dark:text-green-400">
                    {formatCurrencyMaybe(bar.high, locale)}
                  </TableCell>
                  <TableCell className="text-right text-red-600 dark:text-red-400">
                    {formatCurrencyMaybe(bar.low, locale)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrencyMaybe(bar.close, locale)}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {formatCompactMaybe(bar.volume, locale)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed bg-muted/20 px-3 py-8 text-center text-sm text-muted-foreground">
          {emptyLabel}
        </div>
      )}
    </TerminalPanel>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-background px-3 py-2">
      <p className="truncate text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 truncate font-mono text-sm font-semibold text-foreground">
        {value}
      </p>
    </div>
  );
}

function ChangeBadge({
  change,
  locale,
}: {
  change: PriceChange | null;
  locale: Locale;
}) {
  if (!change) {
    return (
      <Badge
        variant="outline"
        className="text-muted-foreground"
      >
        --
      </Badge>
    );
  }

  const positive = change.absolute >= 0;
  return (
    <Badge
      variant="outline"
      className={cn(
        "font-mono",
        positive
          ? "text-green-600 dark:text-green-400"
          : "text-red-600 dark:text-red-400"
      )}
    >
      {positive ? "+" : ""}
      {formatCurrency(change.absolute, locale, { maximumFractionDigits: 2 })} /{" "}
      {formatSignedPercent(change.percent, locale)}
    </Badge>
  );
}

function ChangeText({
  change,
  locale,
}: {
  change: PriceChange | null;
  locale: Locale;
}) {
  if (!change) {
    return <span className="font-mono text-muted-foreground">--</span>;
  }

  const positive = change.absolute >= 0;
  return (
    <span
      className={cn(
        "font-mono",
        positive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
      )}
    >
      {formatSignedPercent(change.percent, locale)}
    </span>
  );
}

type PriceChange = {
  absolute: number;
  percent: number;
};

type QuoteMicrostructure = {
  bid: number | null;
  ask: number | null;
  spread: number | null;
  midpoint: number | null;
};

function snapshotDisplayPrice(
  snapshot: MarketSnapshot | null,
  fallbackPrice: number | null = null
): number | null {
  return (
    positiveNumber(snapshot?.latest_trade_price) ??
    quoteMicrostructure(snapshot).midpoint ??
    positiveNumber(snapshot?.day_close) ??
    positiveNumber(fallbackPrice)
  );
}

function quoteMicrostructure(
  snapshot: MarketSnapshot | null
): QuoteMicrostructure {
  const bid = positiveNumber(snapshot?.bid_price);
  const ask = positiveNumber(snapshot?.ask_price);

  if (bid != null && ask != null && ask < bid) {
    return { bid: null, ask: null, spread: null, midpoint: null };
  }
  if (bid == null || ask == null) {
    return { bid, ask, spread: null, midpoint: null };
  }

  return {
    bid,
    ask,
    spread: ask - bid,
    midpoint: (bid + ask) / 2,
  };
}

function priceChange(
  snapshot: MarketSnapshot | null,
  price: number | null
): PriceChange | null {
  return priceChangeFromPreviousClose(price, snapshot?.previous_close ?? null);
}

function priceChangeFromPreviousClose(
  price: number | null,
  previousClose: number | null
): PriceChange | null {
  const currentPrice = positiveNumber(price);
  const baseline = positiveNumber(previousClose);
  if (currentPrice == null || baseline == null) return null;
  const absolute = currentPrice - baseline;
  return {
    absolute,
    percent: (absolute / baseline) * 100,
  };
}

function buildChartRows(
  bars: MarketBar[],
  latestTradePrice: number | null,
  latestTradeTimestamp: string | null
): ChartRow[] {
  const rows: ChartRow[] = bars.map((bar) => ({
    timestamp: bar.timestamp,
    timeMs: parseChartTimeMs(bar.timestamp),
    price: bar.close,
    volume: bar.volume,
  }));

  if (latestTradePrice != null) {
    const fallbackTimeMs = rows[rows.length - 1]?.timeMs ?? Date.now();
    const timestamp =
      latestTradeTimestamp ??
      rows[rows.length - 1]?.timestamp ??
      new Date(fallbackTimeMs).toISOString();

    rows.push({
      timestamp,
      timeMs: parseChartTimeMs(timestamp, fallbackTimeMs),
      price: latestTradePrice,
      volume: null,
      live: true,
    });
  }

  return rows.slice().sort((a, b) => a.timeMs - b.timeMs);
}

function barsForSymbol(
  response: MarketBarsResponse | null,
  symbol: string
): MarketBar[] {
  return response?.series.find((item) => item.symbol === symbol)?.bars ?? [];
}

function subscribeFavoriteSymbols(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  function handleStorage(event: StorageEvent) {
    if (event.key === FAVORITES_STORAGE_KEY) callback();
  }

  window.addEventListener("storage", handleStorage);
  window.addEventListener(FAVORITES_CHANGED_EVENT, callback);
  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(FAVORITES_CHANGED_EVENT, callback);
  };
}

function getFavoriteSymbolsSnapshot(): string {
  if (typeof window === "undefined") return "";

  try {
    return window.localStorage.getItem(FAVORITES_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function getFavoriteSymbolsServerSnapshot(): string {
  return "";
}

function parseFavoriteSymbols(
  snapshot: string,
  fallbackSymbols: string[]
): string[] {
  if (!snapshot) {
    return normalizeSymbols(fallbackSymbols).slice(0, MAX_FAVORITE_SYMBOLS);
  }

  try {
    const parsed = JSON.parse(snapshot) as unknown;
    return Array.isArray(parsed)
      ? normalizeSymbols(parsed.filter((item) => typeof item === "string")).slice(
          0,
          MAX_FAVORITE_SYMBOLS
        )
      : [];
  } catch {
    return [];
  }
}

function writeFavoriteSymbols(symbols: string[]) {
  if (typeof window === "undefined") return;

  const normalized = normalizeSymbols(symbols).slice(0, MAX_FAVORITE_SYMBOLS);
  window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(normalized));
  window.dispatchEvent(new Event(FAVORITES_CHANGED_EVENT));
}

function chunkSymbols(symbols: string[], size: number): string[][] {
  const chunks: string[][] = [];
  for (let index = 0; index < symbols.length; index += size) {
    chunks.push(symbols.slice(index, index + size));
  }
  return chunks;
}

function normalizeSymbols(symbols: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of symbols) {
    const symbol = value.trim().toUpperCase();
    if (!SYMBOL_RE.test(symbol) || seen.has(symbol)) continue;
    seen.add(symbol);
    out.push(symbol);
  }
  return out;
}

function timeframeForLookback(lookbackDays: LookbackDays): Timeframe {
  if (lookbackDays <= 7) return "1Min";
  if (lookbackDays <= 14) return "1Hour";
  return "1Day";
}

function formatCurrencyMaybe(
  value: number | null | undefined,
  locale: Locale
): string {
  if (value == null || !Number.isFinite(value)) return "--";
  return formatCurrency(value, locale, {
    maximumFractionDigits: Math.abs(value) >= 1000 ? 0 : 2,
  });
}

function formatTooltipPrice(
  value: number,
  previousClose: number | null,
  locale: Locale
): string {
  const price = positiveNumber(value);
  if (price == null) return "--";

  const change = priceChangeFromPreviousClose(price, previousClose);
  if (!change) return formatCurrencyMaybe(price, locale);

  return `${formatCurrencyMaybe(price, locale)} / ${formatSignedPercent(
    change.percent,
    locale
  )}`;
}

function formatSignedPercent(value: number, locale: Locale): string {
  return `${value >= 0 ? "+" : ""}${formatPercent(value, locale)}`;
}

function formatCompactMaybe(
  value: number | null | undefined,
  locale: Locale
): string {
  if (value == null || !Number.isFinite(value)) return "--";
  return new Intl.NumberFormat(locale, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function positiveNumber(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

function nonNegativeNumber(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value < 0) return null;
  return value;
}

function formatLocalTime(value: Date | null, locale: Locale): string {
  if (!value) return "--";
  return value.toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatAxisTime(
  value: string | number,
  locale: Locale,
  timeframe?: Timeframe,
  intradayOneDay = false
): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  if (intradayOneDay) {
    return date.toLocaleTimeString(locale, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: MARKET_TIME_ZONE,
    });
  }
  if (timeframe === "1Day") {
    return date.toLocaleDateString(locale, {
      month: "short",
      day: "2-digit",
      timeZone: MARKET_TIME_ZONE,
    });
  }
  return date.toLocaleString(locale, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: MARKET_TIME_ZONE,
  });
}

function formatChartAxisTick({
  value,
  locale,
  timeframe,
  intradayOneDay,
  intradayOpenTimeMs,
  compressedIntraday,
  rows,
}: {
  value: string | number;
  locale: Locale;
  timeframe: Timeframe;
  intradayOneDay: boolean;
  intradayOpenTimeMs: number | null;
  compressedIntraday: boolean;
  rows: ChartDisplayRow[];
}): string {
  if (compressedIntraday) {
    const row = rowForCompressedAxisValue(value, rows);
    return row ? formatCompressedTradingDate(row.timeMs, locale) : "";
  }

  if (
    intradayOneDay &&
    intradayOpenTimeMs != null &&
    Math.abs(Number(value) - intradayOpenTimeMs) < 60_000
  ) {
    return formatOpenAxisTime(value, locale);
  }

  return formatAxisTime(value, locale, timeframe, intradayOneDay);
}

function formatOpenAxisTime(value: string | number, locale: Locale): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  const tradingDate = date.toLocaleDateString(locale, {
    month: "short",
    day: "2-digit",
    timeZone: MARKET_TIME_ZONE,
  });
  const openTime = date.toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: MARKET_TIME_ZONE,
  });

  return `${tradingDate} ${openTime}`;
}

function formatChartTooltipTime(
  value: string | number,
  locale: Locale,
  options?: {
    compressedIntraday?: boolean;
    rows?: ChartDisplayRow[];
  }
): string {
  const row =
    options?.compressedIntraday && options.rows
      ? rowForCompressedAxisValue(value, options.rows)
      : null;
  const date = new Date(row?.timeMs ?? value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString(locale, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: MARKET_TIME_ZONE,
  });
}

function formatCompressedTradingDate(value: number, locale: Locale): string {
  return new Date(value).toLocaleDateString(locale, {
    month: "short",
    day: "2-digit",
    timeZone: MARKET_TIME_ZONE,
  });
}

function parseChartTimeMs(value: string | number, fallback = Date.now()): number {
  const timeMs = new Date(value).getTime();
  return Number.isNaN(timeMs) ? fallback : timeMs;
}

function buildCompressedIntradayTicks(rows: ChartDisplayRow[]): number[] {
  const dayStartTicks: number[] = [];
  let currentDayKey = "";

  for (const row of rows) {
    const nextDayKey = getMarketDateKey(row.timeMs);
    if (!nextDayKey || nextDayKey === currentDayKey) continue;
    currentDayKey = nextDayKey;
    dayStartTicks.push(row.chartX);
  }

  return sampleTicks(dayStartTicks, 6);
}

function sampleTicks(ticks: number[], maxTicks: number): number[] {
  if (ticks.length <= maxTicks) return ticks;
  const sampled = new Set<number>();
  const lastIndex = ticks.length - 1;

  for (let index = 0; index < maxTicks; index += 1) {
    sampled.add(ticks[Math.round((index * lastIndex) / (maxTicks - 1))]);
  }

  return Array.from(sampled).sort((a, b) => a - b);
}

function rowForCompressedAxisValue(
  value: string | number,
  rows: ChartDisplayRow[]
): ChartDisplayRow | null {
  if (rows.length === 0) return null;
  const index = Math.min(
    Math.max(Math.round(Number(value)), 0),
    rows.length - 1
  );
  return rows[index] ?? null;
}

function getOneDayIntradayDomain(rows: ChartRow[]): [number, number] | null {
  const anchorTimeMs = rows[rows.length - 1]?.timeMs;
  if (anchorTimeMs == null) return null;

  const marketDate = getMarketTimeParts(anchorTimeMs);
  if (!marketDate) return null;

  return [
    zonedWallTimeToUtcMs(marketDate, 9, 0),
    zonedWallTimeToUtcMs(marketDate, 16, 30),
  ];
}

function buildOneDayIntradayTicks(domain: [number, number]): number[] {
  const marketDate = getMarketTimeParts(domain[0]);
  if (!marketDate) return domain;
  return ONE_DAY_INTRADAY_TICKS.map(([hour, minute]) =>
    zonedWallTimeToUtcMs(marketDate, hour, minute)
  );
}

type MarketTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

function getMarketTimeParts(value: number): MarketTimeParts | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const parts = MARKET_TIME_PARTS_FORMATTER.formatToParts(date);
  const partMap = new Map(parts.map((part) => [part.type, part.value]));
  const year = Number(partMap.get("year"));
  const month = Number(partMap.get("month"));
  const day = Number(partMap.get("day"));
  const hour = Number(partMap.get("hour"));
  const minute = Number(partMap.get("minute"));

  if ([year, month, day, hour, minute].some((item) => Number.isNaN(item))) {
    return null;
  }

  return { year, month, day, hour, minute };
}

function getMarketDateKey(value: number): string {
  const parts = getMarketTimeParts(value);
  if (!parts) return "";
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(
    parts.day
  ).padStart(2, "0")}`;
}

function zonedWallTimeToUtcMs(
  marketDate: MarketTimeParts,
  hour: number,
  minute: number
): number {
  const utcGuess = Date.UTC(
    marketDate.year,
    marketDate.month - 1,
    marketDate.day,
    hour,
    minute
  );
  const zonedGuess = getMarketTimeParts(utcGuess);
  if (!zonedGuess) return utcGuess;

  const desiredAsUtc = Date.UTC(
    marketDate.year,
    marketDate.month - 1,
    marketDate.day,
    hour,
    minute
  );
  const actualAsUtc = Date.UTC(
    zonedGuess.year,
    zonedGuess.month - 1,
    zonedGuess.day,
    zonedGuess.hour,
    zonedGuess.minute
  );

  return utcGuess + desiredAsUtc - actualAsUtc;
}
