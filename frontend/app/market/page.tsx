import { AppShell } from "@/components/app-shell";
import { QuoteLookup } from "@/components/quote-lookup";
import { Badge } from "@/components/ui/badge";
import { MetricGrid, MetricTile, WorkbenchPanel } from "@/components/workbench";
import { api } from "@/lib/api";
import { marketSessionLabel } from "@/lib/i18n/format";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { getServerLocale } from "@/lib/i18n/server";
import { safe } from "@/lib/safe";

export default async function MarketPage() {
  const locale = await getServerLocale();
  const t = getDictionary(locale);
  const clock = await safe(api.marketClock());
  const isOpen = clock?.is_open ?? false;
  const marketState = clock ? marketSessionLabel(isOpen, locale) : t.common.unknown;

  return (
    <AppShell
      title={t.pages.market.title}
      subtitle={t.pages.market.subtitle}
      actions={
        <Badge variant={isOpen ? "default" : "secondary"}>
          {t.pages.market.badgePrefix} {marketState}
        </Badge>
      }
    >
      <MetricGrid className="sm:grid-cols-3 xl:grid-cols-3">
        <MetricTile
          label={t.pages.market.market}
          value={marketState}
          detail={t.pages.market.usEasternTime}
          tone={isOpen ? "positive" : "neutral"}
        />
        <MetricTile
          label={t.pages.market.dataSource}
          value="Alpaca"
          detail={t.pages.market.dataSourceDetail}
          tone="info"
        />
        <MetricTile
          label={t.pages.market.lookup}
          value={t.pages.market.onDemand}
          detail={t.pages.market.lookupDetail}
        />
      </MetricGrid>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.72fr)_minmax(18rem,0.28fr)]">
        <QuoteLookup />
        <WorkbenchPanel
          title={t.pages.market.statusTitle}
          description={t.pages.market.statusDescription}
        >
          <div className="flex flex-col gap-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">{t.pages.market.session}</span>
              <Badge variant={isOpen ? "default" : "secondary"}>
                {marketState}
              </Badge>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">{t.pages.market.timezone}</span>
              <span className="font-medium">{t.pages.market.usEasternTime}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">{t.pages.market.provider}</span>
              <span className="font-medium">Alpaca</span>
            </div>
          </div>
        </WorkbenchPanel>
      </div>
    </AppShell>
  );
}
