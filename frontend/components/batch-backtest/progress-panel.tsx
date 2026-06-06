"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/client";
import { batchStatusLabel, positionSizingMethodLabel } from "@/lib/i18n/format";
import type { BatchBacktestJob, PositionSizingConfig } from "@/types";

import { Metric } from "./metric-blocks";

export function ProgressPanel({
  job,
  positionSizing,
  progress,
  reportLoaded,
  onLoadReport,
}: {
  job: BatchBacktestJob | null;
  positionSizing: PositionSizingConfig;
  progress: number;
  reportLoaded: boolean;
  onLoadReport: () => void;
}) {
  const { locale, t } = useI18n();

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">{t.batchBacktest.progressTitle}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {job ? job.id : t.batchBacktest.noBatchRunning}
          </p>
        </div>
        {job?.current_symbol && (
          <Badge variant="outline">{job.current_symbol}</Badge>
        )}
      </div>

      <div className="mt-4 h-3 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${progress}%` }}
        />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <Metric label={t.batchBacktest.progress} value={`${progress}%`} />
        <Metric label={t.common.total} value={String(job?.total_symbols ?? 0)} />
        <Metric label={t.batchBacktest.completed} value={String(job?.completed_symbols ?? 0)} />
        <Metric label={t.batchBacktest.succeeded} value={String(job?.succeeded_symbols ?? 0)} />
        <Metric label={t.batchBacktest.failed} value={String(job?.failed_symbols ?? 0)} />
        <Metric label={t.batchBacktest.status} value={batchStatusLabel(job?.status, locale)} />
        <Metric
          label={t.positionSizing.model}
          value={
            job
              ? positionSizingMethodLabel(job.position_sizing.method, locale)
              : positionSizingMethodLabel(positionSizing.method, locale)
          }
        />
        <Metric
          label={t.batchBacktest.positionSizeShort}
          value={job ? `${job.position_size_pct.toFixed(0)}%` : "0%"}
        />
      </dl>

      {job?.status === "completed" && !reportLoaded && (
        <Button className="mt-4 w-full" onClick={onLoadReport}>
          {t.batchBacktest.loadReport}
        </Button>
      )}
      {job?.error && (
        <p className="mt-4 text-sm text-destructive">{job.error}</p>
      )}
    </div>
  );
}

