import { OverviewDashboard } from "@/components/overview/overview-dashboard";
import { getServerLocale } from "@/lib/i18n/server";
import { safe } from "@/lib/safe";
import { serverApi as api } from "@/lib/server-api";

export default async function OverviewPage() {
  const locale = await getServerLocale();
  const [health, clock, account, positions, orders, strategyInstances] = await Promise.all([
    safe(api.health()),
    safe(api.marketClock()),
    safe(api.account()),
    safe(api.listPositions()),
    safe(api.listOrders()),
    safe(api.listStrategies()),
  ]);

  const priceHistorySymbols = [...(positions ?? [])]
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

  return (
    <OverviewDashboard
      account={account}
      clock={clock}
      health={health}
      locale={locale}
      orders={orders}
      positions={positions}
      priceHistory={priceHistory}
      priceHistorySymbols={priceHistorySymbols}
      strategyInstances={strategyInstances}
    />
  );
}

