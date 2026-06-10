"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { CircleCheck, History, Send } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, MetricGrid, MetricTile, WorkbenchPanel } from "@/components/workbench";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n/client";
import type { Locale } from "@/lib/i18n/config";
import {
  brokerEnvLabel,
  formatCurrency,
  orderSideLabel,
  orderSessionLabel,
  orderStatusLabel,
  orderTypeLabel,
} from "@/lib/i18n/format";
import type { Account, Health, Order, OrderSide, OrderType, Position, Quote } from "@/types";

type ManualOrderType = Extract<OrderType, "market" | "limit">;

const SYMBOL_PATTERN = /^[A-Z][A-Z0-9.]{0,15}$/;

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
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}
