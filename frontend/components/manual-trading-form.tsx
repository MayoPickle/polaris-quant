"use client";

import { useRouter } from "next/navigation";
import {
  FormEvent,
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { CircleCheck, GripVertical, History, Plus, Search, Send } from "lucide-react";

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

type ManualOrderType = OrderType;

const SYMBOL_PATTERN = /^[A-Z][A-Z0-9.-]{0,14}$/;
const FAVORITE_SYMBOL_PATTERN = /^[A-Z][A-Z0-9.-]{0,14}$/;
const FAVORITES_STORAGE_KEY = "polaris.market.favoriteSymbols.v1";
const FAVORITES_CHANGED_EVENT = "polaris-market-favorites-changed";
const MAX_FAVORITE_SYMBOLS = 20;
const WATCHLIST_REORDER_LONG_PRESS_MS = 420;
const WATCHLIST_REORDER_MOVE_CANCEL_PX = 10;
const WATCHLIST_BAR_TIMEFRAME = "1Min";
const WATCHLIST_BAR_LOOKBACK_DAYS = 1;
const WATCHLIST_SPARKLINE_GEOMETRY = {
  width: 120,
  height: 44,
  paddingX: 3,
  paddingTop: 3,
  paddingBottom: 3,
  maxPoints: 56,
} as const;
const DETAIL_SPARKLINE_GEOMETRY = {
  width: 180,
  height: 56,
  paddingX: 0.5,
  paddingTop: 1.5,
  paddingBottom: 0.5,
  maxPoints: 96,
} as const;
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
  const [stopPrice, setStopPrice] = useState("");
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
  const numericStopPrice = Number(stopPrice);
  const requiresLimitPrice =
    orderType === "limit" || orderType === "stop_limit";
  const requiresStopPrice =
    orderType === "stop" || orderType === "stop_limit";
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
  const referencePrice = requiresLimitPrice
    ? numericLimitPrice > 0
      ? numericLimitPrice
      : null
    : requiresStopPrice && numericStopPrice > 0
      ? numericStopPrice
      : marketReferencePrice;
  const estimatedNotional =
    numericQty > 0 && referencePrice != null ? numericQty * referencePrice : null;
  const estimateSource =
    requiresLimitPrice && numericLimitPrice > 0
      ? "limit"
      : orderType === "stop" && numericStopPrice > 0
        ? "stop"
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
  const estimatePanelClass =
    orderType === "market"
      ? "md:col-span-3"
      : orderType === "stop_limit"
        ? ""
        : "md:col-span-2";
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
      numericStopPrice,
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
        limit_price: requiresLimitPrice ? numericLimitPrice : null,
        stop_price: requiresStopPrice ? numericStopPrice : null,
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
                <option value="stop">{t.manualTrading.stop}</option>
                <option value="stop_limit">{t.manualTrading.stopLimit}</option>
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

          <div className="grid gap-3 md:grid-cols-4">
            {requiresStopPrice && (
              <Field label={t.manualTrading.stopPrice}>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={stopPrice}
                  onChange={(event) => setStopPrice(event.target.value)}
                  className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
                />
              </Field>
            )}
            {requiresLimitPrice && (
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
                estimatePanelClass,
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
  watchlistSearchLabel: string;
  watchlistSearchPlaceholder: string;
  watchlistSearchNoResults: string;
  watchlistSearchFailed: string;
  watchlistAddFavorite: string;
  watchlistFavoriteSaved: string;
  watchlistFavoriteLimit: string;
  watchlistReorder: string;
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
  buy: string;
  market: string;
  stop: string;
  stopLimit: string;
  quantity: string;
  submitting: string;
  submittedTitle: string;
  estimatedNotional: string;
  invalidSymbol: string;
  invalidQuantity: string;
  invalidLimitPrice: string;
  invalidStopPrice: string;
  invalidExtendedHours: string;
  orderFailed: string;
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
  const [searchInput, setSearchInput] = useState("");
  const [searchResults, setSearchResults] = useState<MarketAssetSummary[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchedQuery, setSearchedQuery] = useState("");
  const [reorderingSymbol, setReorderingSymbol] = useState<string | null>(null);
  const symbolsRef = useRef(symbols);
  const listRef = useRef<HTMLDivElement | null>(null);
  const reorderRef = useRef<WatchlistReorderSession | null>(null);
  const suppressNextSelectRef = useRef(false);
  const searchQuery = searchInput.trim();
  const hasSearchQuery = searchQuery.length > 0;
  const favoriteSymbolSet = useMemo(() => new Set(symbols), [symbols]);
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
      if (suppressNextSelectRef.current) {
        suppressNextSelectRef.current = false;
        return;
      }
      onSelect(nextSymbol);
      setDetailSymbol(nextSymbol);
    },
    [onSelect]
  );
  const clearReorderSession = useCallback(() => {
    const session = reorderRef.current;
    if (!session) return;

    if (session.timerId != null) {
      window.clearTimeout(session.timerId);
    }
    window.removeEventListener("pointermove", session.handlePointerMove);
    window.removeEventListener("pointerup", session.handlePointerEnd);
    window.removeEventListener("pointercancel", session.handlePointerEnd);
    if (session.activated) {
      suppressNextSelectRef.current = true;
      window.setTimeout(() => {
        suppressNextSelectRef.current = false;
      }, 0);
    }
    reorderRef.current = null;
    setReorderingSymbol(null);
  }, []);
  const beginReorderPress = useCallback(
    (symbol: string, event: ReactPointerEvent<HTMLButtonElement>) => {
      if (symbolsRef.current.length < 2) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;

      clearReorderSession();
      const startY = event.clientY;
      const pointerId = event.pointerId;

      const activateReorder = () => {
        const currentSymbols = symbolsRef.current;
        if (!currentSymbols.includes(symbol)) return;

        const rowRects = measureWatchlistRows(listRef.current);
        if (rowRects.length < 2) return;

        const session = reorderRef.current;
        if (!session || session.pointerId !== pointerId) return;

        session.activated = true;
        session.rowRects = rowRects;
        session.timerId = null;
        setReorderingSymbol(symbol);
      };

      const handlePointerMove = (pointerEvent: PointerEvent) => {
        const session = reorderRef.current;
        if (!session || session.pointerId !== pointerEvent.pointerId) return;

        const deltaY = pointerEvent.clientY - session.startY;
        if (!session.activated) {
          if (Math.abs(deltaY) > WATCHLIST_REORDER_MOVE_CANCEL_PX) {
            clearReorderSession();
          }
          return;
        }

        pointerEvent.preventDefault();
        const currentSymbols = symbolsRef.current;
        const fromIndex = currentSymbols.indexOf(symbol);
        if (fromIndex < 0) return;

        const rowRects =
          session.rowRects.length === currentSymbols.length
            ? session.rowRects
            : measureWatchlistRows(listRef.current);
        session.rowRects = rowRects;
        const toIndex = watchlistIndexForClientY(pointerEvent.clientY, rowRects);
        if (toIndex < 0 || toIndex === fromIndex) return;

        const nextSymbols = moveSymbol(currentSymbols, fromIndex, toIndex);
        symbolsRef.current = nextSymbols;
        writeFavoriteSymbols(nextSymbols);
      };

      const handlePointerEnd = (pointerEvent: PointerEvent) => {
        const session = reorderRef.current;
        if (!session || session.pointerId !== pointerEvent.pointerId) return;
        if (session.activated) pointerEvent.preventDefault();
        clearReorderSession();
      };

      const timerId = window.setTimeout(
        activateReorder,
        WATCHLIST_REORDER_LONG_PRESS_MS
      );
      reorderRef.current = {
        symbol,
        pointerId,
        startY,
        activated: false,
        timerId,
        rowRects: [],
        handlePointerMove,
        handlePointerEnd,
      };
      window.addEventListener("pointermove", handlePointerMove, { passive: false });
      window.addEventListener("pointerup", handlePointerEnd);
      window.addEventListener("pointercancel", handlePointerEnd);
    },
    [clearReorderSession]
  );
  const addSearchFavorite = useCallback(
    (asset: MarketAssetSummary) => {
      const normalized = normalizeFavoriteSymbols([asset.symbol])[0];
      if (!normalized) {
        setSearchError(labels.invalidSymbol);
        return;
      }
      if (favoriteSymbolSet.has(normalized)) return;
      if (symbols.length >= MAX_FAVORITE_SYMBOLS) {
        setSearchError(labels.watchlistFavoriteLimit);
        return;
      }

      writeFavoriteSymbols([normalized, ...symbols]);
      onSelect(normalized);
      setSearchInput("");
      setSearchResults([]);
      setSearchError(null);
      setSearchedQuery("");
    },
    [
      favoriteSymbolSet,
      labels.invalidSymbol,
      labels.watchlistFavoriteLimit,
      onSelect,
      symbols,
    ]
  );

  useEffect(() => {
    symbolsRef.current = symbols;
  }, [symbols]);

  useEffect(() => {
    return () => clearReorderSession();
  }, [clearReorderSession]);

  useEffect(() => {
    if (!hasSearchQuery) {
      return;
    }

    let canceled = false;
    const timer = window.setTimeout(async () => {
      setSearchLoading(true);
      setSearchError(null);
      try {
        const response = await api.marketAssetSearch(searchQuery, 8);
        if (!canceled) {
          setSearchResults(response.assets);
          setSearchedQuery(searchQuery);
        }
      } catch {
        if (!canceled) {
          setSearchResults([]);
          setSearchError(labels.watchlistSearchFailed);
          setSearchedQuery(searchQuery);
        }
      } finally {
        if (!canceled) setSearchLoading(false);
      }
    }, 250);

    return () => {
      canceled = true;
      window.clearTimeout(timer);
    };
  }, [hasSearchQuery, labels.watchlistSearchFailed, searchQuery]);

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

        <div className="border-b px-3 py-2.5 dark:border-white/10">
          <label className="grid gap-1.5">
            <span className="sr-only">{labels.watchlistSearchLabel}</span>
            <span className="flex h-10 min-w-0 items-center gap-2 rounded-lg border bg-background px-3 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/20 dark:border-white/10 dark:bg-white/5">
              <Search
                aria-hidden="true"
                className="size-4 shrink-0 text-muted-foreground"
              />
              <input
                value={searchInput}
                onChange={(event) => {
                  setSearchInput(event.target.value);
                  setSearchResults([]);
                  setSearchError(null);
                  setSearchedQuery("");
                }}
                placeholder={labels.watchlistSearchPlaceholder}
                className="h-full min-w-0 flex-1 bg-transparent font-mono text-sm font-semibold uppercase outline-none placeholder:font-sans placeholder:font-normal placeholder:normal-case placeholder:text-muted-foreground"
              />
              {searchLoading && (
                <Badge variant="outline" className="shrink-0">
                  {labels.watchlistLoading}
                </Badge>
              )}
            </span>
          </label>

          {hasSearchQuery &&
            (searchLoading ||
              searchError ||
              searchResults.length > 0 ||
              searchedQuery === searchQuery) && (
              <div className="mt-2 overflow-hidden rounded-lg border bg-muted/20 dark:border-white/10 dark:bg-white/5">
                {searchError ? (
                  <p className="px-3 py-2 text-xs leading-5 text-red-600">
                    {searchError}
                  </p>
                ) : searchResults.length > 0 ? (
                  <div className="divide-y dark:divide-white/10">
                    {searchResults.map((asset) => {
                      const resultSymbol = asset.symbol.toUpperCase();
                      const isFavorite = favoriteSymbolSet.has(resultSymbol);
                      return (
                        <div
                          key={resultSymbol}
                          className="flex min-w-0 items-center gap-2 px-3 py-2"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-mono text-sm font-bold">
                              {resultSymbol}
                            </span>
                            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                              {asset.name}
                              {asset.exchange ? ` · ${asset.exchange}` : ""}
                            </span>
                          </span>
                          <Button
                            type="button"
                            variant={isFavorite ? "secondary" : "outline"}
                            size="sm"
                            disabled={isFavorite}
                            onClick={() => addSearchFavorite(asset)}
                            className="h-8 shrink-0 px-2.5"
                            aria-label={`${labels.watchlistAddFavorite}: ${resultSymbol}`}
                          >
                            {!isFavorite && <Plus data-icon="inline-start" />}
                            {isFavorite
                              ? labels.watchlistFavoriteSaved
                              : labels.watchlistAddFavorite}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="px-3 py-2 text-xs leading-5 text-muted-foreground">
                    {labels.watchlistSearchNoResults}
                  </p>
                )}
              </div>
            )}
        </div>

        {symbols.length > 0 ? (
          <div
            ref={listRef}
            className={[
              "divide-y dark:divide-white/10",
              reorderingSymbol ? "select-none" : "",
            ].join(" ")}
          >
            {symbols.map((symbol) => (
              <TradingWatchlistRow
                key={symbol}
                symbol={symbol}
                snapshot={snapshotBySymbol.get(symbol) ?? null}
                bars={barsBySymbol.get(symbol) ?? EMPTY_MARKET_BARS}
                asset={assetBySymbol.get(symbol) ?? null}
                active={selectedSymbol === symbol}
                reordering={reorderingSymbol === symbol}
                locale={locale}
                onSelect={openDetail}
                onReorderPointerDown={beginReorderPress}
                reorderLabel={labels.watchlistReorder}
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

type WatchlistRowRect = {
  top: number;
  bottom: number;
};

type WatchlistReorderSession = {
  symbol: string;
  pointerId: number;
  startY: number;
  activated: boolean;
  timerId: number | null;
  rowRects: WatchlistRowRect[];
  handlePointerMove: (event: PointerEvent) => void;
  handlePointerEnd: (event: PointerEvent) => void;
};

const TradingWatchlistRow = memo(function TradingWatchlistRow({
  symbol,
  snapshot,
  bars,
  asset,
  active,
  reordering,
  locale,
  onSelect,
  onReorderPointerDown,
  reorderLabel,
}: {
  symbol: string;
  snapshot: MarketSnapshot | null;
  bars: MarketBar[];
  asset: MarketAssetSummary | null;
  active: boolean;
  reordering: boolean;
  locale: Locale;
  onSelect: (symbol: string) => void;
  onReorderPointerDown: (
    symbol: string,
    event: ReactPointerEvent<HTMLButtonElement>
  ) => void;
  reorderLabel: string;
}) {
  const price = snapshotDisplayPrice(snapshot);
  const change = priceChange(snapshot, price);
  const securityName = securityNameForSymbol(symbol, asset);
  const handleSelect = useCallback(() => onSelect(symbol), [onSelect, symbol]);
  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      onReorderPointerDown(symbol, event);
    },
    [onReorderPointerDown, symbol]
  );

  return (
    <button
      type="button"
      data-watchlist-symbol={symbol}
      aria-pressed={active}
      aria-grabbed={reordering}
      aria-label={`${symbol} ${securityName}`}
      onClick={handleSelect}
      onPointerDown={handlePointerDown}
      onContextMenu={(event) => event.preventDefault()}
      className={[
        "flex min-h-[4.75rem] w-full touch-pan-y items-center gap-2.5 px-3 py-2.5 text-left transition-[background-color,box-shadow,transform] hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-white/10",
        active ? "bg-muted dark:bg-white/10" : "",
        reordering
          ? "relative z-10 cursor-grabbing bg-muted/80 shadow-sm ring-1 ring-ring/30 touch-none dark:bg-white/15"
          : "cursor-grab",
      ].join(" ")}
    >
      <GripVertical
        aria-hidden="true"
        className={[
          "size-3.5 shrink-0 text-muted-foreground transition-opacity",
          reordering ? "opacity-100" : "opacity-35",
        ].join(" ")}
      />
      <span className="sr-only">{`${reorderLabel}: ${symbol}`}</span>
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
    <DialogContent className="grid max-h-[min(42rem,calc(100dvh-1rem))] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:max-w-2xl">
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

      <div className="min-h-0 overflow-y-auto overscroll-contain px-3 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 sm:px-4">
        <section className="rounded-lg border bg-muted/20 p-2">
          <DetailSparkline
            bars={bars}
            latestTradePrice={snapshot?.latest_trade_price ?? null}
            latestTradeTimestamp={snapshot?.latest_trade_timestamp ?? null}
            openingPrice={snapshot?.day_open ?? null}
            change={change}
            locale={locale}
            emptyLabel={labels.detailNoData}
            openingLabel={labels.detailOpen}
          />
        </section>

        <QuickBuyPanel
          symbol={symbol}
          price={price}
          locale={locale}
          labels={labels}
        />

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

function QuickBuyPanel({
  symbol,
  price,
  locale,
  labels,
}: {
  symbol: string;
  price: number | null;
  locale: Locale;
  labels: TradingWatchlistLabels;
}) {
  const router = useRouter();
  const [qty, setQty] = useState("1");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedOrder, setSubmittedOrder] = useState<Order | null>(null);
  const normalizedSymbol = symbol.trim().toUpperCase();
  const numericQty = Number(qty);
  const referencePrice = positiveNumber(price);
  const estimatedNotional =
    referencePrice != null && Number.isFinite(numericQty) && numericQty > 0
      ? referencePrice * numericQty
      : null;

  async function submitQuickBuy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = validateOrder(
      normalizedSymbol,
      numericQty,
      "market",
      0,
      0,
      false,
      labels
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
        side: "buy",
        qty: numericQty,
        order_type: "market",
        limit_price: null,
        extended_hours: false,
      });
      setSubmittedOrder(order);
      router.refresh();
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : labels.orderFailed);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={submitQuickBuy}
      className="mt-3 rounded-lg border bg-background px-3 py-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">
            {labels.buy} {normalizedSymbol}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">{labels.market}</p>
        </div>
        <Badge variant="outline" className="shrink-0">
          {labels.market}
        </Badge>
      </div>

      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
        <Field label={labels.quantity}>
          <input
            type="number"
            min="0"
            step="any"
            value={qty}
            onChange={(event) => {
              setQty(event.target.value);
              setError(null);
              setSubmittedOrder(null);
            }}
            className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
          />
        </Field>
        <Button type="submit" disabled={loading} className="h-10 min-w-20">
          <Send data-icon="inline-start" />
          {loading ? labels.submitting : labels.buy}
        </Button>
      </div>

      <div className="mt-2 flex items-center justify-between gap-3 text-xs">
        <span className="text-muted-foreground">{labels.estimatedNotional}</span>
        <span className="font-mono font-semibold tabular-nums">
          {estimatedNotional != null
            ? formatCurrency(estimatedNotional, locale)
            : "--"}
        </span>
      </div>

      {error && (
        <p className="mt-2 text-xs leading-5 text-red-600" role="alert">
          {error}
        </p>
      )}

      {submittedOrder && (
        <div className="mt-2 rounded-md border bg-muted/20 px-2.5 py-2 text-xs">
          <div className="flex items-center gap-2 font-medium">
            <CircleCheck aria-hidden="true" className="size-3.5" />
            <span>{labels.submittedTitle}</span>
          </div>
          <p className="mt-1 text-muted-foreground">
            {submittedOrder.symbol} · {orderSideLabel(submittedOrder.side, locale)} ·{" "}
            {orderTypeLabel(submittedOrder.order_type, locale)} ·{" "}
            {orderStatusLabel(submittedOrder.status, locale)}
          </p>
        </div>
      )}
    </form>
  );
}

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
  openingPrice,
  change,
  locale,
  emptyLabel,
  openingLabel,
}: {
  bars: MarketBar[];
  latestTradePrice: number | null;
  latestTradeTimestamp: string | null;
  openingPrice: number | null;
  change: PriceChange | null;
  locale: Locale;
  emptyLabel: string;
  openingLabel: string;
}) {
  const geometry = DETAIL_SPARKLINE_GEOMETRY;
  const rawAreaGradientId = useId();
  const areaGradientId = `detail-area-gradient-${rawAreaGradientId.replace(/:/g, "")}`;
  const paths = useMemo(
    () =>
      buildSparklinePaths(
        bars,
        latestTradePrice,
        latestTradeTimestamp,
        geometry,
        openingPrice
      ),
    [bars, latestTradePrice, latestTradeTimestamp, geometry, openingPrice]
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
      : hoverPoint.x < geometry.width * 0.28
        ? "translate-x-0"
        : hoverPoint.x > geometry.width * 0.72
          ? "-translate-x-full"
          : "-translate-x-1/2";
  const tooltipLeft = hoverPoint
    ? `${(hoverPoint.x / geometry.width) * 100}%`
    : undefined;
  const tooltipTop = hoverPoint
    ? `${Math.max(
        8,
        Math.min(72, (hoverPoint.y / geometry.height) * 100)
      )}%`
    : undefined;
  const openingGuideTop =
    paths?.openingPriceY != null
      ? `${Math.max(
          8,
          Math.min(90, (paths.openingPriceY / geometry.height) * 100)
        )}%`
      : undefined;
  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!paths) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (rect.width <= 0) return;
      const chartX =
        ((event.clientX - rect.left) / rect.width) * geometry.width;
      setHoverPoint(nearestSparklinePoint(paths.points, chartX));
    },
    [paths, geometry]
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
        className={`grid h-44 w-full grid-cols-[minmax(0,1fr)_3.15rem] gap-1.5 sm:h-48 ${tone}`}
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
            viewBox={`0 0 ${geometry.width} ${geometry.height}`}
            preserveAspectRatio="none"
            className="h-full w-full overflow-visible"
            aria-hidden="true"
          >
            <defs>
              <linearGradient
                id={areaGradientId}
                x1="0"
                x2="0"
                y1={geometry.paddingTop}
                y2={geometry.height}
                gradientUnits="userSpaceOnUse"
              >
                <stop offset="0%" stopColor="currentColor" stopOpacity="0.4" />
                <stop offset="54%" stopColor="currentColor" stopOpacity="0.2" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0.04" />
              </linearGradient>
            </defs>
            {paths ? (
              <>
                <path d={paths.area} fill={`url(#${areaGradientId})`} />
                {paths.openingPriceY != null && (
                  <path
                    className="text-muted-foreground"
                    d={`M ${geometry.paddingX} ${formatSparklineNumber(
                      paths.openingPriceY
                    )} L ${geometry.width - geometry.paddingX} ${formatSparklineNumber(
                      paths.openingPriceY
                    )}`}
                    fill="none"
                    stroke="currentColor"
                    strokeDasharray="3 4"
                    strokeLinecap="round"
                    strokeWidth="1.2"
                    opacity="0.58"
                    vectorEffect="non-scaling-stroke"
                  />
                )}
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
                d={`M ${geometry.paddingX} ${geometry.height / 2} L ${
                  geometry.width - geometry.paddingX
                } ${geometry.height / 2}`}
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
          {paths?.openingPriceY != null && paths.openingPrice != null && (
            <span
              className="pointer-events-none absolute right-1 max-w-[45%] -translate-y-1/2 rounded-sm bg-background/80 px-1 py-0.5 text-right font-mono text-[9px] leading-none text-muted-foreground shadow-sm backdrop-blur-sm"
              style={{ top: openingGuideTop }}
              aria-hidden="true"
            >
              {openingLabel} {formatCompactPrice(paths.openingPrice, locale)}
            </span>
          )}
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
                  left: `${(hoverPoint.x / geometry.width) * 100}%`,
                  top: `${(hoverPoint.y / geometry.height) * 100}%`,
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

      <div className="grid grid-cols-3 gap-2 pr-[3.75rem] font-mono text-[10px] leading-none text-muted-foreground">
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
  const geometry = WATCHLIST_SPARKLINE_GEOMETRY;
  const rawAreaGradientId = useId();
  const areaGradientId = `watchlist-area-gradient-${rawAreaGradientId.replace(
    /:/g,
    ""
  )}`;
  const paths = useMemo(
    () =>
      buildSparklinePaths(
        bars,
        latestTradePrice,
        latestTradeTimestamp,
        geometry
      ),
    [bars, latestTradePrice, latestTradeTimestamp, geometry]
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
        viewBox={`0 0 ${geometry.width} ${geometry.height}`}
        preserveAspectRatio="none"
        className="h-full w-full overflow-visible"
      >
        <defs>
          <linearGradient
            id={areaGradientId}
            x1="0"
            x2="0"
            y1={geometry.paddingTop}
            y2={geometry.height}
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
            d={`M ${geometry.paddingX} ${geometry.height / 2} L ${
              geometry.width - geometry.paddingX
            } ${geometry.height / 2}`}
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
  openingPrice: number | null;
  openingPriceY: number | null;
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

type SparklineGeometry = {
  width: number;
  height: number;
  paddingX: number;
  paddingTop: number;
  paddingBottom: number;
  maxPoints: number;
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
  latestTradeTimestamp: string | null = null,
  geometry: SparklineGeometry = WATCHLIST_SPARKLINE_GEOMETRY,
  openingGuidePrice: number | null = null
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

  const openingPrice =
    positiveNumber(openingGuidePrice) ??
    openingPriceFromBars(bars, latestMarketDate, sessionDomain);

  const sampledPoints =
    points.length > geometry.maxPoints
      ? sampleSparklinePoints(points, geometry.maxPoints)
      : points;

  let min = sampledPoints[0].value;
  let max = sampledPoints[0].value;
  for (const point of sampledPoints) {
    if (point.value < min) min = point.value;
    if (point.value > max) max = point.value;
  }
  if (openingPrice != null) {
    if (openingPrice < min) min = openingPrice;
    if (openingPrice > max) max = openingPrice;
  }

  let plotMin = min;
  let plotMax = max;
  if (plotMin === plotMax) {
    const padding = Math.max(Math.abs(plotMax) * 0.005, 1);
    plotMin -= padding;
    plotMax += padding;
  }

  const plotWidth = geometry.width - geometry.paddingX * 2;
  const plotHeight = geometry.height - geometry.paddingTop - geometry.paddingBottom;
  const bottom = geometry.height - geometry.paddingBottom;
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
      geometry.paddingX + plotWidth * clampNumber(sessionProgress, 0, 1);
    const y =
      geometry.paddingTop +
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
  const openingPriceY =
    openingPrice != null
      ? geometry.paddingTop +
        plotHeight -
        ((openingPrice - plotMin) / (plotMax - plotMin)) * plotHeight
      : null;
  return {
    line,
    area: `${line} L ${lastX} ${formatSparklineNumber(bottom)} L ${firstX} ${formatSparklineNumber(
      bottom
    )} Z`,
    min,
    max,
    openingPrice,
    openingPriceY,
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

function openingPriceFromBars(
  bars: MarketBar[],
  marketDate: string | null,
  sessionDomain: MarketSessionDomain
): number | null {
  let openingBar: MarketBar | null = null;
  for (const bar of bars) {
    if (marketDate && marketDateKey(bar.timestamp) !== marketDate) continue;
    const timeMs = chartTimeMs(bar.timestamp);
    if (timeMs < sessionDomain.startMs || timeMs > sessionDomain.endMs) continue;
    if (!openingBar || timeMs < chartTimeMs(openingBar.timestamp)) {
      openingBar = bar;
    }
  }

  return positiveNumber(openingBar?.open) ?? positiveNumber(openingBar?.close);
}

function sampleSparklinePoints(
  points: SparklinePoint[],
  maxPoints: number
): SparklinePoint[] {
  const out: SparklinePoint[] = [];
  const step = (points.length - 1) / (maxPoints - 1);
  for (let index = 0; index < maxPoints; index += 1) {
    const sourceIndex =
      index === maxPoints - 1
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

function writeFavoriteSymbols(symbols: string[]) {
  if (typeof window === "undefined") return;

  const normalized = normalizeFavoriteSymbols(symbols);
  window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(normalized));
  window.dispatchEvent(new Event(FAVORITES_CHANGED_EVENT));
}

function measureWatchlistRows(container: HTMLDivElement | null): WatchlistRowRect[] {
  if (!container) return [];
  return Array.from(
    container.querySelectorAll<HTMLButtonElement>("[data-watchlist-symbol]")
  ).map((row) => {
    const rect = row.getBoundingClientRect();
    return {
      top: rect.top,
      bottom: rect.bottom,
    };
  });
}

function watchlistIndexForClientY(clientY: number, rowRects: WatchlistRowRect[]) {
  if (rowRects.length === 0) return -1;
  for (let index = 0; index < rowRects.length; index += 1) {
    const rect = rowRects[index];
    if (clientY < rect.top + (rect.bottom - rect.top) / 2) {
      return index;
    }
  }
  return rowRects.length - 1;
}

function moveSymbol(symbols: string[], fromIndex: number, toIndex: number) {
  if (fromIndex === toIndex) return symbols;
  const next = [...symbols];
  const [symbol] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, symbol);
  return next;
}

function validateOrder(
  symbol: string,
  qty: number,
  orderType: ManualOrderType,
  limitPrice: number,
  stopPrice: number,
  extendedHours: boolean,
  messages: {
    invalidSymbol: string;
    invalidQuantity: string;
    invalidLimitPrice: string;
    invalidStopPrice: string;
    invalidExtendedHours: string;
  }
) {
  if (!SYMBOL_PATTERN.test(symbol)) return messages.invalidSymbol;
  if (!Number.isFinite(qty) || qty <= 0) return messages.invalidQuantity;
  if (extendedHours && orderType !== "limit") return messages.invalidExtendedHours;
  if (
    (orderType === "limit" || orderType === "stop_limit") &&
    (!Number.isFinite(limitPrice) || limitPrice <= 0)
  ) {
    return messages.invalidLimitPrice;
  }
  if (
    (orderType === "stop" || orderType === "stop_limit") &&
    (!Number.isFinite(stopPrice) || stopPrice <= 0)
  ) {
    return messages.invalidStopPrice;
  }
  return null;
}

function estimateDetailText(
  source: "limit" | "stop" | "quote" | "position" | "none",
  referencePrice: number | null,
  quoteLoading: boolean,
  quoteUnavailable: boolean,
  locale: Locale,
  messages: {
    estimateLimitDetail: string;
    estimateStopDetail: string;
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
    if (source === "stop") {
      return messages.estimateStopDetail.replace("{price}", price);
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
