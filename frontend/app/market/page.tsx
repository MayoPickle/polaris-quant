import { AppShell } from "@/components/app-shell";
import { MarketDashboard } from "@/components/market/market-dashboard";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { getServerLocale } from "@/lib/i18n/server";
import { safe } from "@/lib/safe";
import { serverApi as api } from "@/lib/server-api";

const DEFAULT_SYMBOL = "AAPL";
const DEFAULT_FAVORITES: string[] = [];

export default async function MarketPage() {
  const locale = await getServerLocale();
  const t = getDictionary(locale);
  const [snapshots, bars] = await Promise.all([
    safe(api.marketSnapshots([DEFAULT_SYMBOL])),
    safe(
      api.marketBars([DEFAULT_SYMBOL], {
        timeframe: "1Min",
        lookback_days: 1,
      })
    ),
  ]);

  return (
    <AppShell
      title={t.pages.market.title}
      subtitle={t.pages.market.subtitle}
    >
      <MarketDashboard
        initialSnapshots={snapshots}
        initialBars={bars}
        initialFavoriteSymbols={DEFAULT_FAVORITES}
        initialSymbol={DEFAULT_SYMBOL}
      />
    </AppShell>
  );
}
