"use client";

import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, MetricGrid, MetricTile } from "@/components/workbench";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n/client";
import { formatCurrency } from "@/lib/i18n/format";
import type { BacktestResult, StrategyDescriptor } from "@/types";

type ParamSpec = { type?: string; default?: number; title?: string };

function initialParams(s: StrategyDescriptor): Record<string, number> {
  const props = (s.param_schema?.properties as Record<string, ParamSpec>) ?? {};
  const out: Record<string, number> = {};
  for (const [name, spec] of Object.entries(props))
    if (typeof spec.default === "number") out[name] = spec.default;
  return out;
}

export function StrategyBacktest({ strategy }: { strategy: StrategyDescriptor }) {
  const { locale, t } = useI18n();
  const usd = (n: number) =>
    formatCurrency(n, locale, { maximumFractionDigits: 0 });
  const props = (strategy.param_schema?.properties as Record<string, ParamSpec>) ?? {};
  const [symbol, setSymbol] = useState("AAPL");
  const [lookback, setLookback] = useState(365);
  const [params, setParams] = useState<Record<string, number>>(() => initialParams(strategy));
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(
        await api.backtest({
          strategy_key: strategy.key,
          params,
          symbol: symbol.trim().toUpperCase(),
          timeframe: "1Day",
          lookback_days: lookback,
        })
      );
    } catch {
      setError(t.strategyBacktest.error);
    } finally {
      setLoading(false);
    }
  }

  const metrics = result
    ? [
        { label: t.strategyBacktest.totalReturn, value: `${result.total_return_pct.toFixed(2)}%`, pos: result.total_return_pct >= 0 },
        {
          label: t.strategyBacktest.buyHold,
          value: `${result.buy_hold_return_pct.toFixed(2)}%`,
          pos: result.buy_hold_return_pct >= 0,
        },
        {
          label: t.strategyBacktest.alpha,
          value: `${result.alpha_return_pct.toFixed(2)}%`,
          pos: result.alpha_return_pct >= 0,
        },
        { label: t.strategyBacktest.finalEquity, value: usd(result.final_equity) },
        { label: t.strategyBacktest.trades, value: String(result.num_trades) },
        { label: t.strategyBacktest.winRate, value: `${result.win_rate_pct.toFixed(0)}%` },
        { label: t.strategyBacktest.maxDrawdown, value: `${result.max_drawdown_pct.toFixed(2)}%`, neg: true },
        { label: t.strategyBacktest.sharpe, value: result.sharpe.toFixed(2) },
      ]
    : [];

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-semibold">{t.strategyBacktest.title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t.strategyBacktest.description}
        </p>
      </div>

      <div className="grid grid-cols-2 items-end gap-3 rounded-lg border bg-muted/20 p-3 sm:flex sm:flex-wrap">
        <Field label={t.strategyBacktest.symbol}>
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && run()}
            className="h-9 w-full rounded-md border bg-background px-3 text-sm font-medium uppercase sm:w-28"
          />
        </Field>
        <Field label={t.strategyBacktest.lookback}>
          <input
            type="number"
            value={lookback}
            onChange={(e) => setLookback(Number(e.target.value))}
            className="h-9 w-full rounded-md border bg-background px-3 text-sm sm:w-28"
          />
        </Field>
        {Object.entries(props).map(([name, spec]) => (
          <Field key={name} label={spec.title ?? name}>
            <input
              type="number"
              value={params[name] ?? ""}
              onChange={(e) => setParams((p) => ({ ...p, [name]: Number(e.target.value) }))}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm sm:w-24"
            />
          </Field>
        ))}
        <Button onClick={run} disabled={loading} className="col-span-2 w-full sm:w-auto">
          <Play data-icon="inline-start" />
          {loading ? t.common.running : t.strategyBacktest.run}
        </Button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {result && (
        <>
          <MetricGrid className="sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
            {metrics.map((m) => (
              <MetricTile
                key={m.label}
                label={m.label}
                value={m.value}
                tone={
                  m.pos === true
                    ? "positive"
                    : m.pos === false || m.neg
                      ? "negative"
                      : "neutral"
                }
              />
            ))}
          </MetricGrid>

          <div className="h-72 w-full rounded-lg border bg-card p-3">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={result.equity_curve} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={(t: string) => t.slice(0, 7)}
                  minTickGap={48}
                  fontSize={12}
                />
                <YAxis
                  domain={["auto", "auto"]}
                  tickFormatter={(v: number) =>
                    formatCurrency(v, locale, {
                      notation: "compact",
                      maximumFractionDigits: 0,
                    })
                  }
                  width={56}
                  fontSize={12}
                />
                <Tooltip
                  formatter={(value) => [
                    usd(Number(value ?? 0)),
                    t.strategyBacktest.equity,
                  ]}
                  labelFormatter={(label) => String(label).slice(0, 10)}
                />
                <Line
                  type="monotone"
                  dataKey="equity"
                  stroke="var(--color-primary)"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </section>
  );
}
