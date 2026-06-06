"use client";

import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import type { BatchBacktestSymbolResult } from "@/types";

import { num, pct } from "./formatting";

export function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 truncate font-medium">{value}</dd>
    </div>
  );
}

export function AggregateMetricCell({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative" | "neutral";
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-xl font-semibold",
          tone === "positive" && "text-green-600",
          tone === "negative" && "text-red-600"
        )}
      >
        {value}
      </p>
    </div>
  );
}

export function MetricBox({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: "positive" | "negative" | "neutral";
}) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-lg font-semibold",
          tone === "positive" && "text-green-600",
          tone === "negative" && "text-red-600"
        )}
      >
        {value}
      </p>
      {detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
}

export function SymbolCard({
  label,
  result,
  tone,
}: {
  label: string;
  result?: BatchBacktestSymbolResult;
  tone: "positive" | "negative" | "neutral";
}) {
  const { t } = useI18n();

  if (!result) {
    return (
      <div className="rounded-lg border border-dashed p-4">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="mt-2 text-sm font-medium">{t.batchBacktest.noSuccessfulResult}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-2 font-mono text-lg font-semibold">{result.symbol}</p>
        </div>
        <Badge variant="secondary">
          {tone === "positive"
            ? t.enums.symbolRankBadge.leader
            : tone === "negative"
              ? t.enums.symbolRankBadge.risk
              : t.enums.symbolRankBadge.median}
        </Badge>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <Metric label={t.batchBacktest.return} value={pct(result.total_return_pct)} />
        <Metric label={t.batchBacktest.buyHold} value={pct(result.buy_hold_return_pct)} />
        <Metric label={t.batchBacktest.alpha} value={pct(result.alpha_return_pct)} />
        <Metric label={t.batchBacktest.sharpe} value={num(result.sharpe)} />
        <Metric label={t.batchBacktest.maxDd} value={pct(result.max_drawdown_pct)} />
        <Metric label={t.batchBacktest.winRate} value={pct(result.win_rate_pct)} />
      </dl>
    </div>
  );
}

export function EmptyPanel({ text }: { text: string }) {
  return (
    <div className="flex h-full min-h-48 items-center justify-center rounded-lg border border-dashed px-4 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

