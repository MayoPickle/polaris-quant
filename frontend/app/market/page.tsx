import { AppShell } from "@/components/app-shell";
import { QuoteLookup } from "@/components/quote-lookup";
import { Badge } from "@/components/ui/badge";
import { MetricGrid, MetricTile, WorkbenchPanel } from "@/components/workbench";
import { api } from "@/lib/api";
import { safe } from "@/lib/safe";

export default async function MarketPage() {
  const clock = await safe(api.marketClock());
  const isOpen = clock?.is_open ?? false;

  return (
    <AppShell
      title="Market"
      subtitle="Market status and quotes (Alpaca, US Eastern time)"
      actions={
        <Badge variant={isOpen ? "default" : "secondary"}>
          Market {clock ? (isOpen ? "Open" : "Closed") : "Unknown"}
        </Badge>
      }
    >
      <MetricGrid className="sm:grid-cols-3 xl:grid-cols-3">
        <MetricTile
          label="Market"
          value={clock ? (isOpen ? "Open" : "Closed") : "Unknown"}
          detail="US Eastern time"
          tone={isOpen ? "positive" : "neutral"}
        />
        <MetricTile
          label="Data source"
          value="Alpaca"
          detail="Quote and clock endpoints"
          tone="info"
        />
        <MetricTile
          label="Lookup"
          value="On demand"
          detail="Enter a symbol below"
        />
      </MetricGrid>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.72fr)_minmax(18rem,0.28fr)]">
        <QuoteLookup />
        <WorkbenchPanel
          title="Market status"
          description="Use this page for quick symbol checks before strategy runs or manual orders."
        >
          <div className="flex flex-col gap-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Session</span>
              <Badge variant={isOpen ? "default" : "secondary"}>
                {clock ? (isOpen ? "Open" : "Closed") : "Unknown"}
              </Badge>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Timezone</span>
              <span className="font-medium">US Eastern</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Provider</span>
              <span className="font-medium">Alpaca</span>
            </div>
          </div>
        </WorkbenchPanel>
      </div>
    </AppShell>
  );
}
