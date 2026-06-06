"use client";

import { Pause, RotateCcw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, Field, WorkbenchPanel } from "@/components/workbench";
import { useI18n } from "@/lib/i18n/client";
import { formatDateTime } from "@/lib/i18n/format";
import type { StrategyInstance } from "@/types";

export function AutomatedTradingInstancesPanel({
  activeCount,
  busyId,
  instances,
  isLive,
  rowLiveText,
  onRowLiveTextChange,
  onSetActive,
}: {
  activeCount: number;
  busyId: number | null;
  instances: StrategyInstance[];
  isLive: boolean;
  rowLiveText: string;
  onRowLiveTextChange: (value: string) => void;
  onSetActive: (instance: StrategyInstance, isActive: boolean) => void;
}) {
  const { locale, t } = useI18n();

  return (
    <WorkbenchPanel
      title={t.automatedTrading.configuredTitle}
      description={`${instances.length} ${t.common.total} · ${activeCount} ${t.automatedTrading.totalActive}`}
      actions={
        <Badge variant={activeCount > 0 ? "default" : "outline"}>
          {activeCount > 0 ? t.enums.automationState.active : t.enums.automationState.idle}
        </Badge>
      }
      className="self-start"
      contentClassName="flex flex-col gap-2"
    >
      {isLive && instances.some((instance) => !instance.is_active) && (
        <Field label={t.automatedTrading.resumeLiveConfirmation}>
          <input
            value={rowLiveText}
            onChange={(event) => onRowLiveTextChange(event.target.value)}
            className="h-9 w-full rounded-lg border bg-background px-3 text-sm font-semibold"
            placeholder="LIVE"
          />
        </Field>
      )}

      {instances.map((instance) => (
        <div key={instance.id} className="rounded-lg border bg-background p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{instance.name}</p>
              <p className="mt-1 font-mono text-xs text-muted-foreground">
                {instance.strategy_key}
              </p>
            </div>
            <Badge variant={instance.is_active ? "default" : "outline"}>
              {instance.is_active ? t.common.on : t.common.off}
            </Badge>
          </div>
          <div className="mt-3 space-y-1 font-mono text-xs text-muted-foreground">
            <p className="truncate">{instance.symbols.join(", ") || t.common.noSymbols}</p>
            <p>{instance.schedule || t.common.noSchedule}</p>
            <p>{t.automatedTrading.last}: {formatDateTime(instance.last_run_at, locale)}</p>
          </div>
          {instance.last_error && (
            <p className="mt-2 line-clamp-2 text-xs text-red-600">{instance.last_error}</p>
          )}
          <div className="mt-3 flex justify-end">
            {instance.is_active ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onSetActive(instance, false)}
                disabled={busyId === instance.id}
              >
                <Pause data-icon="inline-start" />
                {t.automatedTrading.stop}
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onSetActive(instance, true)}
                disabled={busyId === instance.id}
              >
                <RotateCcw data-icon="inline-start" />
                {t.automatedTrading.resume}
              </Button>
            )}
          </div>
        </div>
      ))}

      {instances.length === 0 && (
        <EmptyState className="py-5 text-left">{t.automatedTrading.noStrategiesConfigured}</EmptyState>
      )}
    </WorkbenchPanel>
  );
}

