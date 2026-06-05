"use client";

import { useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { WorkbenchPanel } from "@/components/workbench";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n/client";
import { formatCurrency } from "@/lib/i18n/format";
import type { BacktestResult, StrategyDescriptor } from "@/types";

type ParamSpec = { type?: string; default?: number; title?: string };

const COLORS = ["#2563eb", "#16a34a", "#dc2626", "#d97706", "#7c3aed", "#0891b2"];

let nextId = 1;
type Row = { id: number; strategyKey: string; symbol: string; params: Record<string, number> };

function paramsFor(s?: StrategyDescriptor): Record<string, number> {
  const props = (s?.param_schema?.properties as Record<string, ParamSpec>) ?? {};
  const out: Record<string, number> = {};
  for (const [name, spec] of Object.entries(props))
    if (typeof spec.default === "number") out[name] = spec.default;
  return out;
}

function makeRow(strategies: StrategyDescriptor[], symbol = "AAPL"): Row {
  const s = strategies[0];
  return { id: nextId++, strategyKey: s?.key ?? "", symbol, params: paramsFor(s) };
}

function labelFor(row: Row): string {
  // Summarize the distinguishing params (skip qty, which is constant here).
  const vals = Object.entries(row.params)
    .filter(([k]) => k !== "qty")
    .map(([, v]) => v)
    .join("/");
  return `${row.symbol.toUpperCase()} ${row.strategyKey} ${vals}`.trim();
}

export function BacktestCompare({ strategies }: { strategies: StrategyDescriptor[] }) {
  const { locale, t } = useI18n();
  const usd = (n: number) =>
    formatCurrency(n, locale, { maximumFractionDigits: 0 });
  const [rows, setRows] = useState<Row[]>(() => [
    makeRow(strategies),
    { ...makeRow(strategies), params: { ...paramsFor(strategies[0]), fast: 20, slow: 50 } },
    { ...makeRow(strategies), params: { ...paramsFor(strategies[0]), fast: 5, slow: 20 } },
  ]);
  const [lookback, setLookback] = useState(365);
  const [results, setResults] = useState<BacktestResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(id: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function changeStrategy(id: number, key: string) {
    update(id, { strategyKey: key, params: paramsFor(strategies.find((s) => s.key === key)) });
  }

  async function run() {
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const res = await api.backtestCompare({
        lookback_days: lookback,
        timeframe: "1Day",
        runs: rows.map((r) => ({
          label: labelFor(r),
          strategy_key: r.strategyKey,
          params: r.params,
          symbol: r.symbol.trim().toUpperCase(),
        })),
      });
      setResults(res.results);
    } catch {
      setError(t.backtestCompare.error);
    } finally {
      setLoading(false);
    }
  }

  // Merge equity curves onto a shared timeline keyed by timestamp.
  const chartData = (() => {
    if (!results) return [];
    const byTs = new Map<string, Record<string, number | string>>();
    results.forEach((res, i) => {
      for (const p of res.equity_curve) {
        const row = byTs.get(p.timestamp) ?? { timestamp: p.timestamp };
        row[`r${i}`] = p.equity;
        byTs.set(p.timestamp, row);
      }
    });
    return [...byTs.values()].sort((a, b) =>
      String(a.timestamp).localeCompare(String(b.timestamp))
    );
  })();

  return (
    <WorkbenchPanel
      title={t.backtestCompare.title}
      description={t.backtestCompare.description}
      contentClassName="flex flex-col gap-5"
    >
        {/* Run rows */}
        <div className="flex flex-col gap-2">
          {rows.map((row, i) => {
            const strat = strategies.find((s) => s.key === row.strategyKey);
            const props =
              (strat?.param_schema?.properties as Record<string, ParamSpec>) ?? {};
            return (
              <div
                key={row.id}
                className="grid gap-3 rounded-lg border bg-muted/20 p-3 md:flex md:flex-wrap md:items-end md:gap-2"
              >
                <span
                  className="hidden h-3 w-3 shrink-0 rounded-full md:mb-2 md:inline-block"
                  style={{ backgroundColor: COLORS[i % COLORS.length] }}
                />
                <Field label={t.backtestCompare.strategy} className="md:min-w-44">
                  <select
                    value={row.strategyKey}
                    onChange={(e) => changeStrategy(row.id, e.target.value)}
                    className="h-10 w-full rounded-lg border bg-background px-3 text-sm md:h-9"
                  >
                    {strategies.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t.backtestCompare.symbol} className="md:w-24">
                  <input
                    value={row.symbol}
                    onChange={(e) => update(row.id, { symbol: e.target.value })}
                    className="h-10 w-full rounded-lg border bg-background px-3 text-sm uppercase md:h-9"
                  />
                </Field>
                {Object.entries(props).map(([name, spec]) => (
                  <Field key={name} label={spec.title ?? name} className="md:w-20">
                    <input
                      type="number"
                      value={row.params[name] ?? ""}
                      onChange={(e) =>
                        update(row.id, {
                          params: { ...row.params, [name]: Number(e.target.value) },
                        })
                      }
                      className="h-10 w-full rounded-lg border bg-background px-3 text-sm md:h-9"
                    />
                  </Field>
                ))}
                {rows.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-muted-foreground md:mb-0.5 md:w-auto"
                    onClick={() => setRows((rs) => rs.filter((r) => r.id !== row.id))}
                  >
                    {t.backtestCompare.remove}
                  </Button>
                )}
              </div>
            );
          })}
        </div>

        <div className="grid gap-3 md:flex md:flex-wrap md:items-end">
          <Field label={t.backtestCompare.lookback} className="md:w-28">
            <input
              type="number"
              value={lookback}
              onChange={(e) => setLookback(Number(e.target.value))}
              className="h-10 w-full rounded-lg border bg-background px-3 text-sm md:h-9"
            />
          </Field>
          {rows.length < 6 && (
            <Button
              variant="outline"
              className="w-full md:w-auto"
              onClick={() => setRows((rs) => [...rs, makeRow(strategies)])}
            >
              + {t.backtestCompare.addRun}
            </Button>
          )}
          <Button onClick={run} disabled={loading} className="w-full md:w-auto">
            {loading ? t.common.running : t.backtestCompare.runComparison}
          </Button>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {results && results.length > 0 && (
          <>
            <div className="h-64 w-full md:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chartData}
                  margin={{ top: 8, right: 8, bottom: 8, left: 0 }}
                >
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
                    width={48}
                    fontSize={12}
                  />
                  <Tooltip
                    formatter={(value) =>
                      typeof value === "number" ? usd(value) : String(value ?? "")
                    }
                    labelFormatter={(label) => String(label).slice(0, 10)}
                  />
                  <Legend />
                  {results.map((res, i) => (
                    <Line
                      key={i}
                      type="monotone"
                      dataKey={`r${i}`}
                      name={res.label ?? `${t.backtestCompare.run} ${i + 1}`}
                      stroke={COLORS[i % COLORS.length]}
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>

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
                    <span
                      className={`text-sm font-semibold ${
                        res.total_return_pct >= 0
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      {res.total_return_pct.toFixed(2)}%
                    </span>
                  </div>
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <Metric label={t.backtestCompare.trades} value={String(res.num_trades)} />
                    <Metric
                      label={t.backtestCompare.buyHold}
                      value={`${res.buy_hold_return_pct.toFixed(2)}%`}
                      tone={res.buy_hold_return_pct < 0 ? "neg" : undefined}
                    />
                    <Metric
                      label={t.backtestCompare.alpha}
                      value={`${res.alpha_return_pct.toFixed(2)}%`}
                      tone={res.alpha_return_pct < 0 ? "neg" : undefined}
                    />
                    <Metric
                      label={t.backtestCompare.winRate}
                      value={`${res.win_rate_pct.toFixed(0)}%`}
                    />
                    <Metric
                      label={t.backtestCompare.maxDd}
                      value={`${res.max_drawdown_pct.toFixed(2)}%`}
                      tone="neg"
                    />
                    <Metric label={t.backtestCompare.sharpe} value={res.sharpe.toFixed(2)} />
                    <Metric
                      label={t.backtestCompare.finalEquity}
                      value={usd(res.final_equity)}
                      className="col-span-2"
                    />
                  </dl>
                </div>
              ))}
            </div>

            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t.backtestCompare.run}</TableHead>
                    <TableHead className="text-right">{t.backtestCompare.return}</TableHead>
                    <TableHead className="text-right">{t.backtestCompare.buyHold}</TableHead>
                    <TableHead className="text-right">{t.backtestCompare.alpha}</TableHead>
                    <TableHead className="text-right">{t.backtestCompare.trades}</TableHead>
                    <TableHead className="text-right">{t.backtestCompare.winRate}</TableHead>
                    <TableHead className="text-right">{t.backtestCompare.maxDd}</TableHead>
                    <TableHead className="text-right">{t.backtestCompare.sharpe}</TableHead>
                    <TableHead className="text-right">{t.backtestCompare.finalEquity}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                {results.map((res, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">
                      <span className="flex items-center gap-2">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: COLORS[i % COLORS.length] }}
                        />
                        {res.label ?? `${t.backtestCompare.run} ${i + 1}`}
                      </span>
                    </TableCell>
                    <TableCell
                      className={`text-right font-medium ${
                        res.total_return_pct >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {res.total_return_pct.toFixed(2)}%
                    </TableCell>
                    <TableCell
                      className={`text-right ${
                        res.buy_hold_return_pct >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {res.buy_hold_return_pct.toFixed(2)}%
                    </TableCell>
                    <TableCell
                      className={`text-right font-medium ${
                        res.alpha_return_pct >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {res.alpha_return_pct.toFixed(2)}%
                    </TableCell>
                    <TableCell className="text-right">{res.num_trades}</TableCell>
                    <TableCell className="text-right">{res.win_rate_pct.toFixed(0)}%</TableCell>
                    <TableCell className="text-right text-red-600">
                      {res.max_drawdown_pct.toFixed(2)}%
                    </TableCell>
                    <TableCell className="text-right">{res.sharpe.toFixed(2)}</TableCell>
                    <TableCell className="text-right">{usd(res.final_equity)}</TableCell>
                  </TableRow>
                ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
    </WorkbenchPanel>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex min-w-0 flex-col gap-1 ${className ?? ""}`}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
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
