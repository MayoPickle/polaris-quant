"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { MetricGrid, MetricTile } from "@/components/workbench";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n/client";
import {
  formatDateTime,
  ingestionKindLabel,
  ingestionStatusLabel,
} from "@/lib/i18n/format";
import type {
  MarketDataCoverage,
  MarketDataCoverageSummary,
  MarketDataIngestionJob,
  MarketDataIngestionJobCreate,
} from "@/types";
import { cn } from "@/lib/utils";

import { MarketDataControlPanel } from "./control-panel";
import { MarketDataCoveragePanel } from "./coverage-panel";
import { MarketDataJobsTable } from "./jobs-table";
import { activeJob, formatNumber, statusVariant } from "./utils";

const EMPTY_SUMMARY: MarketDataCoverageSummary = {
  coverage_count: 0,
  symbols: 0,
  row_count: 0,
  market_bar_rows: 0,
  first_ts: null,
  last_ts: null,
};

type FeedbackMessage = {
  tone: "success" | "error";
  text: string;
};

export function MarketDataDashboard({
  initialJobs,
  initialSummary,
}: {
  initialJobs: MarketDataIngestionJob[];
  initialSummary: MarketDataCoverageSummary | null;
}) {
  const { locale, t } = useI18n();
  const [jobs, setJobs] = useState(initialJobs);
  const [summary, setSummary] = useState(initialSummary ?? EMPTY_SUMMARY);
  const [coverage, setCoverage] = useState<MarketDataCoverage[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<FeedbackMessage | null>(null);

  const latestBackfill = useMemo(
    () => jobs.find((job) => job.kind === "backfill") ?? null,
    [jobs]
  );
  const latestDaily = useMemo(
    () => jobs.find((job) => job.kind === "daily_sync") ?? null,
    [jobs]
  );

  const refresh = useCallback(async () => {
    const [nextJobs, nextSummary] = await Promise.all([
      api.marketDataIngestionJobs({ limit: 50 }),
      api.marketDataCoverageSummary(),
    ]);
    setJobs(nextJobs);
    setSummary(nextSummary);
  }, []);

  useEffect(() => {
    if (!jobs.some(activeJob)) return;
    const timer = window.setInterval(() => {
      void refresh();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [jobs, refresh]);

  async function runAction(action: () => Promise<void>) {
    setLoading(true);
    setMessage(null);
    try {
      await action();
      await refresh();
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : String(error) });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 md:gap-5">
      <MetricGrid className="sm:grid-cols-2 xl:grid-cols-4">
        <JobMetric label={t.marketData.initStatus} job={latestBackfill} />
        <JobMetric label={t.marketData.dailyStatus} job={latestDaily} />
        <MetricTile
          label={t.marketData.cachedSymbols}
          value={formatNumber(summary.symbols, locale)}
          detail={`${formatNumber(summary.coverage_count, locale)} ${t.marketData.coverageKeys}`}
          tone="info"
        />
        <MetricTile
          label={t.marketData.cachedRows}
          value={formatNumber(summary.market_bar_rows || summary.row_count, locale)}
          detail={
            summary.first_ts && summary.last_ts
              ? `${formatDateTime(summary.first_ts, locale)} - ${formatDateTime(summary.last_ts, locale)}`
              : t.marketData.noCoverage
          }
          tone={summary.market_bar_rows > 0 ? "positive" : "neutral"}
        />
      </MetricGrid>

      {message && (
        <div
          className={cn(
            "rounded-lg border px-3 py-2 text-sm",
            message.tone === "success"
              ? "border-green-600/30 bg-green-600/10 text-green-700"
              : "border-destructive/30 bg-destructive/10 text-destructive"
          )}
        >
          {message.text}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.54fr)_minmax(22rem,0.46fr)]">
        <MarketDataControlPanel
          loading={loading}
          onRefreshAssets={() =>
            runAction(async () => {
              const result = await api.marketDataRefreshAssets();
              setMessage({
                tone: "success",
                text: `${t.marketData.assetRefreshSuccess}: ${formatNumber(result.refreshed, locale)}`,
              });
            })
          }
          onCreate={(payload: MarketDataIngestionJobCreate) =>
            runAction(async () => {
              await api.marketDataCreateIngestionJob(payload);
            })
          }
        />
        <MarketDataCoveragePanel
          rows={coverage}
          loading={loading}
          onSearch={(symbol) =>
            runAction(async () => {
              setCoverage(await api.marketDataCoverage(symbol));
            })
          }
        />
      </div>

      <MarketDataJobsTable
        jobs={jobs}
        loading={loading}
        onPause={(jobId) =>
          runAction(async () => {
            await api.marketDataPauseIngestionJob(jobId);
          })
        }
        onResume={(jobId) =>
          runAction(async () => {
            await api.marketDataResumeIngestionJob(jobId);
          })
        }
        onCancel={(jobId) =>
          runAction(async () => {
            await api.marketDataCancelIngestionJob(jobId);
          })
        }
        onDelete={(jobId) =>
          runAction(async () => {
            await api.marketDataDeleteIngestionJob(jobId);
          })
        }
      />
    </div>
  );
}

function JobMetric({
  label,
  job,
}: {
  label: string;
  job: MarketDataIngestionJob | null;
}) {
  const { locale, t } = useI18n();
  if (!job) {
    return <MetricTile label={label} value={t.marketData.none} detail={t.marketData.latest} />;
  }
  return (
    <MetricTile
      label={label}
      value={
        <span className="inline-flex min-w-0 items-center gap-2">
          <span className="truncate">{ingestionStatusLabel(job.status, locale)}</span>
          <Badge variant={statusVariant(job.status)}>{ingestionKindLabel(job.kind, locale)}</Badge>
        </span>
      }
      detail={job.cursor ?? formatDateTime(job.updated_at, locale)}
      tone={job.status === "failed" ? "negative" : activeJob(job) ? "info" : "neutral"}
    />
  );
}
