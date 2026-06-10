"use client";

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

import { chartTooltipProps } from "@/components/chart-tooltip";
import { useI18n } from "@/lib/i18n/client";
import { formatCurrency } from "@/lib/i18n/format";
import type { BatchBacktestReport } from "@/types";

import { COLORS } from "./constants";
import { EmptyPanel } from "./metric-blocks";
import { representativeChartData } from "./summary-utils";

export function BatchReportCharts({ report }: { report: BatchBacktestReport }) {
  const { locale, t } = useI18n();
  const usd = (n: number) =>
    formatCurrency(n, locale, { maximumFractionDigits: 0 });
  const { chartData, symbols } = representativeChartData(report);
  const distribution = report.summary.return_distribution ?? [];

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-3 rounded-lg border p-3 md:p-4">
        <div>
          <h4 className="text-sm font-semibold">{t.batchBacktest.representativeCurves}</h4>
          <p className="mt-1 text-xs text-muted-foreground">
            {t.batchBacktest.representativeCurvesDescription}
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
                  {...chartTooltipProps}
                  formatter={(value) => [
                    usd(Number(value ?? 0)),
                    t.batchBacktest.equity,
                  ]}
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
            <EmptyPanel text={t.batchBacktest.noCurves} />
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-3 rounded-lg border p-3 md:p-4">
        <div>
          <h4 className="text-sm font-semibold">{t.batchBacktest.returnDistribution}</h4>
          <p className="mt-1 text-xs text-muted-foreground">
            {t.batchBacktest.returnDistributionDescription}
          </p>
        </div>
        <div className="h-64 min-w-0 sm:h-72">
          {distribution.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={distribution} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="range" fontSize={11} minTickGap={16} />
                <YAxis allowDecimals={false} fontSize={12} width={36} />
                <Tooltip {...chartTooltipProps} />
                <Bar dataKey="count" name={t.batchBacktest.symbols} fill="var(--color-primary)" radius={4} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyPanel text={t.batchBacktest.noDistribution} />
          )}
        </div>
      </div>
    </div>
  );
}
