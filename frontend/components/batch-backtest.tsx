"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowUpDown, ChevronLeft, ChevronRight, FileUp, Play, RefreshCw, Square } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Field, WorkbenchPanel } from "@/components/workbench";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type {
  BacktestUniverse,
  BatchBacktestJob,
  BatchBacktestReport,
  BatchBacktestSymbolResult,
  StrategyDescriptor,
} from "@/types";

type ParamSpec = { type?: string; default?: number; title?: string };

const COLORS = ["#2563eb", "#16a34a", "#dc2626"];
const FINAL_STATUSES = new Set(["completed", "failed", "cancelled"]);
const RESULTS_PAGE_SIZE = 25;

type RankingSortKey =
  | "rank"
  | "symbol"
  | "total_return_pct"
  | "sharpe"
  | "max_drawdown_pct"
  | "win_rate_pct"
  | "num_trades"
  | "final_equity";
type SortDirection = "asc" | "desc";
type RankedResult = BatchBacktestSymbolResult & { rank: number };

const RANKING_SORT_LABELS: Record<RankingSortKey, string> = {
  rank: "Rank",
  symbol: "Symbol",
  total_return_pct: "Return",
  sharpe: "Sharpe",
  max_drawdown_pct: "Max DD",
  win_rate_pct: "Win rate",
  num_trades: "Trades",
  final_equity: "Final equity",
};

const usd = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

function paramsFor(s?: StrategyDescriptor): Record<string, number> {
  const props = (s?.param_schema?.properties as Record<string, ParamSpec>) ?? {};
  const out: Record<string, number> = {};
  for (const [name, spec] of Object.entries(props))
    if (typeof spec.default === "number") out[name] = spec.default;
  return out;
}

function isRunning(job: BatchBacktestJob | null): boolean {
  return !!job && !FINAL_STATUSES.has(job.status);
}

export function BatchBacktest({
  strategies,
  universes,
}: {
  strategies: StrategyDescriptor[];
  universes: BacktestUniverse[];
}) {
  const [strategyKey, setStrategyKey] = useState(strategies[0]?.key ?? "");
  const selectedStrategy = useMemo(
    () => strategies.find((s) => s.key === strategyKey) ?? strategies[0],
    [strategies, strategyKey]
  );
  const props = (selectedStrategy?.param_schema?.properties as Record<string, ParamSpec>) ?? {};
  const [params, setParams] = useState<Record<string, number>>(() =>
    paramsFor(selectedStrategy)
  );
  const [selectedUniverses, setSelectedUniverses] = useState<string[]>([]);
  const [symbolsText, setSymbolsText] = useState("");
  const [fileName, setFileName] = useState("");
  const [lookback, setLookback] = useState(365);
  const [timeframe, setTimeframe] = useState("1Day");
  const [initialCapital, setInitialCapital] = useState(100_000);
  const [job, setJob] = useState<BatchBacktestJob | null>(null);
  const [report, setReport] = useState<BatchBacktestReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const jobId = new URLSearchParams(window.location.search).get("batchJobId");
    if (!jobId) return;

    let cancelled = false;
    void (async () => {
      try {
        const next = await api.batchBacktest(jobId);
        if (cancelled) return;
        setJob(next);
        if (next.status === "completed") {
          setReport(await api.batchBacktestReport(jobId));
        }
      } catch {
        if (!cancelled) setError("Could not load batch backtest from URL.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const jobId = job?.id;
    const status = job?.status;
    if (!jobId || FINAL_STATUSES.has(status ?? "")) return;

    let cancelled = false;
    const timer = window.setInterval(() => {
      void (async () => {
        try {
          const next = await api.batchBacktest(jobId);
          if (cancelled) return;
          if (next.status === "completed") {
            const nextReport = await api.batchBacktestReport(jobId);
            if (!cancelled) {
              setJob(next);
              setReport(nextReport);
            }
          } else {
            setJob(next);
          }
        } catch {
          if (!cancelled) setError("Could not refresh batch backtest status.");
        }
      })();
    }, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [job?.id, job?.status]);

  async function refreshJob(jobId: string) {
    try {
      const next = await api.batchBacktest(jobId);
      setJob(next);
      if (next.status === "completed") {
        setReport(await api.batchBacktestReport(jobId));
      }
    } catch {
      setError("Could not refresh batch backtest status.");
    }
  }

  async function start() {
    if (!strategyKey) return;
    if (!symbolsText.trim() && selectedUniverses.length === 0) {
      setError("Add imported symbols or choose at least one universe.");
      return;
    }
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const next = await api.createBatchBacktest({
        strategy_key: strategyKey,
        params,
        symbols_text: symbolsText,
        universes: selectedUniverses,
        timeframe,
        lookback_days: lookback,
        initial_capital: initialCapital,
      });
      setJob(next);
      const searchParams = new URLSearchParams(window.location.search);
      searchParams.set("batchJobId", next.id);
      window.history.replaceState(null, "", `${window.location.pathname}?${searchParams}`);
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : "Could not start batch backtest.");
    } finally {
      setLoading(false);
    }
  }

  async function cancel() {
    if (!job) return;
    setError(null);
    try {
      setJob(await api.cancelBatchBacktest(job.id));
    } catch {
      setError("Could not cancel batch backtest.");
    }
  }

  async function loadReport() {
    if (!job) return;
    setError(null);
    try {
      setReport(await api.batchBacktestReport(job.id));
    } catch {
      setError("Could not load batch report.");
    }
  }

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setSymbolsText(await file.text());
  }

  function toggleUniverse(key: string) {
    setSelectedUniverses((keys) =>
      keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key]
    );
  }

  const progress = job?.total_symbols
    ? Math.round((job.completed_symbols / job.total_symbols) * 100)
    : 0;

  return (
    <WorkbenchPanel
      title="Batch backtests"
      description="Run one strategy across an imported list or full market universes."
      actions={
        job ? (
          <Badge variant={job.status === "completed" ? "default" : "secondary"}>
            {job.status}
          </Badge>
        ) : null
      }
      contentClassName="flex flex-col gap-5"
    >
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)]">
          <div className="flex flex-col gap-4 rounded-lg border bg-muted/15 p-3 md:p-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Field label="Strategy">
                <select
                  value={strategyKey}
                  onChange={(e) => {
                    const key = e.target.value;
                    setStrategyKey(key);
                    setParams(paramsFor(strategies.find((s) => s.key === key)));
                  }}
                  className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
                >
                  {strategies.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Timeframe">
                <select
                  value={timeframe}
                  onChange={(e) => setTimeframe(e.target.value)}
                  className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
                >
                  <option value="1Day">Daily</option>
                  <option value="1Hour">Hourly</option>
                  <option value="1Min">1 minute</option>
                </select>
              </Field>
              <Field label="Lookback days">
                <input
                  type="number"
                  min={5}
                  max={2000}
                  value={lookback}
                  onChange={(e) => setLookback(Number(e.target.value))}
                  className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
                />
              </Field>
              <Field label="Initial capital">
                <input
                  type="number"
                  min={1}
                  value={initialCapital}
                  onChange={(e) => setInitialCapital(Number(e.target.value))}
                  className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
                />
              </Field>
            </div>

            {Object.keys(props).length > 0 && (
              <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
                {Object.entries(props).map(([name, spec]) => (
                  <Field key={name} label={spec.title ?? name}>
                    <input
                      type="number"
                      value={params[name] ?? ""}
                      onChange={(e) =>
                        setParams((p) => ({ ...p, [name]: Number(e.target.value) }))
                      }
                      className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
                    />
                  </Field>
                ))}
              </div>
            )}

            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-muted-foreground">
                Universes
              </span>
              <div className="grid gap-2 sm:grid-cols-3">
                {universes.map((universe) => (
                  <label
                    key={universe.key}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-lg border bg-background p-3 text-sm transition-colors",
                      selectedUniverses.includes(universe.key)
                        ? "border-primary bg-primary/5"
                        : "hover:bg-muted/40"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={selectedUniverses.includes(universe.key)}
                      onChange={() => toggleUniverse(universe.key)}
                      className="mt-1"
                    />
                    <span className="min-w-0">
                      <span className="block font-medium">{universe.name}</span>
                      <span className="mt-1 line-clamp-2 block text-xs text-muted-foreground">
                        {universe.description}
                      </span>
                    </span>
                  </label>
                ))}
                {universes.length === 0 && (
                  <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                    No universes available from the API.
                  </p>
                )}
              </div>
            </div>

            <Field label="Imported symbols">
              <textarea
                value={symbolsText}
                onChange={(e) => setSymbolsText(e.target.value)}
                placeholder="AAPL, MSFT, NVDA or one symbol per line"
                className="min-h-32 w-full resize-y rounded-lg border bg-background px-3 py-2 text-sm uppercase"
              />
            </Field>

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <label>
                <input
                  type="file"
                  accept=".csv,.txt,text/csv,text/plain"
                  onChange={importFile}
                  className="sr-only"
                />
                <span className="inline-flex h-8 w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border bg-background px-2.5 text-sm font-medium hover:bg-muted sm:w-auto">
                  <FileUp data-icon="inline-start" />
                  Import file
                </span>
              </label>
              {fileName && (
                <span className="truncate text-sm text-muted-foreground">
                  {fileName}
                </span>
              )}
              <div className="flex flex-col gap-2 sm:ml-auto sm:flex-row">
                <Button onClick={start} disabled={loading || !strategyKey} className="w-full sm:w-auto">
                  <Play data-icon="inline-start" />
                  {loading ? "Starting..." : "Start batch"}
                </Button>
                {job && (
                  <Button
                    variant="outline"
                    onClick={() => void refreshJob(job.id)}
                    className="w-full sm:w-auto"
                  >
                    <RefreshCw data-icon="inline-start" />
                    Refresh
                  </Button>
                )}
                {isRunning(job) && (
                  <Button variant="destructive" onClick={cancel} className="w-full sm:w-auto">
                    <Square data-icon="inline-start" />
                    Cancel
                  </Button>
                )}
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">Progress</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {job ? job.id : "No batch job running"}
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
              <Metric label="Progress" value={`${progress}%`} />
              <Metric label="Total" value={String(job?.total_symbols ?? 0)} />
              <Metric label="Completed" value={String(job?.completed_symbols ?? 0)} />
              <Metric label="Succeeded" value={String(job?.succeeded_symbols ?? 0)} />
              <Metric label="Failed" value={String(job?.failed_symbols ?? 0)} />
              <Metric label="Status" value={job?.status ?? "idle"} />
            </dl>

            {job?.status === "completed" && !report && (
              <Button className="mt-4 w-full" onClick={loadReport}>
                Load report
              </Button>
            )}
            {job?.error && (
              <p className="mt-4 text-sm text-destructive">{job.error}</p>
            )}
          </div>
        </div>

        {report && <BatchReport report={report} />}
    </WorkbenchPanel>
  );
}

function BatchReport({ report }: { report: BatchBacktestReport }) {
  const completed = report.results.filter((r) => r.status === "completed");
  const failed = report.results.filter((r) => r.status === "failed");
  const sorted = [...completed].sort(
    (a, b) => (b.total_return_pct ?? -Infinity) - (a.total_return_pct ?? -Infinity)
  );
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const medianSymbol = report.summary.representative_symbols?.median;
  const medianResult = completed.find((r) => r.symbol === medianSymbol);
  const { chartData, symbols } = representativeChartData(report);
  const distribution = report.summary.return_distribution ?? [];

  return (
    <section data-testid="batch-report" className="flex min-w-0 flex-col gap-5 border-t pt-5">
      <div className="rounded-lg border bg-muted/20 p-4 md:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h3 className="text-base font-semibold">Batch report</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {report.job.strategy_key} · {report.job.timeframe} ·{" "}
              {report.job.lookback_days} days · {usd(report.job.initial_capital)}
            </p>
          </div>
          <Badge variant={report.job.status === "completed" ? "default" : "secondary"}>
            {report.job.status}
          </Badge>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricBox
            label="Coverage"
            value={`${completed.length}/${report.job.total_symbols}`}
            detail={`${failed.length} failed`}
          />
          <MetricBox
            label="Average return"
            value={pct(report.summary.average_return_pct)}
            tone={toneFor(report.summary.average_return_pct)}
          />
          <MetricBox
            label="Median return"
            value={pct(report.summary.median_return_pct)}
            tone={toneFor(report.summary.median_return_pct)}
          />
          <MetricBox
            label="Average max DD"
            value={pct(report.summary.average_max_drawdown_pct)}
            tone="negative"
          />
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <SymbolCard label="Best performer" result={best} tone="positive" />
        <SymbolCard label="Median result" result={medianResult} tone="neutral" />
        <SymbolCard label="Weakest performer" result={worst} tone="negative" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricBox label="Average Sharpe" value={num(report.summary.average_sharpe)} />
        <MetricBox label="Total trades" value={String(report.summary.total_trades ?? 0)} />
        <MetricBox
          label="Successful symbols"
          value={String(report.summary.succeeded_symbols ?? completed.length)}
        />
        <MetricBox label="Failures" value={String(report.summary.failed_symbols ?? 0)} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-3 rounded-lg border p-3 md:p-4">
          <div>
            <h4 className="text-sm font-semibold">Representative equity curves</h4>
            <p className="mt-1 text-xs text-muted-foreground">
              Best, median, and weakest successful symbols.
            </p>
          </div>
          <div className="h-64 min-w-0 sm:h-72">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="timestamp"
                    tickFormatter={(t: string) => t.slice(0, 10)}
                    minTickGap={48}
                    fontSize={12}
                  />
                  <YAxis
                    domain={["auto", "auto"]}
                    tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
                    width={48}
                    fontSize={12}
                  />
                  <Tooltip
                    formatter={(value) => [usd(Number(value ?? 0)), "Equity"]}
                    labelFormatter={(label) => String(label).slice(0, 10)}
                  />
                  {symbols.map((symbol, i) => (
                    <Line
                      key={symbol}
                      type="monotone"
                      dataKey={symbol}
                      name={symbol}
                      stroke={COLORS[i % COLORS.length]}
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <EmptyPanel text="No successful equity curves to chart." />
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-3 rounded-lg border p-3 md:p-4">
          <div>
            <h4 className="text-sm font-semibold">Return distribution</h4>
            <p className="mt-1 text-xs text-muted-foreground">
              Count of successful symbols by return bucket.
            </p>
          </div>
          <div className="h-64 min-w-0 sm:h-72">
            {distribution.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={distribution} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="range" fontSize={11} minTickGap={16} />
                  <YAxis allowDecimals={false} fontSize={12} width={36} />
                  <Tooltip />
                  <Bar dataKey="count" name="Symbols" fill="var(--color-primary)" radius={4} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyPanel text="No return distribution available." />
            )}
          </div>
        </div>
      </div>

      <ResultsTable results={sorted} />

      {failed.length > 0 && (
        <div className="flex flex-col gap-3">
          <h4 className="text-sm font-semibold">Failures</h4>
          <div className="flex flex-col gap-2 md:hidden">
            {failed.slice(0, 25).map((row) => (
              <div key={row.symbol} className="rounded-lg border p-3">
                <p className="font-mono text-xs font-medium">{row.symbol}</p>
                <p className="mt-2 text-sm text-muted-foreground">{row.error}</p>
              </div>
            ))}
          </div>
          <div className="hidden overflow-x-auto rounded-lg border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {failed.slice(0, 50).map((row) => (
                  <TableRow key={row.symbol}>
                    <TableCell className="font-mono text-xs">{row.symbol}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {row.error}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </section>
  );
}

function ResultsTable({ results }: { results: BatchBacktestSymbolResult[] }) {
  const [sort, setSort] = useState<{
    key: RankingSortKey;
    direction: SortDirection;
  }>({
    key: "rank",
    direction: "asc",
  });
  const [page, setPage] = useState(1);

  const ranked = useMemo<RankedResult[]>(
    () => results.map((row, index) => ({ ...row, rank: index + 1 })),
    [results]
  );
  const sorted = useMemo(() => sortRankedResults(ranked, sort.key, sort.direction), [
    ranked,
    sort.direction,
    sort.key,
  ]);
  const pageCount = Math.max(1, Math.ceil(sorted.length / RESULTS_PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageStart = (safePage - 1) * RESULTS_PAGE_SIZE;
  const pageRows = sorted.slice(pageStart, pageStart + RESULTS_PAGE_SIZE);
  const visibleStart = sorted.length === 0 ? 0 : pageStart + 1;
  const visibleEnd = pageStart + pageRows.length;

  function handleSort(key: RankingSortKey) {
    setSort((current) => ({
      key,
      direction:
        current.key === key
          ? current.direction === "asc"
            ? "desc"
            : "asc"
          : defaultSortDirection(key),
    }));
    setPage(1);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h4 className="text-sm font-semibold">Symbol ranking</h4>
        <p className="text-xs text-muted-foreground">
          {visibleStart}-{visibleEnd} of {sorted.length}
        </p>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 md:hidden">
        {(Object.keys(RANKING_SORT_LABELS) as RankingSortKey[]).map((key) => (
          <Button
            key={key}
            type="button"
            variant={sort.key === key ? "secondary" : "outline"}
            size="sm"
            className="shrink-0"
            onClick={() => handleSort(key)}
          >
            {RANKING_SORT_LABELS[key]}
            {sort.key === key && (sort.direction === "asc" ? " ↑" : " ↓")}
          </Button>
        ))}
      </div>
      <div className="flex flex-col gap-2 md:hidden">
        {pageRows.map((row) => (
          <div key={row.symbol} className="rounded-lg border p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-mono text-sm font-semibold">{row.symbol}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  #{row.rank} by return · {row.num_trades ?? 0} trades
                </p>
              </div>
              <p className={cn("shrink-0 text-sm font-semibold", returnTone(row.total_return_pct))}>
                {pct(row.total_return_pct)}
              </p>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <Metric label="Sharpe" value={num(row.sharpe)} />
              <Metric label="Max DD" value={pct(row.max_drawdown_pct)} />
              <Metric label="Win rate" value={pct(row.win_rate_pct)} />
              <Metric
                label="Final equity"
                value={row.final_equity === null ? "—" : usd(row.final_equity)}
              />
            </dl>
          </div>
        ))}
      </div>
      <div className="hidden overflow-x-auto rounded-lg border md:block">
        <Table className="min-w-[48rem]">
          <TableHeader>
            <TableRow>
              <SortableTableHead
                label="Rank"
                sortKey="rank"
                activeSort={sort}
                onSort={handleSort}
              />
              <SortableTableHead
                label="Symbol"
                sortKey="symbol"
                activeSort={sort}
                onSort={handleSort}
              />
              <SortableTableHead
                label="Return"
                sortKey="total_return_pct"
                activeSort={sort}
                onSort={handleSort}
                align="right"
              />
              <SortableTableHead
                label="Sharpe"
                sortKey="sharpe"
                activeSort={sort}
                onSort={handleSort}
                align="right"
              />
              <SortableTableHead
                label="Max DD"
                sortKey="max_drawdown_pct"
                activeSort={sort}
                onSort={handleSort}
                align="right"
              />
              <SortableTableHead
                label="Win rate"
                sortKey="win_rate_pct"
                activeSort={sort}
                onSort={handleSort}
                align="right"
              />
              <SortableTableHead
                label="Trades"
                sortKey="num_trades"
                activeSort={sort}
                onSort={handleSort}
                align="right"
              />
              <SortableTableHead
                label="Final equity"
                sortKey="final_equity"
                activeSort={sort}
                onSort={handleSort}
                align="right"
              />
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.map((row) => (
              <TableRow key={row.symbol}>
                <TableCell className="text-xs text-muted-foreground">#{row.rank}</TableCell>
                <TableCell className="font-mono text-xs">{row.symbol}</TableCell>
                <TableCell className={cn("text-right font-medium", returnTone(row.total_return_pct))}>
                  {pct(row.total_return_pct)}
                </TableCell>
                <TableCell className="text-right">{num(row.sharpe)}</TableCell>
                <TableCell className="text-right text-red-600">
                  {pct(row.max_drawdown_pct)}
                </TableCell>
                <TableCell className="text-right">{pct(row.win_rate_pct)}</TableCell>
                <TableCell className="text-right">{row.num_trades ?? 0}</TableCell>
                <TableCell className="text-right">
                  {row.final_equity === null ? "—" : usd(row.final_equity)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <RankingPagination
        page={safePage}
        pageCount={pageCount}
        onPageChange={setPage}
      />
    </div>
  );
}

function SortableTableHead({
  label,
  sortKey,
  activeSort,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: RankingSortKey;
  activeSort: { key: RankingSortKey; direction: SortDirection };
  onSort: (key: RankingSortKey) => void;
  align?: "left" | "right";
}) {
  const active = activeSort.key === sortKey;
  return (
    <TableHead className={align === "right" ? "text-right" : undefined}>
      <button
        type="button"
        className={cn(
          "inline-flex h-7 items-center gap-1 rounded-md text-xs font-semibold uppercase tracking-[0.02em] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
          align === "right" && "ml-auto"
        )}
        onClick={() => onSort(sortKey)}
      >
        {label}
        <ArrowUpDown
          className={cn("size-3", active ? "text-foreground" : "text-muted-foreground/60")}
        />
        {active && (
          <span className="text-[0.65rem] text-foreground">
            {activeSort.direction === "asc" ? "↑" : "↓"}
          </span>
        )}
      </button>
    </TableHead>
  );
}

function RankingPagination({
  page,
  pageCount,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-xs text-muted-foreground">
        Page {page} of {pageCount}
      </p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          disabled={page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
          aria-label="Previous page"
        >
          <ChevronLeft />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          disabled={page >= pageCount}
          onClick={() => onPageChange(Math.min(pageCount, page + 1))}
          aria-label="Next page"
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}

function sortRankedResults(
  rows: RankedResult[],
  key: RankingSortKey,
  direction: SortDirection
) {
  return [...rows].sort((a, b) => {
    const comparison =
      key === "symbol"
        ? a.symbol.localeCompare(b.symbol)
        : compareNullableNumbers(sortValue(a, key), sortValue(b, key));
    const directed = direction === "asc" ? comparison : -comparison;
    return directed || a.rank - b.rank || a.symbol.localeCompare(b.symbol);
  });
}

function sortValue(row: RankedResult, key: Exclude<RankingSortKey, "symbol">) {
  if (key === "rank") return row.rank;
  return row[key];
}

function compareNullableNumbers(
  a: number | null | undefined,
  b: number | null | undefined
) {
  const aMissing = a === null || a === undefined || Number.isNaN(a);
  const bMissing = b === null || b === undefined || Number.isNaN(b);
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;
  return a - b;
}

function defaultSortDirection(key: RankingSortKey): SortDirection {
  if (key === "rank" || key === "symbol" || key === "max_drawdown_pct") return "asc";
  return "desc";
}

function representativeChartData(report: BatchBacktestReport) {
  const reps = report.summary.representative_symbols ?? {};
  const symbols = [reps.best, reps.median, reps.worst].filter(
    (symbol, index, arr): symbol is string =>
      !!symbol && arr.indexOf(symbol) === index
  );
  const rows = report.results.filter((r) => symbols.includes(r.symbol));
  const byTs = new Map<string, Record<string, number | string>>();
  for (const row of rows) {
    for (const point of row.equity_curve) {
      const item = byTs.get(point.timestamp) ?? { timestamp: point.timestamp };
      item[row.symbol] = point.equity;
      byTs.set(point.timestamp, item);
    }
  }
  return {
    symbols,
    chartData: [...byTs.values()].sort((a, b) =>
      String(a.timestamp).localeCompare(String(b.timestamp))
    ),
  };
}

function pct(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : `${value.toFixed(2)}%`;
}

function num(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : value.toFixed(2);
}

function returnTone(value: number | null | undefined) {
  if (value === null || value === undefined) return "";
  return value >= 0 ? "text-green-600" : "text-red-600";
}

function toneFor(value: number | null | undefined): "positive" | "negative" | "neutral" {
  if (value === null || value === undefined || value === 0) return "neutral";
  return value > 0 ? "positive" : "negative";
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 truncate font-medium">{value}</dd>
    </div>
  );
}

function MetricBox({
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

function SymbolCard({
  label,
  result,
  tone,
}: {
  label: string;
  result?: BatchBacktestSymbolResult;
  tone: "positive" | "negative" | "neutral";
}) {
  if (!result) {
    return (
      <div className="rounded-lg border border-dashed p-4">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="mt-2 text-sm font-medium">No successful result</p>
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
          {tone === "positive" ? "leader" : tone === "negative" ? "risk" : "median"}
        </Badge>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <Metric label="Return" value={pct(result.total_return_pct)} />
        <Metric label="Sharpe" value={num(result.sharpe)} />
        <Metric label="Max DD" value={pct(result.max_drawdown_pct)} />
        <Metric label="Win rate" value={pct(result.win_rate_pct)} />
      </dl>
    </div>
  );
}

function EmptyPanel({ text }: { text: string }) {
  return (
    <div className="flex h-full min-h-48 items-center justify-center rounded-lg border border-dashed px-4 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}
