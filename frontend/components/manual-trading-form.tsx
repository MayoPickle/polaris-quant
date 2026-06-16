"use client";

import { useRouter } from "next/navigation";
import {
  FormEvent,
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  useSyncExternalStore,
  type PointerEvent,
} from "react";
import { CircleCheck, History, Send } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, MetricGrid, MetricTile, WorkbenchPanel } from "@/components/workbench";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n/client";
import type { Locale } from "@/lib/i18n/config";
import {
  brokerEnvLabel,
  formatCurrency,
  formatDateTime,
  formatPercent,
  orderSideLabel,
  orderSessionLabel,
  orderStatusLabel,
  orderTypeLabel,
} from "@/lib/i18n/format";
import type {
  Account,
  Health,
  MarketAssetSummary,
  MarketBar,
  MarketBarSeries,
  MarketSnapshot,
  Order,
  OrderSide,
  OrderType,
  Position,
  Quote,
} from "@/types";

type ManualOrderType = Extract<OrderType, "market" | "limit">;

const SYMBOL_PATTERN = /^[A-Z][A-Z0-9.]{0,15}$/;
const FAVORITE_SYMBOL_PATTERN = /^[A-Z][A-Z0-9.-]{0,14}$/;
const FAVORITES_STORAGE_KEY = "polaris.market.favoriteSymbols.v1";
const FAVORITES_CHANGED_EVENT = "polaris-market-favorites-changed";
const MAX_FAVORITE_SYMBOLS = 20;
const WATCHLIST_BAR_TIMEFRAME = "1Min";
const WATCHLIST_BAR_LOOKBACK_DAYS = 1;
const SPARKLINE_WIDTH = 120;
const SPARKLINE_HEIGHT = 44;
const SPARKLINE_PADDING = 3;
const SPARKLINE_MAX_POINTS = 56;
const MARKET_TIME_ZONE = "America/New_York";
const MARKET_SESSION_OPEN = { hour: 9, minute: 30 };
const MARKET_SESSION_CLOSE = { hour: 16, minute: 0 };
const MARKET_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: MARKET_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const MARKET_TIME_PARTS_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: MARKET_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const FALLBACK_SECURITY_NAMES: Record<string, string> = {
  AAPL: "Apple Inc.",
  AMD: "Advanced Micro Devices, Inc.",
  AMZN: "Amazon.com, Inc.",
  GOOG: "Alphabet Inc.",
  GOOGL: "Alphabet Inc.",
  INTC: "Intel Corporation",
  META: "Meta Platforms, Inc.",
  MSFT: "Microsoft Corporation",
  NVDA: "NVIDIA Corporation",
  QQQ: "Invesco QQQ Trust",
  SPY: "SPDR S&P 500 ETF Trust",
  TSLA: "Tesla, Inc.",
  VOO: "Vanguard S&P 500 ETF",
};

export function ManualTradingForm({
  account,
  health,
  positions,
}: {
  account: Account | null;
  health: Health | null;
  positions: Position[] | null;
}) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [symbol, setSymbol] = useState("AAPL");
  const [side, setSide] = useState<OrderSide>("buy");
  const [orderType, setOrderType] = useState<ManualOrderType>("market");
  const [qty, setQty] = useState("1");
  const [limitPrice, setLimitPrice] = useState("");
  const [extendedHours, setExtendedHours] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedOrder, setSubmittedOrder] = useState<Order | null>(null);
  const favoriteStorageValue = useSyncExternalStore(
    subscribeFavoriteSymbols,
    getFavoriteSymbolsSnapshot,
    getFavoriteSymbolsServerSnapshot
  );
  const favoriteSymbols = useMemo(
    () => parseFavoriteSymbols(favoriteStorageValue),
    [favoriteStorageValue]
  );
  const [watchlistSnapshots, setWatchlistSnapshots] = useState<MarketSnapshot[]>([]);
  const [watchlistBars, setWatchlistBars] = useState<MarketBarSeries[]>([]);
  const [watchlistAssets, setWatchlistAssets] = useState<MarketAssetSummary[]>([]);
  const [watchlistLoading, setWatchlistLoading] = useState(false);
  const [watchlistUnavailable, setWatchlistUnavailable] = useState(false);
  const [quoteState, setQuoteState] = useState<{
    symbol: string;
    quote: Quote | null;
    loading: boolean;
    unavailable: boolean;
  }>({ symbol: "", quote: null, loading: false, unavailable: false });

  const normalizedSymbol = symbol.trim().toUpperCase();
  const numericQty = Number(qty);
  const numericLimitPrice = Number(limitPrice);
  const activeQuote =
    quoteState.symbol === normalizedSymbol ? quoteState.quote : null;
  const quoteLoading =
    quoteState.symbol === normalizedSymbol && quoteState.loading;
  const quoteUnavailable =
    quoteState.symbol === normalizedSymbol && quoteState.unavailable;
  const selectedPosition = useMemo(
    () =>
      (positions ?? []).find(
        (position) => position.symbol.toUpperCase() === normalizedSymbol
      ) ?? null,
    [normalizedSymbol, positions]
  );
  const marketReferencePrice =
    marketPriceForSide(activeQuote, side) ?? unitPriceFromPosition(selectedPosition);
  const referencePrice =
    orderType === "limit" && numericLimitPrice > 0
      ? numericLimitPrice
      : marketReferencePrice;
  const estimatedNotional =
    numericQty > 0 && referencePrice != null ? numericQty * referencePrice : null;
  const estimateSource =
    orderType === "limit" && numericLimitPrice > 0
      ? "limit"
      : marketPriceForSide(activeQuote, side) != null
        ? "quote"
        : unitPriceFromPosition(selectedPosition) != null
          ? "position"
          : "none";
  const estimateDetail = estimateDetailText(
    estimateSource,
    referencePrice,
    quoteLoading,
    quoteUnavailable,
    locale,
    t.manualTrading
  );
  const effectiveExtendedHours = orderType === "limit" && extendedHours;
  const watchlistSnapshotBySymbol = useMemo(() => {
    return new Map(
      watchlistSnapshots.map((snapshot) => [snapshot.symbol.toUpperCase(), snapshot])
    );
  }, [watchlistSnapshots]);
  const watchlistBarsBySymbol = useMemo(() => {
    return new Map(
      watchlistBars.map((series) => [series.symbol.toUpperCase(), series.bars])
    );
  }, [watchlistBars]);
  const watchlistAssetBySymbol = useMemo(() => {
    return new Map(
      watchlistAssets.map((asset) => [asset.symbol.toUpperCase(), asset])
    );
  }, [watchlistAssets]);
  const effectiveWatchlistLoading = favoriteSymbols.length > 0 && watchlistLoading;
  const effectiveWatchlistUnavailable =
    favoriteSymbols.length > 0 && watchlistUnavailable;
  const selectWatchlistSymbol = useCallback((nextSymbol: string) => {
    setSymbol(nextSymbol);
  }, []);

  useEffect(() => {
    if (favoriteSymbols.length === 0) {
      let canceled = false;
      queueMicrotask(() => {
        if (canceled) return;
        setWatchlistSnapshots([]);
        setWatchlistBars([]);
        setWatchlistAssets([]);
        setWatchlistLoading(false);
        setWatchlistUnavailable(false);
      });
      return () => {
        canceled = true;
      };
    }

    let canceled = false;
    queueMicrotask(() => {
      if (canceled) return;
      setWatchlistLoading(true);
      setWatchlistUnavailable(false);
    });

    Promise.allSettled([
      api.marketSnapshots(favoriteSymbols),
      api.marketBars(favoriteSymbols, {
        timeframe: WATCHLIST_BAR_TIMEFRAME,
        lookback_days: WATCHLIST_BAR_LOOKBACK_DAYS,
      }),
      api.marketAssets(favoriteSymbols),
    ])
      .then(([snapshotsResult, barsResult, assetsResult]) => {
        if (canceled) return;

        if (snapshotsResult.status === "fulfilled") {
          setWatchlistSnapshots(snapshotsResult.value.snapshots);
          setWatchlistUnavailable(false);
        } else {
          setWatchlistSnapshots([]);
          setWatchlistUnavailable(true);
        }

        setWatchlistBars(
          barsResult.status === "fulfilled" ? barsResult.value.series : []
        );
        setWatchlistAssets(
          assetsResult.status === "fulfilled" ? assetsResult.value.assets : []
        );
      })
      .finally(() => {
        if (!canceled) setWatchlistLoading(false);
      });

    return () => {
      canceled = true;
    };
  }, [favoriteSymbols]);

  useEffect(() => {
    if (!SYMBOL_PATTERN.test(normalizedSymbol)) return;

    let canceled = false;

    const timer = window.setTimeout(async () => {
      if (!canceled) {
        setQuoteState({
          symbol: normalizedSymbol,
          quote: null,
          loading: true,
          unavailable: false,
        });
      }
      try {
        const nextQuote = await api.quote(normalizedSymbol);
        if (!canceled) {
          setQuoteState({
            symbol: normalizedSymbol,
            quote: nextQuote,
            loading: false,
            unavailable: false,
          });
        }
      } catch {
        if (!canceled) {
          setQuoteState({
            symbol: normalizedSymbol,
            quote: null,
            loading: false,
            unavailable: true,
          });
        }
      } finally {
        if (!canceled) {
          setQuoteState((current) =>
            current.symbol === normalizedSymbol
              ? { ...current, loading: false }
              : current
          );
        }
      }
    }, 350);

    return () => {
      canceled = true;
      window.clearTimeout(timer);
    };
  }, [normalizedSymbol]);

  function changeOrderType(nextType: ManualOrderType) {
    setOrderType(nextType);
    if (nextType !== "limit") setExtendedHours(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = validateOrder(
      normalizedSymbol,
      numericQty,
      orderType,
      numericLimitPrice,
      effectiveExtendedHours,
      t.manualTrading
    );
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError(null);
    setSubmittedOrder(null);
    try {
      const order = await api.createOrder({
        symbol: normalizedSymbol,
        side,
        qty: numericQty,
        order_type: orderType,
        limit_price: orderType === "limit" ? numericLimitPrice : null,
        extended_hours: effectiveExtendedHours,
      });
      setSubmittedOrder(order);
      router.refresh();
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : t.manualTrading.orderFailed);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="flex min-w-0 flex-col gap-4">
        <TradingWatchlist
          symbols={favoriteSymbols}
          snapshotBySymbol={watchlistSnapshotBySymbol}
          barsBySymbol={watchlistBarsBySymbol}
          assetBySymbol={watchlistAssetBySymbol}
          selectedSymbol={normalizedSymbol}
          loading={effectiveWatchlistLoading}
          unavailable={effectiveWatchlistUnavailable}
          locale={locale}
          labels={t.manualTrading}
          onSelect={selectWatchlistSymbol}
        />

        <WorkbenchPanel
          title={t.manualTrading.ticketTitle}
          description={t.manualTrading.ticketDescription}
          actions={
            <Badge variant={health?.trading_enabled ? "default" : "destructive"}>
              {health?.trading_enabled ? t.common.enabled : t.common.disabled}
            </Badge>
          }
        >
          <form onSubmit={submit} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Field label={t.manualTrading.symbol}>
              <input
                value={symbol}
                onChange={(event) => setSymbol(event.target.value.toUpperCase())}
                className="h-10 w-full rounded-lg border bg-background px-3 text-sm font-medium uppercase"
                placeholder={t.manualTrading.symbolPlaceholder}
              />
            </Field>
            <Field label={t.manualTrading.side}>
              <select
                value={side}
                onChange={(event) => setSide(event.target.value as OrderSide)}
                className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
              >
                <option value="buy">{t.manualTrading.buy}</option>
                <option value="sell">{t.manualTrading.sell}</option>
              </select>
            </Field>
            <Field label={t.manualTrading.orderType}>
              <select
                value={orderType}
                onChange={(event) =>
                  changeOrderType(event.target.value as ManualOrderType)
                }
                className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
              >
                <option value="market">{t.manualTrading.market}</option>
                <option value="limit">{t.manualTrading.limit}</option>
              </select>
            </Field>
            <Field label={t.manualTrading.quantity}>
              <input
                type="number"
                min="0"
                step="any"
                value={qty}
                onChange={(event) => setQty(event.target.value)}
                className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
              />
            </Field>
          </div>

          <div className="grid gap-3 md:grid-cols-[minmax(0,12rem)_minmax(0,13rem)_minmax(0,1fr)]">
            {orderType === "limit" && (
              <Field label={t.manualTrading.limitPrice}>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={limitPrice}
                  onChange={(event) => setLimitPrice(event.target.value)}
                  className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
                />
              </Field>
            )}
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className="truncate text-xs font-medium text-muted-foreground">
                {t.common.session}
              </span>
              <label
                className={[
                  "flex h-10 cursor-pointer items-center gap-3 rounded-lg border bg-background px-3 text-sm",
                  orderType !== "limit" ? "cursor-not-allowed opacity-60" : "",
                ].join(" ")}
              >
                <input
                  type="checkbox"
                  checked={effectiveExtendedHours}
                  disabled={orderType !== "limit"}
                  onChange={(event) => setExtendedHours(event.target.checked)}
                />
                <span className="min-w-0 truncate font-medium">
                  {t.manualTrading.extendedHours}
                </span>
              </label>
            </div>
            <div
              className={[
                "rounded-lg border bg-muted/20 px-3 py-2",
                orderType === "market" ? "md:col-span-2" : "",
              ].join(" ")}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="truncate text-xs font-medium text-muted-foreground">
                  {t.manualTrading.estimatedNotional}
                </p>
                {quoteLoading && orderType === "market" && (
                  <Badge variant="outline">{t.manualTrading.quoteLoading}</Badge>
                )}
              </div>
              <p className="mt-1 truncate text-lg font-semibold">
                {estimatedNotional != null
                  ? formatCurrency(estimatedNotional, locale)
                  : "—"}
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {estimateDetail}
              </p>
            </div>
          </div>

          {side === "sell" && (
            <div className="rounded-lg border bg-muted/20 px-3 py-2 text-sm">
              <p className="font-medium">{t.manualTrading.currentPosition}</p>
              <p className="mt-1 text-muted-foreground">
                {selectedPosition
                  ? t.manualTrading.positionHint
                      .replace("{qty}", String(selectedPosition.qty))
                      .replace(
                        "{avgPrice}",
                        formatCurrency(selectedPosition.avg_entry_price, locale)
                      )
                      .replace(
                        "{marketValue}",
                        formatCurrency(selectedPosition.market_value, locale)
                      )
                  : t.manualTrading.noPositionForSymbol}
              </p>
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          {submittedOrder && (
            <div className="rounded-lg border bg-muted/20 px-3 py-2 text-sm">
              <div className="flex items-center gap-2 font-medium">
                <CircleCheck aria-hidden="true" />
                <span>{t.manualTrading.submittedTitle}</span>
              </div>
              <p className="mt-1 text-muted-foreground">
                {submittedOrder.symbol} · {orderSideLabel(submittedOrder.side, locale)} ·{" "}
                {orderTypeLabel(submittedOrder.order_type, locale)} ·{" "}
                {orderSessionLabel(submittedOrder.extended_hours, locale)} ·{" "}
                {orderStatusLabel(submittedOrder.status, locale)}
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={loading}>
              <Send data-icon="inline-start" />
              {loading ? t.manualTrading.submitting : t.manualTrading.submit}
            </Button>
            <Button type="button" variant="outline" onClick={() => router.push("/history")}>
              <History data-icon="inline-start" />
              {t.manualTrading.viewHistory}
            </Button>
          </div>
          </form>
        </WorkbenchPanel>
      </div>

      <WorkbenchPanel
        title={t.manualTrading.accountTitle}
        description={t.manualTrading.accountDescription}
      >
        <MetricGrid className="grid-cols-2 xl:grid-cols-2">
          <MetricTile
            label={t.manualTrading.buyingPower}
            value={account ? formatCurrency(account.buying_power, locale) : "—"}
            tone="info"
          />
          <MetricTile
            label={t.manualTrading.cash}
            value={account ? formatCurrency(account.cash, locale) : "—"}
          />
          <MetricTile
            label={t.manualTrading.tradingGuard}
            value={health?.trading_enabled ? t.common.enabled : t.common.disabled}
            tone={health?.trading_enabled ? "positive" : "warning"}
          />
          <MetricTile
            label={t.manualTrading.broker}
            value={brokerEnvLabel(health?.broker_env, locale)}
          />
        </MetricGrid>
      </WorkbenchPanel>
    </section>
  );
}

type TradingWatchlistLabels = {
  watchlistTitle: string;
  watchlistDescription: string;
  watchlistLoading: string;
  watchlistUnavailable: string;
  watchlistEmpty: string;
  detailTitle: string;
  detailPrice: string;
  detailChange: string;
  detailBid: string;
  detailAsk: string;
  detailSpread: string;
  detailOpen: string;
  detailHigh: string;
  detailLow: string;
  detailClose: string;
  detailVolume: string;
  detailLatestTrade: string;
  detailExchange: string;
  detailAssetClass: string;
  detailNoData: string;
};

function TradingWatchlist({
  symbols,
  snapshotBySymbol,
  barsBySymbol,
  assetBySymbol,
  selectedSymbol,
  loading,
  unavailable,
  locale,
  labels,
  onSelect,
}: {
  symbols: string[];
  snapshotBySymbol: ReadonlyMap<string, MarketSnapshot>;
  barsBySymbol: ReadonlyMap<string, MarketBar[]>;
  assetBySymbol: ReadonlyMap<string, MarketAssetSummary>;
  selectedSymbol: string;
  loading: boolean;
  unavailable: boolean;
  locale: Locale;
  labels: TradingWatchlistLabels;
  onSelect: (symbol: string) => void;
}) {
  const [detailSymbol, setDetailSymbol] = useState<string | null>(null);
  const visibleDetailSymbol =
    detailSymbol && symbols.includes(detailSymbol) ? detailSymbol : null;
  const detailSnapshot = visibleDetailSymbol
    ? snapshotBySymbol.get(visibleDetailSymbol) ?? null
    : null;
  const detailBars = visibleDetailSymbol
    ? barsBySymbol.get(visibleDetailSymbol) ?? EMPTY_MARKET_BARS
    : EMPTY_MARKET_BARS;
  const detailAsset = visibleDetailSymbol
    ? assetBySymbol.get(visibleDetailSymbol) ?? null
    : null;
  const openDetail = useCallback(
    (nextSymbol: string) => {
      onSelect(nextSymbol);
      setDetailSymbol(nextSymbol);
    },
    [onSelect]
  );

  return (
    <>
      <div className="overflow-hidden rounded-lg border bg-background dark:border-white/10 dark:bg-black">
        <div className="flex items-start justify-between gap-3 border-b px-3 py-2.5 dark:border-white/10">
          <div className="min-w-0">
            <p className="text-sm font-semibold dark:text-white">
              {labels.watchlistTitle}
            </p>
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
              {labels.watchlistDescription}
            </p>
          </div>
          {loading && (
            <Badge variant="outline" className="shrink-0">
              {labels.watchlistLoading}
            </Badge>
          )}
        </div>

        {symbols.length > 0 ? (
          <div className="divide-y dark:divide-white/10">
            {symbols.map((symbol) => (
              <TradingWatchlistRow
                key={symbol}
                symbol={symbol}
                snapshot={snapshotBySymbol.get(symbol) ?? null}
                bars={barsBySymbol.get(symbol) ?? EMPTY_MARKET_BARS}
                asset={assetBySymbol.get(symbol) ?? null}
                active={selectedSymbol === symbol}
                locale={locale}
                onSelect={openDetail}
              />
            ))}
          </div>
        ) : (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">
            {labels.watchlistEmpty}
          </div>
        )}

        {symbols.length > 0 && unavailable && (
          <p className="border-t px-3 py-2 text-xs leading-5 text-muted-foreground">
            {labels.watchlistUnavailable}
          </p>
        )}
      </div>

      <Dialog
        open={visibleDetailSymbol != null}
        onOpenChange={(open) => {
          if (!open) setDetailSymbol(null);
        }}
      >
        {visibleDetailSymbol && (
          <StockDetailDialogContent
            key={visibleDetailSymbol}
            symbol={visibleDetailSymbol}
            snapshot={detailSnapshot}
            bars={detailBars}
            asset={detailAsset}
            locale={locale}
            labels={labels}
          />
        )}
      </Dialog>
    </>
  );
}

const EMPTY_MARKET_BARS: MarketBar[] = [];

const TradingWatchlistRow = memo(function TradingWatchlistRow({
  symbol,
  snapshot,
  bars,
  asset,
  active,
  locale,
  onSelect,
}: {
  symbol: string;
  snapshot: MarketSnapshot | null;
  bars: MarketBar[];
  asset: MarketAssetSummary | null;
  active: boolean;
  locale: Locale;
  onSelect: (symbol: string) => void;
}) {
  const price = snapshotDisplayPrice(snapshot);
  const change = priceChange(snapshot, price);
  const securityName = securityNameForSymbol(symbol, asset);
  const handleSelect = useCallback(() => onSelect(symbol), [onSelect, symbol]);

  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={`${symbol} ${securityName}`}
      onClick={handleSelect}
      className={[
        "flex min-h-[4.75rem] w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-white/10",
        active ? "bg-muted dark:bg-white/10" : "",
      ].join(" ")}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate font-mono text-lg font-bold leading-6 tracking-normal text-foreground dark:text-white">
          {symbol}
        </span>
        <span className="mt-0.5 block truncate text-xs leading-4 text-muted-foreground">
          {securityName}
        </span>
      </span>

      <WatchlistSparkline
        bars={bars}
        latestTradePrice={snapshot?.latest_trade_price ?? null}
        latestTradeTimestamp={snapshot?.latest_trade_timestamp ?? null}
        change={change}
      />

      <span className="grid w-20 shrink-0 justify-items-end gap-1.5">
        <span className="max-w-full truncate font-mono text-base font-semibold leading-none tabular-nums text-foreground dark:text-white">
          {formatCurrencyMaybe(price, locale)}
        </span>
        <ChangePill change={change} locale={locale} size="sm" />
      </span>
    </button>
  );
});

const StockDetailDialogContent = memo(function StockDetailDialogContent({
  symbol,
  snapshot,
  bars,
  asset,
  locale,
  labels,
}: {
  symbol: string;
  snapshot: MarketSnapshot | null;
  bars: MarketBar[];
  asset: MarketAssetSummary | null;
  locale: Locale;
  labels: TradingWatchlistLabels;
}) {
  const price = snapshotDisplayPrice(snapshot);
  const change = priceChange(snapshot, price);
  const securityName = securityNameForSymbol(symbol, asset);
  const changeTone =
    change == null ? undefined : change.absolute >= 0 ? "positive" : "negative";

  return (
    <DialogContent className="grid max-h-[min(42rem,calc(100dvh-1rem))] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:max-w-xl">
      <DialogHeader className="border-b px-4 py-4 pr-12">
        <DialogTitle className="grid gap-3 pr-4 leading-tight sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <span className="min-w-0">
            <span className="block font-mono text-2xl font-bold tracking-normal">
              <span className="sr-only">{labels.detailTitle}: </span>
              {symbol}
            </span>
            <span className="mt-1 block truncate text-sm font-normal text-muted-foreground">
              {securityName}
            </span>
          </span>
          <span className="grid justify-items-start gap-2 sm:justify-items-end">
            <span className="font-mono text-2xl font-semibold tabular-nums">
              {formatCurrencyMaybe(price, locale)}
            </span>
            <ChangePill change={change} locale={locale} />
          </span>
        </DialogTitle>
      </DialogHeader>

      <div className="min-h-0 overflow-y-auto overscroll-contain px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
        <section className="rounded-lg border bg-muted/20 p-3">
          <DetailSparkline
            bars={bars}
            latestTradePrice={snapshot?.latest_trade_price ?? null}
            latestTradeTimestamp={snapshot?.latest_trade_timestamp ?? null}
            change={change}
            locale={locale}
            emptyLabel={labels.detailNoData}
          />
        </section>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <DetailMetric
            label={labels.detailPrice}
            value={formatCurrencyMaybe(price, locale)}
          />
          <DetailMetric
            label={labels.detailChange}
            value={formatChangeDetail(change, locale)}
            tone={changeTone}
          />
          <DetailMetric
            label={labels.detailBid}
            value={formatCurrencyMaybe(snapshot?.bid_price, locale)}
          />
          <DetailMetric
            label={labels.detailAsk}
            value={formatCurrencyMaybe(snapshot?.ask_price, locale)}
          />
          <DetailMetric
            label={labels.detailSpread}
            value={formatCurrencyValue(snapshot?.spread, locale)}
          />
          <DetailMetric
            label={labels.detailOpen}
            value={formatCurrencyMaybe(snapshot?.day_open, locale)}
          />
          <DetailMetric
            label={labels.detailHigh}
            value={formatCurrencyMaybe(snapshot?.day_high, locale)}
          />
          <DetailMetric
            label={labels.detailLow}
            value={formatCurrencyMaybe(snapshot?.day_low, locale)}
          />
          <DetailMetric
            label={labels.detailClose}
            value={formatCurrencyMaybe(snapshot?.day_close, locale)}
          />
          <DetailMetric
            label={labels.detailVolume}
            value={formatNumberMaybe(snapshot?.day_volume, locale)}
          />
          <DetailMetric
            label={labels.detailLatestTrade}
            value={formatDateTimeMaybe(snapshot?.latest_trade_timestamp, locale)}
            wide
          />
          <DetailMetric
            label={labels.detailExchange}
            value={asset?.exchange || "--"}
          />
          <DetailMetric
            label={labels.detailAssetClass}
            value={formatAssetClass(asset?.asset_class)}
          />
        </div>
      </div>
    </DialogContent>
  );
});

function DetailMetric({
  label,
  value,
  tone,
  wide = false,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative";
  wide?: boolean;
}) {
  return (
    <div
      className={[
        "min-w-0 rounded-lg border bg-background px-3 py-2",
        wide ? "col-span-2" : "",
      ].join(" ")}
    >
      <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
      <p
        className={[
          "mt-1 truncate font-mono text-sm font-semibold tabular-nums",
          tone === "positive" ? "text-green-600 dark:text-green-400" : "",
          tone === "negative" ? "text-red-600 dark:text-red-400" : "",
        ].join(" ")}
      >
        {value}
      </p>
    </div>
  );
}

const DetailSparkline = memo(function DetailSparkline({
  bars,
  latestTradePrice,
  latestTradeTimestamp,
  change,
  locale,
  emptyLabel,
}: {
  bars: MarketBar[];
  latestTradePrice: number | null;
  latestTradeTimestamp: string | null;
  change: PriceChange | null;
  locale: Locale;
  emptyLabel: string;
}) {
  const rawAreaGradientId = useId();
  const areaGradientId = `detail-area-gradient-${rawAreaGradientId.replace(/:/g, "")}`;
  const paths = useMemo(
    () => buildSparklinePaths(bars, latestTradePrice, latestTradeTimestamp),
    [bars, latestTradePrice, latestTradeTimestamp]
  );
  const [hoverPoint, setHoverPoint] = useState<SparklinePlotPoint | null>(null);
  const tone =
    change == null
      ? "text-muted-foreground"
      : change.absolute >= 0
        ? "text-green-500"
        : "text-red-500";
  const midPrice =
    paths != null ? paths.min + (paths.max - paths.min) / 2 : null;
  const activePoint =
    hoverPoint ?? (paths ? paths.points[paths.points.length - 1] : null);
  const tooltipClass =
    hoverPoint == null
      ? ""
      : hoverPoint.x < SPARKLINE_WIDTH * 0.28
        ? "translate-x-0"
        : hoverPoint.x > SPARKLINE_WIDTH * 0.72
          ? "-translate-x-full"
          : "-translate-x-1/2";
  const tooltipLeft = hoverPoint
    ? `${(hoverPoint.x / SPARKLINE_WIDTH) * 100}%`
    : undefined;
  const tooltipTop = hoverPoint
    ? `${Math.max(
        8,
        Math.min(72, (hoverPoint.y / SPARKLINE_HEIGHT) * 100)
      )}%`
    : undefined;
  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!paths) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (rect.width <= 0) return;
      const chartX =
        ((event.clientX - rect.left) / rect.width) * SPARKLINE_WIDTH;
      setHoverPoint(nearestSparklinePoint(paths.points, chartX));
    },
    [paths]
  );
  const clearHoverPoint = useCallback(() => setHoverPoint(null), []);

  return (
    <div className="grid gap-2">
      {activePoint && (
        <div className="flex min-w-0 items-center justify-between gap-3 font-mono text-[11px] leading-none text-muted-foreground">
          <span className="min-w-0 truncate">
            {formatChartTimeLabel(activePoint.timestamp, locale, true, true)}
          </span>
          <span className="shrink-0 font-semibold text-foreground">
            {formatCurrencyMaybe(activePoint.value, locale)}
          </span>
        </div>
      )}

      <div
        className={`grid h-36 w-full grid-cols-[minmax(0,1fr)_3.9rem] gap-2 ${tone}`}
      >
        <div
          className="relative min-w-0 rounded-md bg-background/35"
          onPointerDown={handlePointerMove}
          onPointerMove={handlePointerMove}
          onPointerLeave={clearHoverPoint}
          role="img"
          aria-label="Intraday price chart"
        >
          <svg
            viewBox={`0 0 ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}`}
            preserveAspectRatio="none"
            className="h-full w-full overflow-visible"
            aria-hidden="true"
          >
            <defs>
              <linearGradient
                id={areaGradientId}
                x1="0"
                x2="0"
                y1={SPARKLINE_PADDING}
                y2={SPARKLINE_HEIGHT}
                gradientUnits="userSpaceOnUse"
              >
                <stop offset="0%" stopColor="currentColor" stopOpacity="0.34" />
                <stop offset="48%" stopColor="currentColor" stopOpacity="0.16" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0.02" />
              </linearGradient>
            </defs>
            {paths ? (
              <>
                <path d={paths.area} fill={`url(#${areaGradientId})`} />
                <path
                  d={paths.line}
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2.5"
                  vectorEffect="non-scaling-stroke"
                />
              </>
            ) : (
              <path
                d={`M ${SPARKLINE_PADDING} ${SPARKLINE_HEIGHT / 2} L ${
                  SPARKLINE_WIDTH - SPARKLINE_PADDING
                } ${SPARKLINE_HEIGHT / 2}`}
                fill="none"
                stroke="currentColor"
                strokeDasharray="4 5"
                strokeLinecap="round"
                strokeWidth="2"
                opacity="0.35"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>
          {hoverPoint && (
            <>
              <span
                className="pointer-events-none absolute inset-y-1 w-px bg-border/80"
                style={{ left: tooltipLeft }}
                aria-hidden="true"
              />
              <span
                className="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current ring-2 ring-background"
                style={{
                  left: `${(hoverPoint.x / SPARKLINE_WIDTH) * 100}%`,
                  top: `${(hoverPoint.y / SPARKLINE_HEIGHT) * 100}%`,
                }}
                aria-hidden="true"
              />
              <span
                className={`pointer-events-none absolute z-10 grid gap-0.5 rounded-md border bg-popover px-2 py-1 text-left font-mono text-[10px] leading-tight text-popover-foreground shadow-sm ${tooltipClass}`}
                style={{
                  left: tooltipLeft,
                  top: tooltipTop,
                }}
              >
                <span className="whitespace-nowrap font-semibold">
                  {formatCurrencyMaybe(hoverPoint.value, locale)}
                </span>
                <span className="whitespace-nowrap text-muted-foreground">
                  {formatChartTimeLabel(hoverPoint.timestamp, locale, true, true)}
                </span>
              </span>
            </>
          )}
          {!paths && (
            <span className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
              {emptyLabel}
            </span>
          )}
        </div>
        <div className="flex min-w-0 flex-col justify-between py-1 text-right font-mono text-[10px] leading-none text-muted-foreground">
          <span>{paths ? formatCompactPrice(paths.max, locale) : "--"}</span>
          <span>
            {midPrice != null ? formatCompactPrice(midPrice, locale) : "--"}
          </span>
          <span>{paths ? formatCompactPrice(paths.min, locale) : "--"}</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 pr-[4.4rem] font-mono text-[10px] leading-none text-muted-foreground">
        <span className="truncate">
          {paths ? formatChartTimeLabel(paths.firstTimestamp, locale) : "--"}
        </span>
        <span className="truncate text-center">
          {paths ? formatChartTimeLabel(paths.midTimestamp, locale) : "--"}
        </span>
        <span className="truncate text-right">
          {paths ? formatChartTimeLabel(paths.lastTimestamp, locale) : "--"}
        </span>
      </div>
    </div>
  );
});

const WatchlistSparkline = memo(function WatchlistSparkline({
  bars,
  latestTradePrice,
  latestTradeTimestamp,
  change,
}: {
  bars: MarketBar[];
  latestTradePrice: number | null;
  latestTradeTimestamp: string | null;
  change: PriceChange | null;
}) {
  const rawAreaGradientId = useId();
  const areaGradientId = `watchlist-area-gradient-${rawAreaGradientId.replace(
    /:/g,
    ""
  )}`;
  const paths = useMemo(
    () => buildSparklinePaths(bars, latestTradePrice, latestTradeTimestamp),
    [bars, latestTradePrice, latestTradeTimestamp]
  );
  const tone =
    change == null
      ? "text-muted-foreground"
      : change.absolute >= 0
        ? "text-green-500"
        : "text-red-500";

  return (
    <span className={`h-11 w-[5.75rem] shrink-0 sm:w-[7.5rem] ${tone}`} aria-hidden="true">
      <svg
        viewBox={`0 0 ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}`}
        preserveAspectRatio="none"
        className="h-full w-full overflow-visible"
      >
        <defs>
          <linearGradient
            id={areaGradientId}
            x1="0"
            x2="0"
            y1={SPARKLINE_PADDING}
            y2={SPARKLINE_HEIGHT}
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.32" />
            <stop offset="52%" stopColor="currentColor" stopOpacity="0.14" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {paths ? (
          <>
            <path d={paths.area} fill={`url(#${areaGradientId})`} />
            <path
              d={paths.line}
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="3"
              vectorEffect="non-scaling-stroke"
            />
          </>
        ) : (
          <path
            d={`M ${SPARKLINE_PADDING} ${SPARKLINE_HEIGHT / 2} L ${
              SPARKLINE_WIDTH - SPARKLINE_PADDING
            } ${SPARKLINE_HEIGHT / 2}`}
            fill="none"
            stroke="currentColor"
            strokeDasharray="4 5"
            strokeLinecap="round"
            strokeWidth="2"
            opacity="0.35"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
    </span>
  );
});

type PriceChange = {
  absolute: number;
  percent: number;
};

function ChangePill({
  change,
  locale,
  size = "md",
}: {
  change: PriceChange | null;
  locale: Locale;
  size?: "sm" | "md";
}) {
  const sizeClass =
    size === "sm"
      ? "min-w-[4rem] px-2 py-0.5 text-xs"
      : "min-w-[4.6rem] px-2.5 py-1 text-sm";

  if (!change) {
    return (
      <span
        className={[
          "rounded-md bg-muted text-center font-mono font-semibold leading-none text-muted-foreground",
          sizeClass,
        ].join(" ")}
      >
        --
      </span>
    );
  }

  const positive = change.absolute >= 0;
  return (
    <span
      className={[
        "rounded-md text-center font-mono font-semibold leading-none text-white",
        sizeClass,
        positive ? "bg-green-600" : "bg-red-500",
      ].join(" ")}
    >
      {formatSignedPercent(change.percent, locale)}
    </span>
  );
}

function securityNameForSymbol(
  symbol: string,
  asset: MarketAssetSummary | null
): string {
  const normalized = symbol.toUpperCase();
  const assetName = asset?.name.trim();
  if (assetName && assetName.toUpperCase() !== normalized) return assetName;
  return FALLBACK_SECURITY_NAMES[normalized] ?? normalized;
}

type SparklinePaths = {
  line: string;
  area: string;
  min: number;
  max: number;
  firstTimestamp: string;
  midTimestamp: string;
  lastTimestamp: string;
  latestTimestamp: string;
  points: SparklinePlotPoint[];
};

type SparklinePoint = {
  value: number;
  timestamp: string;
};

type SparklinePlotPoint = SparklinePoint & {
  x: number;
  y: number;
};

type MarketTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

type MarketSessionDomain = {
  startMs: number;
  midMs: number;
  endMs: number;
};

function buildSparklinePaths(
  bars: MarketBar[],
  latestTradePrice: number | null = null,
  latestTradeTimestamp: string | null = null
): SparklinePaths | null {
  let points: SparklinePoint[] = [];
  for (const bar of bars) {
    const close = positiveNumber(bar.close);
    if (close != null) {
      points.push({ value: close, timestamp: bar.timestamp });
    }
  }

  points.sort((a, b) => chartTimeMs(a.timestamp) - chartTimeMs(b.timestamp));
  points = mergeLatestTradePoint(points, latestTradePrice, latestTradeTimestamp);
  if (points.length < 2) return null;

  const latestMarketDate = marketDateKey(points[points.length - 1].timestamp);
  const latestSessionPoints = latestMarketDate
    ? points.filter((point) => marketDateKey(point.timestamp) === latestMarketDate)
    : points;
  if (latestSessionPoints.length >= 2) {
    points = latestSessionPoints;
  }

  const sessionDomain = marketSessionDomainForTimestamp(
    points[points.length - 1].timestamp
  );
  if (!sessionDomain) return null;

  points = points.filter((point) => {
    const timeMs = chartTimeMs(point.timestamp);
    return timeMs >= sessionDomain.startMs && timeMs <= sessionDomain.endMs;
  });
  if (points.length < 2) return null;

  const sampledPoints =
    points.length > SPARKLINE_MAX_POINTS ? sampleSparklinePoints(points) : points;

  let min = sampledPoints[0].value;
  let max = sampledPoints[0].value;
  for (const point of sampledPoints) {
    if (point.value < min) min = point.value;
    if (point.value > max) max = point.value;
  }

  let plotMin = min;
  let plotMax = max;
  if (plotMin === plotMax) {
    const padding = Math.max(Math.abs(plotMax) * 0.005, 1);
    plotMin -= padding;
    plotMax += padding;
  }

  const plotWidth = SPARKLINE_WIDTH - SPARKLINE_PADDING * 2;
  const plotHeight = SPARKLINE_HEIGHT - SPARKLINE_PADDING * 2;
  const bottom = SPARKLINE_HEIGHT - SPARKLINE_PADDING;
  const sessionDuration = sessionDomain.endMs - sessionDomain.startMs;
  const pathParts: string[] = [];
  const plotPoints: SparklinePlotPoint[] = [];
  let firstX = "";
  let lastX = "";

  sampledPoints.forEach((sampledPoint, index) => {
    const sessionProgress =
      sessionDuration > 0
        ? (chartTimeMs(sampledPoint.timestamp) - sessionDomain.startMs) /
          sessionDuration
        : 0;
    const x =
      SPARKLINE_PADDING + plotWidth * clampNumber(sessionProgress, 0, 1);
    const y =
      SPARKLINE_PADDING +
      plotHeight -
      ((sampledPoint.value - plotMin) / (plotMax - plotMin)) * plotHeight;
    const pathPoint = `${index === 0 ? "M" : "L"} ${formatSparklineNumber(
      x
    )} ${formatSparklineNumber(y)}`;
    pathParts.push(pathPoint);
    plotPoints.push({
      ...sampledPoint,
      x,
      y,
    });
    if (index === 0) firstX = formatSparklineNumber(x);
    if (index === sampledPoints.length - 1) lastX = formatSparklineNumber(x);
  });

  const line = pathParts.join(" ");
  const latestPoint = points[points.length - 1];
  return {
    line,
    area: `${line} L ${lastX} ${formatSparklineNumber(bottom)} L ${firstX} ${formatSparklineNumber(
      bottom
    )} Z`,
    min,
    max,
    firstTimestamp: new Date(sessionDomain.startMs).toISOString(),
    midTimestamp: new Date(sessionDomain.midMs).toISOString(),
    lastTimestamp: new Date(sessionDomain.endMs).toISOString(),
    latestTimestamp: latestPoint.timestamp,
    points: plotPoints,
  };
}

function mergeLatestTradePoint(
  points: SparklinePoint[],
  latestTradePrice: number | null,
  latestTradeTimestamp: string | null
): SparklinePoint[] {
  const latestPrice = positiveNumber(latestTradePrice);
  if (latestPrice == null) return points;

  const fallbackTimestamp =
    points[points.length - 1]?.timestamp ?? new Date().toISOString();
  const timestamp = validChartTimestamp(latestTradeTimestamp) ?? fallbackTimestamp;
  const latestTimeMs = chartTimeMs(timestamp);
  const latestPoint = { value: latestPrice, timestamp };

  if (points.length === 0) return [latestPoint];

  const nextPoints = points.slice();
  for (let index = 0; index < nextPoints.length; index += 1) {
    const pointTimeMs = chartTimeMs(nextPoints[index].timestamp);
    if (pointTimeMs === latestTimeMs) {
      nextPoints[index] = latestPoint;
      return nextPoints;
    }
    if (pointTimeMs > latestTimeMs) {
      nextPoints.splice(index, 0, latestPoint);
      return nextPoints;
    }
  }

  nextPoints.push(latestPoint);
  return nextPoints;
}

function sampleSparklinePoints(points: SparklinePoint[]): SparklinePoint[] {
  const out: SparklinePoint[] = [];
  const step = (points.length - 1) / (SPARKLINE_MAX_POINTS - 1);
  for (let index = 0; index < SPARKLINE_MAX_POINTS; index += 1) {
    const sourceIndex =
      index === SPARKLINE_MAX_POINTS - 1
        ? points.length - 1
        : Math.round(index * step);
    out.push(points[sourceIndex]);
  }
  return out;
}

function nearestSparklinePoint(
  points: SparklinePlotPoint[],
  chartX: number
): SparklinePlotPoint {
  let nearest = points[0];
  let nearestDistance = Math.abs(nearest.x - chartX);
  for (let index = 1; index < points.length; index += 1) {
    const point = points[index];
    const distance = Math.abs(point.x - chartX);
    if (distance < nearestDistance) {
      nearest = point;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function chartTimeMs(value: string): number {
  const timeMs = new Date(value).getTime();
  return Number.isNaN(timeMs) ? 0 : timeMs;
}

function marketSessionDomainForTimestamp(
  value: string | null | undefined
): MarketSessionDomain | null {
  if (!value) return null;
  const timeMs = chartTimeMs(value);
  if (timeMs <= 0) return null;

  const marketDate = getMarketTimeParts(timeMs);
  if (!marketDate) return null;

  const startMs = zonedWallTimeToUtcMs(
    marketDate,
    MARKET_SESSION_OPEN.hour,
    MARKET_SESSION_OPEN.minute
  );
  const endMs = zonedWallTimeToUtcMs(
    marketDate,
    MARKET_SESSION_CLOSE.hour,
    MARKET_SESSION_CLOSE.minute
  );
  if (endMs <= startMs) return null;

  return {
    startMs,
    midMs: startMs + (endMs - startMs) / 2,
    endMs,
  };
}

function marketDateKey(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return MARKET_DATE_FORMATTER.format(date);
}

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

function validChartTimestamp(value: string | null | undefined): string | null {
  if (!value) return null;
  return Number.isNaN(new Date(value).getTime()) ? null : value;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function formatSparklineNumber(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

function snapshotDisplayPrice(snapshot: MarketSnapshot | null): number | null {
  const bid = positiveNumber(snapshot?.bid_price);
  const ask = positiveNumber(snapshot?.ask_price);
  const midpoint = bid != null && ask != null && ask >= bid ? (bid + ask) / 2 : null;
  return (
    positiveNumber(snapshot?.latest_trade_price) ??
    midpoint ??
    positiveNumber(snapshot?.day_close)
  );
}

function priceChange(
  snapshot: MarketSnapshot | null,
  price: number | null
): PriceChange | null {
  const currentPrice = positiveNumber(price);
  const previousClose = positiveNumber(snapshot?.previous_close);
  if (currentPrice == null || previousClose == null) return null;

  const absolute = currentPrice - previousClose;
  return {
    absolute,
    percent: (absolute / previousClose) * 100,
  };
}

function formatCurrencyMaybe(value: number | null | undefined, locale: Locale) {
  const price = positiveNumber(value);
  if (price == null) return "--";
  return formatCurrency(price, locale, {
    maximumFractionDigits: Math.abs(price) >= 1000 ? 0 : 2,
  });
}

function formatCompactPrice(value: number | null | undefined, locale: Locale) {
  const price = positiveNumber(value);
  if (price == null) return "--";
  return formatCurrency(price, locale, {
    maximumFractionDigits: Math.abs(price) >= 1000 ? 0 : 2,
  });
}

function formatChartTimeLabel(
  value: string | null | undefined,
  locale: Locale,
  includeDate = false,
  includeZone = false
) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString(locale, {
    timeZone: MARKET_TIME_ZONE,
    month: includeDate ? "short" : undefined,
    day: includeDate ? "2-digit" : undefined,
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: includeZone ? "short" : undefined,
  });
}

function formatCurrencyValue(value: number | null | undefined, locale: Locale) {
  const number = finiteNumber(value);
  if (number == null) return "--";
  return formatCurrency(number, locale, {
    maximumFractionDigits: Math.abs(number) >= 1000 ? 0 : 2,
  });
}

function formatNumberMaybe(value: number | null | undefined, locale: Locale) {
  const number = finiteNumber(value);
  if (number == null) return "--";
  return number.toLocaleString(locale, { maximumFractionDigits: 0 });
}

function formatDateTimeMaybe(value: string | null | undefined, locale: Locale) {
  return value ? formatDateTime(value, locale) : "--";
}

function formatChangeDetail(change: PriceChange | null, locale: Locale) {
  if (!change) return "--";
  return `${formatCurrency(change.absolute, locale, {
    maximumFractionDigits: 2,
  })} · ${formatSignedPercent(change.percent, locale)}`;
}

function formatSignedPercent(value: number, locale: Locale) {
  return `${value >= 0 ? "+" : ""}${formatPercent(value, locale)}`;
}

function formatAssetClass(value: string | null | undefined) {
  if (!value) return "--";
  const words = value
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1));
  return words.join(" ").replace(/^Us\b/, "US");
}

function subscribeFavoriteSymbols(callback: () => void) {
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

function getFavoriteSymbolsSnapshot() {
  if (typeof window === "undefined") return "";

  try {
    return window.localStorage.getItem(FAVORITES_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function getFavoriteSymbolsServerSnapshot() {
  return "";
}

function parseFavoriteSymbols(snapshot: string): string[] {
  if (!snapshot) return [];

  try {
    const parsed = JSON.parse(snapshot) as unknown;
    return Array.isArray(parsed)
      ? normalizeFavoriteSymbols(parsed.filter((item) => typeof item === "string"))
      : [];
  } catch {
    return [];
  }
}

function normalizeFavoriteSymbols(symbols: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of symbols) {
    const symbol = value.trim().toUpperCase();
    if (!FAVORITE_SYMBOL_PATTERN.test(symbol) || seen.has(symbol)) continue;
    seen.add(symbol);
    out.push(symbol);
  }
  return out.slice(0, MAX_FAVORITE_SYMBOLS);
}

function validateOrder(
  symbol: string,
  qty: number,
  orderType: ManualOrderType,
  limitPrice: number,
  extendedHours: boolean,
  messages: {
    invalidSymbol: string;
    invalidQuantity: string;
    invalidLimitPrice: string;
    invalidExtendedHours: string;
  }
) {
  if (!SYMBOL_PATTERN.test(symbol)) return messages.invalidSymbol;
  if (!Number.isFinite(qty) || qty <= 0) return messages.invalidQuantity;
  if (extendedHours && orderType !== "limit") return messages.invalidExtendedHours;
  if (orderType === "limit" && (!Number.isFinite(limitPrice) || limitPrice <= 0)) {
    return messages.invalidLimitPrice;
  }
  return null;
}

function estimateDetailText(
  source: "limit" | "quote" | "position" | "none",
  referencePrice: number | null,
  quoteLoading: boolean,
  quoteUnavailable: boolean,
  locale: Locale,
  messages: {
    estimateLimitDetail: string;
    estimateQuoteDetail: string;
    estimatePositionDetail: string;
    quoteLoading: string;
    quoteUnavailable: string;
    marketPriceHint: string;
  }
) {
  if (source !== "none" && referencePrice != null) {
    const price = formatCurrency(referencePrice, locale);
    if (source === "limit") {
      return messages.estimateLimitDetail.replace("{price}", price);
    }
    if (source === "quote") {
      return messages.estimateQuoteDetail.replace("{price}", price);
    }
    return messages.estimatePositionDetail.replace("{price}", price);
  }
  if (quoteLoading) return messages.quoteLoading;
  if (quoteUnavailable) return messages.quoteUnavailable;
  return messages.marketPriceHint;
}

function marketPriceForSide(quote: Quote | null, side: OrderSide) {
  if (!quote) return null;
  if (side === "buy") {
    return (
      positiveNumber(quote.ask_price) ??
      positiveNumber(quote.last_price) ??
      positiveNumber(quote.bid_price)
    );
  }
  return (
    positiveNumber(quote.bid_price) ??
    positiveNumber(quote.last_price) ??
    positiveNumber(quote.ask_price)
  );
}

function unitPriceFromPosition(position: Position | null) {
  if (!position || position.qty === 0) return null;
  return positiveNumber(Math.abs(position.market_value / position.qty));
}

function positiveNumber(value: number | null | undefined) {
  const number = finiteNumber(value);
  return number != null && number > 0 ? number : null;
}

function finiteNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
