import { AppShell } from "@/components/app-shell";
import { QuoteLookup } from "@/components/quote-lookup";
import { Badge } from "@/components/ui/badge";
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
      <div className="w-full max-w-xl">
        <QuoteLookup />
      </div>
    </AppShell>
  );
}
