"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useI18n } from "@/lib/i18n/client";
import { formatCurrency } from "@/lib/i18n/format";
import { cn } from "@/lib/utils";

import { num, pct, returnTone, toneFor } from "./formatting";
import { AggregateMetricCell, Metric, MetricBox } from "./metric-blocks";
import type { AggregateMetrics } from "./types";

export function AggregateMetricsDialog({
  aggregate,
  failedCount,
  reportMeta,
  totalSymbols,
}: {
  aggregate: AggregateMetrics;
  failedCount: number;
  reportMeta: string;
  totalSymbols: number;
}) {
  const { locale, t } = useI18n();
  const usd = (n: number) =>
    formatCurrency(n, locale, { maximumFractionDigits: 0 });

  const primaryMetrics = [
    {
      label: t.batchBacktest.averageReturn,
      value: pct(aggregate.averageReturnPct),
      tone: toneFor(aggregate.averageReturnPct),
    },
    {
      label: t.batchBacktest.averageMaxDd,
      value: pct(aggregate.averageMaxDrawdownPct),
      tone: "negative" as const,
    },
    {
      label: t.batchBacktest.averageSharpe,
      value: num(aggregate.averageSharpe),
      tone: "neutral" as const,
    },
    {
      label: t.batchBacktest.totalTrades,
      value: String(aggregate.totalTrades),
      tone: "neutral" as const,
    },
  ];
  const detailMetrics = [
    { label: t.batchBacktest.coverage, value: `${aggregate.successfulSymbols}/${totalSymbols}` },
    { label: t.batchBacktest.buyHold, value: pct(aggregate.averageBuyHoldReturnPct) },
    { label: t.batchBacktest.alpha, value: pct(aggregate.averageAlphaReturnPct) },
    { label: t.batchBacktest.medianReturn, value: pct(aggregate.medianReturnPct) },
    { label: t.batchBacktest.winRate, value: pct(aggregate.averageWinRatePct) },
    { label: t.batchBacktest.trades, value: num(aggregate.averageTrades) },
    {
      label: t.batchBacktest.finalEquity,
      value:
        aggregate.averageFinalEquity === null
          ? num(null)
          : usd(aggregate.averageFinalEquity),
    },
    { label: t.batchBacktest.failures, value: String(failedCount) },
  ];

  return (
    <Dialog>
      <DialogTrigger
        className="mt-4 block w-full rounded-lg border bg-background p-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        aria-label={t.batchBacktest.reportTitle}
      >
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold">{t.batchBacktest.reportTitle}</p>
          <p className="text-xs text-muted-foreground">
            {aggregate.successfulSymbols}/{totalSymbols} {t.batchBacktest.successfulSymbols}
          </p>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {primaryMetrics.map((metric) => (
            <AggregateMetricCell
              key={metric.label}
              label={metric.label}
              value={metric.value}
              tone={metric.tone}
            />
          ))}
        </div>
      </DialogTrigger>
      <DialogContent className="max-h-[min(42rem,calc(100dvh-2rem))] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t.batchBacktest.reportTitle}</DialogTitle>
          <DialogDescription>{reportMeta}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {detailMetrics.map((metric) => (
            <MetricBox key={metric.label} label={metric.label} value={metric.value} />
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">{t.batchBacktest.averageReturn}</p>
            <p className={cn("mt-2 text-xl font-semibold", returnTone(aggregate.averageReturnPct))}>
              {pct(aggregate.averageReturnPct)}
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <Metric label={t.batchBacktest.buyHold} value={pct(aggregate.averageBuyHoldReturnPct)} />
              <Metric label={t.batchBacktest.alpha} value={pct(aggregate.averageAlphaReturnPct)} />
            </dl>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">{t.batchBacktest.averageMaxDd}</p>
            <p className="mt-2 text-xl font-semibold text-red-600">
              {pct(aggregate.averageMaxDrawdownPct)}
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <Metric label={t.batchBacktest.sharpe} value={num(aggregate.averageSharpe)} />
              <Metric label={t.batchBacktest.winRate} value={pct(aggregate.averageWinRatePct)} />
            </dl>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

