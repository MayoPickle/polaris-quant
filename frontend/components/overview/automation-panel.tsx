import { Badge } from "@/components/ui/badge";
import { EmptyState, WorkbenchPanel } from "@/components/workbench";
import { formatDateTime } from "@/lib/i18n/format";
import { getDictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import type { StrategyInstance } from "@/types";

export function AutomationPanel({
  locale,
  strategyInstances,
}: {
  locale: Locale;
  strategyInstances: StrategyInstance[] | null;
}) {
  const t = getDictionary(locale);
  const strategyRows = strategyInstances ?? [];
  const activeStrategies = strategyRows.filter((strategy) => strategy.is_active);
  const erroredStrategies = strategyRows.filter((strategy) => strategy.last_error);

  return (
    <WorkbenchPanel
      title={t.pages.overview.automationTitle}
      description={`${activeStrategies.length} ${t.common.active} · ${strategyRows.length} ${t.common.configured}`}
      actions={
        <Badge variant={erroredStrategies.length > 0 ? "destructive" : activeStrategies.length > 0 ? "default" : "outline"}>
          {erroredStrategies.length > 0
            ? t.enums.automationState.errors
            : activeStrategies.length > 0
              ? t.enums.automationState.active
              : t.enums.automationState.idle}
        </Badge>
      }
      className="self-start"
      contentClassName="flex flex-col gap-2"
    >
      {activeStrategies.slice(0, 4).map((strategy) => (
        <div key={strategy.id} className="rounded-md border bg-background p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{strategy.name}</p>
              <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                {strategy.strategy_key}
              </p>
            </div>
            <Badge variant="default">{t.common.on}</Badge>
          </div>
          <div className="mt-3 space-y-1 text-xs text-muted-foreground">
            <p className="truncate">{strategy.symbols.join(", ") || t.common.noSymbols}</p>
            <p className="truncate font-mono">{strategy.schedule || t.common.noSchedule}</p>
            <p>{t.pages.overview.lastRun}: {formatDateTime(strategy.last_run_at, locale)}</p>
          </div>
          {strategy.last_error && (
            <p className="mt-2 line-clamp-2 text-xs text-red-600">{strategy.last_error}</p>
          )}
        </div>
      ))}
      {activeStrategies.length > 4 && (
        <p className="px-1 text-xs text-muted-foreground">
          +{activeStrategies.length - 4}{t.common.moreActiveStrategies}
        </p>
      )}
      {strategyInstances === null && <EmptyState className="py-5">{t.pages.overview.automationLoadError}</EmptyState>}
      {strategyInstances !== null && activeStrategies.length === 0 && (
        <EmptyState className="py-5">{t.pages.overview.noActiveStrategies}</EmptyState>
      )}
    </WorkbenchPanel>
  );
}

