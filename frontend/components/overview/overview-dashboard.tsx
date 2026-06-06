import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { MetricGrid, MetricTile } from "@/components/workbench";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { formatCurrency, formatPercent } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/config";
import type {
  Account,
  Health,
  MarketBarsResponse,
  MarketClock,
  Order,
  Position,
  StrategyInstance,
} from "@/types";

import { AutomationPanel } from "./automation-panel";
import { OperatingStatusPanel } from "./operating-status-panel";
import { PositionsPanel } from "./positions-panel";
import { PriceHistoryPanel } from "./price-history-panel";
import { RecentOrdersPanel } from "./recent-orders-panel";

export function OverviewDashboard({
  account,
  clock,
  health,
  locale,
  orders,
  positions,
  priceHistory,
  priceHistorySymbols,
  strategyInstances,
}: {
  account: Account | null;
  clock: MarketClock | null;
  health: Health | null;
  locale: Locale;
  orders: Order[] | null;
  positions: Position[] | null;
  priceHistory: MarketBarsResponse | null | undefined;
  priceHistorySymbols: string[];
  strategyInstances: StrategyInstance[] | null;
}) {
  const t = getDictionary(locale);
  const usd = (value: number) => formatCurrency(value, locale);
  const pct = (value: number) => formatPercent(value, locale);
  const positionRows = positions ?? [];
  const orderRows = orders ?? [];
  const totalUnrealized = positionRows.reduce((sum, p) => sum + p.unrealized_pl, 0);
  const grossExposure = positionRows.reduce((sum, p) => sum + p.market_value, 0);
  const exposurePct = account && account.equity > 0 ? (grossExposure / account.equity) * 100 : null;
  const pendingOrders = orderRows.filter(
    (order) => !["filled", "canceled", "rejected"].includes(order.status)
  ).length;
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
        <OperatingStatusPanel
          clock={clock}
          health={health}
          locale={locale}
          pendingOrders={pendingOrders}
        />
        <AutomationPanel locale={locale} strategyInstances={strategyInstances} />
      </div>

      <PriceHistoryPanel
        locale={locale}
        positions={positions}
        priceHistory={priceHistory}
        priceHistorySymbols={priceHistorySymbols}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <PositionsPanel locale={locale} positions={positions} />
        <RecentOrdersPanel locale={locale} orders={orders} />
      </div>
    </AppShell>
  );
}

