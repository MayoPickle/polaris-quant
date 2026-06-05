import { AppShell } from "@/components/app-shell";
import { PositionPriceHistoryChart } from "@/components/position-price-history-chart";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  EmptyState,
  MetricGrid,
  MetricTile,
  StatusDot,
  WorkbenchPanel,
} from "@/components/workbench";
import { api } from "@/lib/api";
import {
  brokerEnvLabel,
  formatCurrency,
  formatDateTime,
  formatPercent,
  marketSessionLabel,
  orderSideLabel,
  orderStatusLabel,
  orderTypeLabel,
} from "@/lib/i18n/format";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { getServerLocale } from "@/lib/i18n/server";
import { safe } from "@/lib/safe";
import type { Order, Position, StrategyInstance } from "@/types";

function orderStatusVariant(
  status: string
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "filled") return "default";
  if (status === "rejected" || status === "canceled") return "destructive";
  if (status === "partially_filled") return "secondary";
  return "outline";
}

export default async function OverviewPage() {
  const locale = await getServerLocale();
  const t = getDictionary(locale);
  const usd = (value: number) => formatCurrency(value, locale);
  const pct = (value: number) => formatPercent(value, locale);
  const [health, clock, account, positions, orders, strategyInstances] = await Promise.all([
    safe(api.health()),
    safe(api.marketClock()),
    safe(api.account()),
    safe(api.listPositions()),
    safe(api.listOrders()),
    safe(api.listStrategies()),
  ]);

  const positionRows = positions ?? [];
  const orderRows = orders ?? [];
  const strategyRows = strategyInstances ?? [];
  const activeStrategies = strategyRows.filter((strategy) => strategy.is_active);
  const erroredStrategies = strategyRows.filter((strategy) => strategy.last_error);
  const recentOrders = orderRows.slice(0, 6);
  const totalUnrealized = positionRows.reduce((sum, p) => sum + p.unrealized_pl, 0);
  const grossExposure = positionRows.reduce((sum, p) => sum + p.market_value, 0);
  const exposurePct = account && account.equity > 0 ? (grossExposure / account.equity) * 100 : null;
  const pendingOrders = orderRows.filter(
    (order) => !["filled", "canceled", "rejected"].includes(order.status)
  ).length;
  const priceHistorySymbols = [...positionRows]
    .sort((a, b) => b.market_value - a.market_value)
    .slice(0, 5)
    .map((position) => position.symbol);
  const priceHistory =
    priceHistorySymbols.length > 0
      ? await safe(
          api.marketBars(priceHistorySymbols, {
            timeframe: "1Day",
            lookback_days: 90,
          })
        )
      : undefined;

  const accountStats = [
    {
      label: t.pages.overview.equity,
      value: account ? usd(account.equity) : "—",
      tone: "neutral",
      detail: account
        ? `${usd(account.cash)} ${t.pages.overview.equityDetail}`
        : t.pages.overview.accountUnavailable,
    },
    {
      label: t.pages.overview.buyingPower,
      value: account ? usd(account.buying_power) : "—",
      tone: "info",
      detail: t.pages.overview.buyingPowerDetail,
    },
    {
      label: t.pages.overview.exposure,
      value: exposurePct == null ? "—" : pct(exposurePct),
      tone: exposurePct != null && exposurePct > 80 ? "warning" : "neutral",
      detail: `${usd(grossExposure)} ${t.pages.overview.exposureDetail}`,
    },
    {
      label: t.pages.overview.unrealizedPl,
      value: positions ? usd(totalUnrealized) : "—",
      tone: totalUnrealized > 0 ? "positive" : totalUnrealized < 0 ? "negative" : "neutral",
      detail: `${positionRows.length} ${t.common.openPositions}`,
    },
  ] as const;

  const operatingStatus = [
    {
      label: t.pages.overview.market,
      value: marketSessionLabel(clock?.is_open, locale),
      detail: t.pages.overview.marketDetail,
      tone: clock?.is_open ? "positive" : "neutral",
    },
    {
      label: t.pages.overview.tradingGuard,
      value: health?.trading_enabled ? t.common.enabled : t.common.disabled,
      detail: t.pages.overview.tradingGuardDetail,
      tone: health?.trading_enabled ? "positive" : "warning",
    },
    {
      label: t.pages.overview.broker,
      value: brokerEnvLabel(health?.broker_env, locale),
      detail: health?.env ?? t.common.apiOffline,
      tone: "neutral",
    },
    {
      label: t.pages.overview.sizing,
      value: health?.openai_sizing_enabled
        ? health.position_model
        : `${health?.default_position_allocation_pct ?? 1}% ${t.pages.overview.preset}`,
      detail: health?.openai_sizing_enabled
        ? t.pages.overview.sizingOpenAi
        : t.pages.overview.sizingFallback,
      tone: health?.openai_sizing_enabled ? "info" : "neutral",
    },
  ] as const;

  return (
    <AppShell
      title={t.pages.overview.title}
      subtitle={health ? t.pages.overview.subtitle : t.common.backendUnreachable}
      actions={
        <Badge variant={health ? "default" : "destructive"}>
          {health ? t.common.apiOnline : t.common.apiOffline}
        </Badge>
      }
    >
      <MetricGrid>
        {accountStats.map((s) => (
          <MetricTile
            key={s.label}
            label={s.label}
            value={s.value}
            detail={s.detail}
            tone={s.tone}
          />
        ))}
      </MetricGrid>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_23rem]">
        <WorkbenchPanel
          title={t.pages.overview.operatingTitle}
          description={t.pages.overview.operatingDescription}
          actions={<Badge variant={pendingOrders > 0 ? "secondary" : "outline"}>{pendingOrders} {t.common.pending}</Badge>}
        >
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {operatingStatus.map((item) => (
              <div key={item.label} className="min-w-0 rounded-md border bg-background p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-xs font-medium text-muted-foreground">{item.label}</p>
                  <StatusDot tone={item.tone} />
                </div>
                <p className="mt-2 truncate text-sm font-semibold">{item.value}</p>
                <p className="mt-1 truncate text-xs text-muted-foreground">{item.detail}</p>
              </div>
            ))}
          </div>
        </WorkbenchPanel>

        <WorkbenchPanel
          title={t.pages.overview.automationTitle}
          description={`${activeStrategies.length} ${t.common.active} · ${strategyRows.length} ${t.common.configured}`}
          actions={
            <Badge variant={erroredStrategies.length > 0 ? "destructive" : activeStrategies.length > 0 ? "default" : "outline"}>
              {erroredStrategies.length > 0
                ? t.enums.automationState.errors
                : activeStrategies.length > 0
                  ? t.enums.automationState.active
                  : t.enums.automationState.idle}
            </Badge>
          }
          className="self-start"
          contentClassName="flex flex-col gap-2"
        >
          {activeStrategies.slice(0, 4).map((strategy: StrategyInstance) => (
            <div key={strategy.id} className="rounded-md border bg-background p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{strategy.name}</p>
                  <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                    {strategy.strategy_key}
                  </p>
                </div>
                <Badge variant="default">{t.common.on}</Badge>
              </div>
              <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                <p className="truncate">{strategy.symbols.join(", ") || t.common.noSymbols}</p>
                <p className="truncate font-mono">{strategy.schedule || t.common.noSchedule}</p>
                <p>{t.pages.overview.lastRun}: {formatDateTime(strategy.last_run_at, locale)}</p>
              </div>
              {strategy.last_error && (
                <p className="mt-2 line-clamp-2 text-xs text-red-600">{strategy.last_error}</p>
              )}
            </div>
          ))}
          {activeStrategies.length > 4 && (
            <p className="px-1 text-xs text-muted-foreground">
              +{activeStrategies.length - 4}{t.common.moreActiveStrategies}
            </p>
          )}
          {strategyInstances === null && <EmptyState className="py-5">{t.pages.overview.automationLoadError}</EmptyState>}
          {strategyInstances !== null && activeStrategies.length === 0 && (
            <EmptyState className="py-5">{t.pages.overview.noActiveStrategies}</EmptyState>
          )}
        </WorkbenchPanel>
      </div>

      <WorkbenchPanel
        title={t.pages.overview.priceHistoryTitle}
        description={t.pages.overview.priceHistoryDescription}
        actions={
          <Badge
            variant={
              priceHistory === null && priceHistorySymbols.length > 0
                ? "destructive"
                : "outline"
            }
          >
            {priceHistory
              ? `${priceHistory.series.length} ${t.common.symbols}`
              : priceHistorySymbols.length > 0
                ? t.common.unavailable
                : t.common.noPositions}
          </Badge>
        }
      >
        {priceHistory ? (
          <PositionPriceHistoryChart series={priceHistory.series} />
        ) : (
          <EmptyState>
            {priceHistorySymbols.length > 0
              ? t.pages.overview.couldNotLoadPriceHistory
              : positions === null
                ? t.pages.overview.couldNotLoadPositions
                : t.pages.overview.noOpenPositionsToChart}
          </EmptyState>
        )}
      </WorkbenchPanel>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <WorkbenchPanel
          title={t.pages.overview.openPositionsTitle}
          description={t.pages.overview.openPositionsDescription}
          actions={<Badge variant="outline">{positionRows.length} {t.common.symbols}</Badge>}
          contentClassName="p-0"
        >
          <div className="md:hidden">
            {positionRows.map((p: Position) => (
              <div key={p.symbol} className="border-b p-4 last:border-b-0">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{p.symbol}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.common.qty} {p.qty} · {t.common.avg} {usd(p.avg_entry_price)}
                    </p>
                  </div>
                  <p
                    className={`text-sm font-semibold ${
                      p.unrealized_pl >= 0 ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {usd(p.unrealized_pl)}
                  </p>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{t.common.marketValue}</span>
                  <span className="font-medium">{usd(p.market_value)}</span>
                </div>
              </div>
            ))}
            {(!positions || positions.length === 0) && (
              <div className="p-4">
                <EmptyState>
                  {positions === null
                    ? t.pages.overview.couldNotLoadPositions
                    : t.common.noPositions}
                </EmptyState>
              </div>
            )}
          </div>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.batchBacktest.symbol}</TableHead>
                  <TableHead className="text-right">{t.common.qty}</TableHead>
                  <TableHead className="text-right">{t.common.avgPrice}</TableHead>
                  <TableHead className="text-right">{t.common.marketValue}</TableHead>
                  <TableHead className="text-right">{t.pages.overview.unrealizedPl}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {positionRows.map((p: Position) => (
                  <TableRow key={p.symbol}>
                    <TableCell className="font-medium">{p.symbol}</TableCell>
                    <TableCell className="text-right">{p.qty}</TableCell>
                    <TableCell className="text-right">
                      {usd(p.avg_entry_price)}
                    </TableCell>
                    <TableCell className="text-right">
                      {usd(p.market_value)}
                    </TableCell>
                    <TableCell
                      className={`text-right ${
                        p.unrealized_pl >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {usd(p.unrealized_pl)}
                    </TableCell>
                  </TableRow>
                ))}
                {(!positions || positions.length === 0) && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="py-8 text-center text-muted-foreground"
                    >
                      {positions === null
                        ? t.pages.overview.couldNotLoadPositions
                        : t.common.noPositions}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </WorkbenchPanel>

        <WorkbenchPanel
          title={t.pages.overview.recentOrdersTitle}
          description={t.pages.overview.recentOrdersDescription}
          actions={<Badge variant="outline">{orderRows.length} {t.common.orders}</Badge>}
          contentClassName="p-0"
        >
          <div className="md:hidden">
            {recentOrders.map((order: Order) => (
              <div key={order.id} className="border-b p-4 last:border-b-0">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{order.symbol}</p>
                    <p className="text-xs text-muted-foreground">
                      {orderTypeLabel(order.order_type, locale)} · {t.common.qty} {order.qty} · {t.common.filled} {order.filled_qty}
                    </p>
                  </div>
                  <Badge variant={orderStatusVariant(order.status)}>
                    {orderStatusLabel(order.status, locale)}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className={order.side === "buy" ? "text-green-600" : "text-red-600"}>
                    {orderSideLabel(order.side, locale)}
                  </span>
                  <span className="font-medium">
                    {order.filled_avg_price != null
                      ? `${usd(order.filled_avg_price)} ${t.common.avg}`
                      : t.common.noFillPrice}
                  </span>
                </div>
              </div>
            ))}
            {(!orders || orders.length === 0) && (
              <div className="p-4">
                <EmptyState>
                  {orders === null ? t.pages.overview.couldNotLoadOrders : t.common.noOrders}
                </EmptyState>
              </div>
            )}
          </div>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.batchBacktest.symbol}</TableHead>
                  <TableHead>{t.common.side}</TableHead>
                  <TableHead>{t.common.type}</TableHead>
                  <TableHead className="text-right">{t.common.qty}</TableHead>
                  <TableHead className="text-right">{t.common.filled}</TableHead>
                  <TableHead className="text-right">{t.batchBacktest.status}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentOrders.map((order: Order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium">{order.symbol}</TableCell>
                    <TableCell>
                      <span className={order.side === "buy" ? "text-green-600" : "text-red-600"}>
                        {orderSideLabel(order.side, locale)}
                      </span>
                    </TableCell>
                    <TableCell>{orderTypeLabel(order.order_type, locale)}</TableCell>
                    <TableCell className="text-right">{order.qty}</TableCell>
                    <TableCell className="text-right">{order.filled_qty}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={orderStatusVariant(order.status)}>
                        {orderStatusLabel(order.status, locale)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {(!orders || orders.length === 0) && (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="py-8 text-center text-muted-foreground"
                    >
                      {orders === null ? t.pages.overview.couldNotLoadOrders : t.common.noOrders}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </WorkbenchPanel>
      </div>
    </AppShell>
  );
}
