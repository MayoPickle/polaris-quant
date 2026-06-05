import { AppShell } from "@/components/app-shell";
import { AutomatedTrading } from "@/components/automated-trading";
import { BacktestCompare } from "@/components/backtest-compare";
import { BatchBacktest } from "@/components/batch-backtest";
import { StrategyCatalog } from "@/components/strategy-catalog";
import { api } from "@/lib/api";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { getServerLocale } from "@/lib/i18n/server";
import { safe } from "@/lib/safe";

export default async function StrategiesPage() {
  const locale = await getServerLocale();
  const t = getDictionary(locale);
  const [health, available, instances, universes] = await Promise.all([
    safe(api.health()),
    safe(api.availableStrategies(locale)),
    safe(api.listStrategies()),
    safe(api.backtestUniverses(locale)),
  ]);

  return (
    <AppShell
      title={t.pages.strategies.title}
      subtitle={t.pages.strategies.subtitle}
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
            <h2 className="text-sm font-semibold">{t.pages.strategies.compareTitle}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {t.pages.strategies.compareDescription}
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
