import { AppShell } from "@/components/app-shell";
import { AutomatedTrading } from "@/components/automated-trading";
import { BacktestCompare } from "@/components/backtest-compare";
import { BatchBacktest } from "@/components/batch-backtest";
import { StrategyCatalog } from "@/components/strategy-catalog";
import { api } from "@/lib/api";
import { safe } from "@/lib/safe";

export default async function StrategiesPage() {
  const [health, available, instances, universes] = await Promise.all([
    safe(api.health()),
    safe(api.availableStrategies()),
    safe(api.listStrategies()),
    safe(api.backtestUniverses()),
  ]);

  return (
    <AppShell
      title="Strategies"
      subtitle="Strategy research workspace"
    >
      <AutomatedTrading
        strategies={available ?? []}
        instances={instances ?? []}
        health={health}
      />

      <StrategyCatalog strategies={available ?? []} />

      <BatchBacktest strategies={available ?? []} universes={universes ?? []} />

      <details className="group rounded-lg border bg-card">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Compare backtests</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Multiple symbols and parameter sets.
            </p>
          </div>
          <span className="text-sm text-muted-foreground transition-transform group-open:rotate-45">
            +
          </span>
        </summary>
        <div className="border-t p-4">
          <BacktestCompare strategies={available ?? []} />
        </div>
      </details>
    </AppShell>
  );
}
