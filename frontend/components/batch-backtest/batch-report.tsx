"use client";

import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n/client";
import { batchStatusLabel, formatCurrency, positionSizingMethodLabel } from "@/lib/i18n/format";
import type { BatchBacktestReport } from "@/types";

import { AggregateMetricsDialog } from "./aggregate-metrics-dialog";
import { FailuresList } from "./failures-list";
import { num, pct, toneFor } from "./formatting";
import { MetricBox, SymbolCard } from "./metric-blocks";
import { BatchReportCharts } from "./report-charts";
import { ResultsTable } from "./results-table";
import { aggregateMetrics } from "./summary-utils";

export function BatchReport({ report }: { report: BatchBacktestReport }) {
  const { locale, t } = useI18n();
  const usd = (n: number) =>
    formatCurrency(n, locale, { maximumFractionDigits: 0 });
  const completed = report.results.filter((r) => r.status === "completed");
  const failed = report.results.filter((r) => r.status === "failed");
  const sorted = [...completed].sort(
    (a, b) => (b.total_return_pct ?? -Infinity) - (a.total_return_pct ?? -Infinity)
  );
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const medianSymbol = report.summary.representative_symbols?.median;
  const medianResult = completed.find((r) => r.symbol === medianSymbol);
  const aggregate = aggregateMetrics(report, completed, failed);
  const reportMeta = `${report.job.strategy_key} · ${report.job.timeframe} · ${report.job.lookback_days} days · ${usd(report.job.initial_capital)} · ${positionSizingMethodLabel(report.job.position_sizing.method, locale)} · ${report.job.position_size_pct.toFixed(0)}%`;

  return (
    <section data-testid="batch-report" className="flex min-w-0 flex-col gap-5 border-t pt-5">
      <div className="rounded-lg border bg-muted/20 p-4 md:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h3 className="text-base font-semibold">{t.batchBacktest.reportTitle}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {reportMeta}
            </p>
          </div>
          <Badge variant={report.job.status === "completed" ? "default" : "secondary"}>
            {batchStatusLabel(report.job.status, locale)}
          </Badge>
        </div>

        <AggregateMetricsDialog
          aggregate={aggregate}
          failedCount={failed.length}
          reportMeta={reportMeta}
          totalSymbols={report.job.total_symbols}
        />

        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricBox
            label={t.batchBacktest.coverage}
            value={`${completed.length}/${report.job.total_symbols}`}
            detail={`${failed.length} ${t.batchBacktest.failed}`}
          />
          <MetricBox
            label={t.batchBacktest.averageReturn}
            value={pct(report.summary.average_return_pct)}
            tone={toneFor(report.summary.average_return_pct)}
          />
          <MetricBox
            label={t.batchBacktest.medianReturn}
            value={pct(report.summary.median_return_pct)}
            tone={toneFor(report.summary.median_return_pct)}
          />
          <MetricBox
            label={t.batchBacktest.averageMaxDd}
            value={pct(report.summary.average_max_drawdown_pct)}
            tone="negative"
          />
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <SymbolCard label={t.batchBacktest.bestPerformer} result={best} tone="positive" />
        <SymbolCard label={t.batchBacktest.medianResult} result={medianResult} tone="neutral" />
        <SymbolCard label={t.batchBacktest.weakestPerformer} result={worst} tone="negative" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricBox label={t.batchBacktest.averageSharpe} value={num(report.summary.average_sharpe)} />
        <MetricBox label={t.batchBacktest.totalTrades} value={String(report.summary.total_trades ?? 0)} />
        <MetricBox
          label={t.batchBacktest.successfulSymbols}
          value={String(report.summary.succeeded_symbols ?? completed.length)}
        />
        <MetricBox label={t.batchBacktest.failures} value={String(report.summary.failed_symbols ?? 0)} />
      </div>

      <BatchReportCharts report={report} />
      <ResultsTable results={sorted} />
      <FailuresList failed={failed} />
    </section>
  );
}

