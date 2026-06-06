"use client";

import { Pause, Play } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState, WorkbenchPanel } from "@/components/workbench";
import { useI18n } from "@/lib/i18n/client";
import { formatDateTime, ingestionKindLabel, ingestionStatusLabel } from "@/lib/i18n/format";
import type { MarketDataIngestionJob } from "@/types";

import { formatNumber, progressPct, statusVariant } from "./utils";

export function MarketDataJobsTable({
  jobs,
  loading,
  onPause,
  onResume,
}: {
  jobs: MarketDataIngestionJob[];
  loading: boolean;
  onPause: (jobId: string) => Promise<void>;
  onResume: (jobId: string) => Promise<void>;
}) {
  const { locale, t } = useI18n();

  return (
    <WorkbenchPanel
      title={t.marketData.jobsTitle}
      description={t.marketData.jobsDescription}
      contentClassName="p-0"
    >
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t.marketData.jobKind}</TableHead>
              <TableHead>{t.batchBacktest.status}</TableHead>
              <TableHead>{t.marketData.progress}</TableHead>
              <TableHead>{t.marketData.targetRange}</TableHead>
              <TableHead>{t.marketData.cursor}</TableHead>
              <TableHead className="text-right">{t.marketData.rowCounts}</TableHead>
              <TableHead className="text-right">{t.marketData.actions}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.map((job) => (
              <TableRow key={job.id}>
                <TableCell>
                  <div className="flex min-w-36 flex-col gap-1">
                    <span className="font-medium">{ingestionKindLabel(job.kind, locale)}</span>
                    <span className="text-xs text-muted-foreground">
                      {job.provider}/{job.feed}/{job.timeframe}/{job.adjustment}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={statusVariant(job.status)}>
                    {ingestionStatusLabel(job.status, locale)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="min-w-40">
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-[width]"
                        style={{ width: `${progressPct(job)}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {progressPct(job)}% · {job.completed_work_units}/{job.total_work_units}{" "}
                      {t.marketData.workUnits}
                    </p>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="min-w-44 text-xs">
                    <p>{formatDateTime(job.start_ts, locale)}</p>
                    <p className="text-muted-foreground">{formatDateTime(job.end_ts, locale)}</p>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="min-w-52">
                    <p className="truncate text-xs">{job.cursor ?? job.id}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {job.error ?? `${job.completed_symbols}/${job.total_symbols} ${t.common.symbols}`}
                    </p>
                  </div>
                </TableCell>
                <TableCell className="text-right text-xs">
                  {formatNumber(job.inserted_rows, locale)}/
                  {formatNumber(job.requested_rows, locale)}
                </TableCell>
                <TableCell className="text-right">
                  {job.status === "paused" ? (
                    <Button size="sm" variant="outline" disabled={loading} onClick={() => onResume(job.id)}>
                      <Play data-icon="inline-start" />
                      {t.marketData.resume}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={loading || !["queued", "running"].includes(job.status)}
                      onClick={() => onPause(job.id)}
                    >
                      <Pause data-icon="inline-start" />
                      {t.marketData.pause}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {jobs.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="p-4">
                  <EmptyState>{t.marketData.noJobs}</EmptyState>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </WorkbenchPanel>
  );
}
