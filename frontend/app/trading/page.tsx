import { AppShell } from "@/components/app-shell";
import { ManualTradingForm } from "@/components/manual-trading-form";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { getServerLocale } from "@/lib/i18n/server";
import { safe } from "@/lib/safe";
import { serverApi as api } from "@/lib/server-api";

export default async function TradingPage() {
  const locale = await getServerLocale();
  const t = getDictionary(locale);
  const [account, health, positions] = await Promise.all([
    safe(api.account()),
    safe(api.health()),
    safe(api.listPositions()),
  ]);

  return (
    <AppShell title={t.pages.trading.title} subtitle={t.pages.trading.subtitle}>
      <ManualTradingForm account={account} health={health} positions={positions} />
    </AppShell>
  );
}
