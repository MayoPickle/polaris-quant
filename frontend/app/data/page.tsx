import { AppShell } from "@/components/app-shell";
import { MarketDataDashboard } from "@/components/market-data-dashboard/market-data-dashboard";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { getServerLocale } from "@/lib/i18n/server";
import { safe } from "@/lib/safe";
import { serverApi as api } from "@/lib/server-api";

export default async function DataPage() {
  const locale = await getServerLocale();
  const t = getDictionary(locale);
  const [jobs, summary] = await Promise.all([
    safe(api.marketDataIngestionJobs({ limit: 50 })),
    safe(api.marketDataCoverageSummary()),
  ]);

  return (
    <AppShell title={t.pages.data.title} subtitle={t.pages.data.subtitle}>
      <MarketDataDashboard initialJobs={jobs ?? []} initialSummary={summary} />
    </AppShell>
  );
}
