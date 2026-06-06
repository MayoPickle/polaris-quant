"use client";

import { useI18n } from "@/lib/i18n/client";
import { formatCurrency } from "@/lib/i18n/format";
import type { BacktestResult } from "@/types";

import { COLORS } from "./constants";

export function CompareResultsCards({ results }: { results: BacktestResult[] }) {
  const { locale, t } = useI18n();
  const usd = (n: number) =>
    formatCurrency(n, locale, { maximumFractionDigits: 0 });

  return (
    <div className="flex flex-col gap-3 md:hidden">
      {results.map((res, i) => (
        <div key={i} className="rounded-lg border p-3">
          <div className="mb-3 flex items-start justify-between gap-3">
            <p className="flex min-w-0 items-center gap-2 font-medium">
              <span
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: COLORS[i % COLORS.length] }}
              />
              <span className="truncate">
                {res.label ?? `${t.backtestCompare.run} ${i + 1}`}
              </span>
            </p>
            <span className={`text-sm font-semibold ${res.total_return_pct >= 0 ? "text-green-600" : "text-red-600"}`}>
              {res.total_return_pct.toFixed(2)}%
            </span>
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Metric label={t.backtestCompare.trades} value={String(res.num_trades)} />
            <Metric label={t.backtestCompare.buyHold} value={`${res.buy_hold_return_pct.toFixed(2)}%`} tone={res.buy_hold_return_pct < 0 ? "neg" : undefined} />
            <Metric label={t.backtestCompare.alpha} value={`${res.alpha_return_pct.toFixed(2)}%`} tone={res.alpha_return_pct < 0 ? "neg" : undefined} />
            <Metric label={t.backtestCompare.winRate} value={`${res.win_rate_pct.toFixed(0)}%`} />
            <Metric label={t.backtestCompare.maxDd} value={`${res.max_drawdown_pct.toFixed(2)}%`} tone="neg" />
            <Metric label={t.backtestCompare.sharpe} value={res.sharpe.toFixed(2)} />
            <Metric label={t.backtestCompare.finalEquity} value={usd(res.final_equity)} className="col-span-2" />
          </dl>
        </div>
      ))}
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
  className,
}: {
  label: string;
  value: string;
  tone?: "neg";
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`font-medium ${tone === "neg" ? "text-red-600" : ""}`}>
        {value}
      </dd>
    </div>
  );
}

