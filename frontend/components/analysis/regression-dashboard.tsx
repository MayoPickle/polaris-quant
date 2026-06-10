"use client";

import { type FormEvent, useMemo, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { chartTooltipProps } from "@/components/chart-tooltip";
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { EmptyState, Field, MetricGrid, MetricTile, WorkbenchPanel } from "@/components/workbench";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n/client";
import type { Locale } from "@/lib/i18n/config";
import { formatCurrency, formatDateTime, formatPercent } from "@/lib/i18n/format";
import { cn } from "@/lib/utils";
import type { MarketBar, MarketBarsResponse } from "@/types";

import {
  fitRegression,
  regressionSourcePoints,
  type RegressionModel,
  type RegressionPoint,
  type RegressionResult,
} from "./regression-utils";

type Timeframe = "1Min" | "1Hour" | "1Day";
type AnalysisRange = "1D" | "1W" | "1M" | "3M" | "6M" | "1Y" | "5Y" | "10Y";

const DEFAULT_SYMBOL = "AAPL";
const DEFAULT_TIMEFRAME: Timeframe = "1Day";
const DEFAULT_RANGE: AnalysisRange = "3M";
const SYMBOL_RE = /^[A-Z][A-Z0-9.-]{0,14}$/;
const INITIAL_CHART_DIMENSION = { width: 860, height: 360 };
const INITIAL_RESIDUAL_DIMENSION = { width: 860, height: 240 };
const CHART_COLORS = {
  axis: "var(--muted-foreground)",
  border: "var(--border)",
};
const CHART_AXIS_TICK = {
  fill: CHART_COLORS.axis,
  fontSize: 12,
};
const CHART_AXIS_LINE = { stroke: CHART_COLORS.border };
const MODELS: RegressionModel[] = [
  "linear",
  "quadratic",
  "exponential",
  "logarithmic",
];
const RANGES: AnalysisRange[] = ["1D", "1W", "1M", "3M", "6M", "1Y", "5Y", "10Y"];

type RegressionDashboardProps = {
  initialBars: MarketBarsResponse | null;
  initialSymbol?: string;
  initialRange?: AnalysisRange;
};

export function RegressionDashboard({
  initialBars,
  initialSymbol = DEFAULT_SYMBOL,
  initialRange = DEFAULT_RANGE,
}: RegressionDashboardProps) {
  const { locale, t } = useI18n();
  const labels = t.pages.analysis;
  const [symbolInput, setSymbolInput] = useState(initialSymbol);
  const [range, setRange] = useState<AnalysisRange>(initialRange);
  const [timeframe, setTimeframe] = useState<Timeframe>(() =>
    normalizeTimeframe(initialBars?.timeframe)
  );
  const [model, setModel] = useState<RegressionModel>("linear");
  const [bars, setBars] = useState<MarketBar[]>(() =>
    barsForSymbol(initialBars, initialSymbol)
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sourcePoints = useMemo(() => regressionSourcePoints(bars), [bars]);
  const regression = useMemo(() => fitRegression(bars, model), [bars, model]);
  const recentRows = useMemo(
    () => regression?.points.slice(-20).reverse() ?? [],
    [regression]
  );
  const emptyLabel =
    sourcePoints.length === 0 ? labels.noBars : labels.insufficientData;
  const modelBadge = modelLabel(model, labels);

  async function loadBars(
    symbol: string,
    nextRange: AnalysisRange
  ) {
    setLoading(true);
    setError(null);
    const window = rangeWindow(nextRange);
    try {
      const response = await api.marketBars([symbol], {
        timeframe: window.timeframe,
        start_date: window.startDate,
        end_date: window.endDate,
      });
      setBars(barsForSymbol(response, symbol));
      setTimeframe(normalizeTimeframe(response.timeframe));
      setSymbolInput(symbol);
    } catch (exc) {
      setBars([]);
      setError(exc instanceof Error ? exc.message : labels.barsError);
    } finally {
      setLoading(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextSymbol = symbolInput.trim().toUpperCase();
    if (!SYMBOL_RE.test(nextSymbol)) {
      setError(labels.invalidSymbol);
      return;
    }

    void loadBars(nextSymbol, range);
  }

  function changeRange(values: string[]) {
    const nextRange = values[0] as AnalysisRange | undefined;
    if (!nextRange || !RANGES.includes(nextRange)) return;
    setRange(nextRange);

    const nextSymbol = symbolInput.trim().toUpperCase();
    if (!SYMBOL_RE.test(nextSymbol)) {
      setError(labels.invalidSymbol);
      return;
    }

    void loadBars(nextSymbol, nextRange);
  }

  function changeModel(values: string[]) {
    const nextModel = values[0] as RegressionModel | undefined;
    if (!nextModel || !MODELS.includes(nextModel)) return;
    setModel(nextModel);
  }

  return (
    <div className="flex flex-col gap-4 md:gap-5">
      <WorkbenchPanel
        title={labels.controlsTitle}
        description={labels.controlsDescription}
        actions={
          <Badge variant="secondary">
            {formatCount(sourcePoints.length, locale)} {labels.barsLoaded}
          </Badge>
        }
      >
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="grid gap-3 xl:grid-cols-[minmax(16rem,0.7fr)_minmax(0,1.3fr)]">
            <Field label={labels.symbol}>
              <div className="flex h-10 min-w-0 items-center gap-2 rounded-lg border bg-background px-3 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/20">
                <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <input
                  value={symbolInput}
                  onChange={(event) => setSymbolInput(event.target.value.toUpperCase())}
                  placeholder={labels.symbolPlaceholder}
                  className="h-full min-w-0 flex-1 bg-transparent font-mono text-sm font-semibold uppercase text-foreground placeholder:text-muted-foreground"
                  aria-label={labels.symbol}
                />
                <Button type="submit" size="sm" disabled={loading}>
                  <RefreshCw
                    data-icon="inline-start"
                    className={cn(loading && "animate-spin")}
                  />
                  {loading ? labels.loading : labels.load}
                </Button>
              </div>
            </Field>

            <ToggleField label={labels.range}>
              <ToggleGroup
                value={[range]}
                onValueChange={changeRange}
                variant="outline"
                size="sm"
                spacing={0}
                aria-label={labels.range}
                className="flex w-full flex-wrap"
              >
                {RANGES.map((item) => (
                  <ToggleGroupItem
                    key={item}
                    value={item}
                    className="min-w-[4.25rem] flex-1 font-mono"
                  >
                    {rangeLabel(item, labels)}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </ToggleField>
          </div>

          <ToggleField label={labels.model}>
            <ToggleGroup
              value={[model]}
              onValueChange={changeModel}
              variant="outline"
              size="sm"
              spacing={0}
              aria-label={labels.model}
              className="flex w-full flex-wrap"
            >
              {MODELS.map((item) => (
                <ToggleGroupItem
                  key={item}
                  value={item}
                  className="min-w-[7rem] flex-1"
                >
                  {modelLabel(item, labels)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </ToggleField>

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
        </form>
      </WorkbenchPanel>

      <MetricGrid>
        <MetricTile
          label={labels.rSquared}
          value={regression ? formatDecimal(regression.r2, locale, 4) : "-"}
          detail={modelBadge}
          tone={regression && regression.r2 >= 0.8 ? "positive" : "neutral"}
        />
        <MetricTile
          label={labels.rmse}
          value={regression ? formatCurrency(regression.rmse, locale) : "-"}
          detail={labels.errorAverage}
          tone="info"
        />
        <MetricTile
          label={labels.mae}
          value={regression ? formatCurrency(regression.mae, locale) : "-"}
          detail={labels.absoluteResidual}
        />
        <MetricTile
          label={labels.fittedChange}
          value={
            regression?.fittedChangePct == null
              ? "-"
              : formatPercent(regression.fittedChangePct, locale)
          }
          detail={labels.windowChange}
          tone={
            regression?.fittedChangePct == null
              ? "neutral"
              : regression.fittedChangePct >= 0
                ? "positive"
                : "negative"
          }
        />
      </MetricGrid>

      <WorkbenchPanel
        title={labels.chartTitle}
        description={labels.chartDescription}
        actions={
          regression && (
            <Badge variant="outline" className="max-w-full font-mono">
              <span className="truncate">
                {labels.formula}: {regression.formula}
              </span>
            </Badge>
          )
        }
      >
        {regression ? (
          <RegressionChart
            result={regression}
            locale={locale}
            timeframe={timeframe}
            closeLabel={labels.close}
            fittedLabel={labels.fitted}
            residualLabel={labels.residual}
          />
        ) : (
          <EmptyState>{emptyLabel}</EmptyState>
        )}
      </WorkbenchPanel>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(24rem,0.8fr)]">
        <WorkbenchPanel
          title={labels.residualTitle}
          description={labels.residualDescription}
        >
          {regression ? (
            <ResidualChart
              points={regression.points}
              locale={locale}
              timeframe={timeframe}
              residualLabel={labels.residual}
            />
          ) : (
            <EmptyState>{emptyLabel}</EmptyState>
          )}
        </WorkbenchPanel>

        <WorkbenchPanel
          title={labels.tableTitle}
          description={labels.tableDescription}
          contentClassName="p-0"
        >
          {recentRows.length > 0 ? (
            <RegressionRowsTable
              rows={recentRows}
              locale={locale}
              labels={labels}
            />
          ) : (
            <div className="p-4">
              <EmptyState>{emptyLabel}</EmptyState>
            </div>
          )}
        </WorkbenchPanel>
      </div>

      <p className="text-xs leading-5 text-muted-foreground">{labels.dataNote}</p>
    </div>
  );
}

function ToggleField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="truncate text-xs font-medium text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}

function RegressionChart({
  result,
  locale,
  timeframe,
  closeLabel,
  fittedLabel,
  residualLabel,
}: {
  result: RegressionResult;
  locale: Locale;
  timeframe: Timeframe;
  closeLabel: string;
  fittedLabel: string;
  residualLabel: string;
}) {
  return (
    <div className="h-72 w-full md:h-80">
      <ResponsiveContainer
        width="100%"
        height="100%"
        minWidth={0}
        minHeight={288}
        initialDimension={INITIAL_CHART_DIMENSION}
      >
        <LineChart
          data={result.points}
          margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke={CHART_COLORS.border}
            strokeOpacity={0.7}
          />
          <XAxis
            dataKey="timestamp"
            tickFormatter={(value: string) => formatAxisTime(value, locale, timeframe)}
            minTickGap={42}
            fontSize={12}
            tick={CHART_AXIS_TICK}
            axisLine={CHART_AXIS_LINE}
            tickLine={CHART_AXIS_LINE}
          />
          <YAxis
            domain={["auto", "auto"]}
            tickFormatter={(value: number) =>
              formatCurrency(value, locale, {
                notation: "compact",
                maximumFractionDigits: 0,
              })
            }
            width={54}
            fontSize={12}
            tick={CHART_AXIS_TICK}
            axisLine={CHART_AXIS_LINE}
            tickLine={CHART_AXIS_LINE}
          />
          <Tooltip
            {...chartTooltipProps}
            formatter={(value, name) => [
              formatCurrency(Number(value ?? 0), locale),
              tooltipName(String(name), closeLabel, fittedLabel, residualLabel),
            ]}
            labelFormatter={(label) => formatDateTime(String(label), locale)}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="close"
            name={closeLabel}
            stroke="var(--primary)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="fitted"
            name={fittedLabel}
            stroke="var(--muted-foreground)"
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function ResidualChart({
  points,
  locale,
  timeframe,
  residualLabel,
}: {
  points: RegressionPoint[];
  locale: Locale;
  timeframe: Timeframe;
  residualLabel: string;
}) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer
        width="100%"
        height="100%"
        minWidth={0}
        minHeight={224}
        initialDimension={INITIAL_RESIDUAL_DIMENSION}
      >
        <LineChart data={points} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke={CHART_COLORS.border}
            strokeOpacity={0.7}
          />
          <XAxis
            dataKey="timestamp"
            tickFormatter={(value: string) => formatAxisTime(value, locale, timeframe)}
            minTickGap={42}
            fontSize={12}
            tick={CHART_AXIS_TICK}
            axisLine={CHART_AXIS_LINE}
            tickLine={CHART_AXIS_LINE}
          />
          <YAxis
            tickFormatter={(value: number) =>
              formatCurrency(value, locale, {
                notation: "compact",
                maximumFractionDigits: 1,
              })
            }
            width={54}
            fontSize={12}
            tick={CHART_AXIS_TICK}
            axisLine={CHART_AXIS_LINE}
            tickLine={CHART_AXIS_LINE}
          />
          <Tooltip
            {...chartTooltipProps}
            formatter={(value) => [formatCurrency(Number(value ?? 0), locale), residualLabel]}
            labelFormatter={(label) => formatDateTime(String(label), locale)}
          />
          <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeDasharray="4 4" />
          <Line
            type="monotone"
            dataKey="residual"
            name={residualLabel}
            stroke="var(--destructive)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function RegressionRowsTable({
  rows,
  locale,
  labels,
}: {
  rows: RegressionPoint[];
  locale: Locale;
  labels: {
    timestamp: string;
    close: string;
    fitted: string;
    residual: string;
    residualPct: string;
  };
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{labels.timestamp}</TableHead>
          <TableHead className="text-right">{labels.close}</TableHead>
          <TableHead className="text-right">{labels.fitted}</TableHead>
          <TableHead className="text-right">{labels.residual}</TableHead>
          <TableHead className="text-right">{labels.residualPct}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.timestamp}>
            <TableCell className="font-mono text-xs">
              {formatDateTime(row.timestamp, locale)}
            </TableCell>
            <TableCell className="text-right font-mono">
              {formatCurrency(row.close, locale)}
            </TableCell>
            <TableCell className="text-right font-mono">
              {formatCurrency(row.fitted, locale)}
            </TableCell>
            <TableCell
              className={cn(
                "text-right font-mono",
                row.residual > 0 && "text-green-600",
                row.residual < 0 && "text-red-600"
              )}
            >
              {formatCurrency(row.residual, locale)}
            </TableCell>
            <TableCell className="text-right font-mono">
              {row.residualPct == null ? "-" : formatPercent(row.residualPct, locale)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function barsForSymbol(response: MarketBarsResponse | null, symbol: string): MarketBar[] {
  return (
    response?.series.find((item) => item.symbol === symbol.toUpperCase())?.bars ?? []
  );
}

function normalizeTimeframe(value: string | null | undefined): Timeframe {
  if (value === "1Min" || value === "1Hour" || value === "1Day") return value;
  return DEFAULT_TIMEFRAME;
}

function rangeWindow(range: AnalysisRange) {
  const end = new Date();
  const start = new Date(end);
  const timeframe = timeframeForRange(range);

  switch (range) {
    case "1D":
      break;
    case "1W":
      start.setUTCDate(start.getUTCDate() - 6);
      break;
    case "1M":
      start.setUTCMonth(start.getUTCMonth() - 1);
      break;
    case "3M":
      start.setUTCMonth(start.getUTCMonth() - 3);
      break;
    case "6M":
      start.setUTCMonth(start.getUTCMonth() - 6);
      break;
    case "1Y":
      start.setUTCFullYear(start.getUTCFullYear() - 1);
      break;
    case "5Y":
      start.setUTCFullYear(start.getUTCFullYear() - 5);
      break;
    case "10Y":
      start.setUTCFullYear(start.getUTCFullYear() - 10);
      break;
  }

  return {
    startDate: dateInputValue(start),
    endDate: dateInputValue(end),
    timeframe,
  };
}

function timeframeForRange(range: AnalysisRange): Timeframe {
  if (range === "1D") return "1Min";
  if (range === "1W") return "1Hour";
  return "1Day";
}

function modelLabel(
  model: RegressionModel,
  labels: {
    modelLinear: string;
    modelQuadratic: string;
    modelExponential: string;
    modelLogarithmic: string;
  }
) {
  switch (model) {
    case "linear":
      return labels.modelLinear;
    case "quadratic":
      return labels.modelQuadratic;
    case "exponential":
      return labels.modelExponential;
    case "logarithmic":
      return labels.modelLogarithmic;
  }
}

function rangeLabel(
  range: AnalysisRange,
  labels: Record<
    | "rangeOneDay"
    | "rangeOneWeek"
    | "rangeOneMonth"
    | "rangeThreeMonths"
    | "rangeSixMonths"
    | "rangeOneYear"
    | "rangeFiveYears"
    | "rangeTenYears",
    string
  >
) {
  switch (range) {
    case "1D":
      return labels.rangeOneDay;
    case "1W":
      return labels.rangeOneWeek;
    case "1M":
      return labels.rangeOneMonth;
    case "3M":
      return labels.rangeThreeMonths;
    case "6M":
      return labels.rangeSixMonths;
    case "1Y":
      return labels.rangeOneYear;
    case "5Y":
      return labels.rangeFiveYears;
    case "10Y":
      return labels.rangeTenYears;
  }
}

function tooltipName(
  value: string,
  closeLabel: string,
  fittedLabel: string,
  residualLabel: string
) {
  if (value === "close") return closeLabel;
  if (value === "fitted") return fittedLabel;
  if (value === "residual") return residualLabel;
  return value;
}

function formatAxisTime(value: string, locale: Locale, timeframe: Timeframe) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  if (timeframe === "1Day") {
    return date.toLocaleDateString(locale, { month: "short", day: "numeric" });
  }
  return date.toLocaleString(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDecimal(value: number, locale: Locale, maximumFractionDigits: number) {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits,
    minimumFractionDigits: Math.min(2, maximumFractionDigits),
  }).format(value);
}

function formatCount(value: number, locale: Locale) {
  return new Intl.NumberFormat(locale).format(value);
}

function dateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}
