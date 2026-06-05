"use client";

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

import { EmptyState } from "@/components/workbench";
import { useI18n } from "@/lib/i18n/client";
import { formatCurrency } from "@/lib/i18n/format";
import type { MarketBarSeries } from "@/types";

const COLORS = ["#2563eb", "#16a34a", "#dc2626", "#d97706", "#7c3aed"];
const INITIAL_CHART_DIMENSION = { width: 600, height: 320 };

function buildChartData(series: MarketBarSeries[]) {
  const byTimestamp = new Map<string, Record<string, number | string>>();

  for (const item of series) {
    for (const bar of item.bars) {
      const row = byTimestamp.get(bar.timestamp) ?? { timestamp: bar.timestamp };
      row[item.symbol] = bar.close;
      byTimestamp.set(bar.timestamp, row);
    }
  }

  return [...byTimestamp.values()].sort((a, b) =>
    String(a.timestamp).localeCompare(String(b.timestamp))
  );
}

export function PositionPriceHistoryChart({
  series,
}: {
  series: MarketBarSeries[];
}) {
  const { locale, t } = useI18n();
  const symbols = series.map((item) => item.symbol);
  const chartData = buildChartData(series);

  if (symbols.length === 0 || chartData.length === 0) {
    return <EmptyState>{t.pages.overview.couldNotLoadPriceHistory}</EmptyState>;
  }

  return (
    <div className="h-72 w-full md:h-80">
      <ResponsiveContainer
        width="100%"
        height="100%"
        minWidth={0}
        minHeight={288}
        initialDimension={INITIAL_CHART_DIMENSION}
      >
        <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis
            dataKey="timestamp"
            tickFormatter={(value: string) => value.slice(0, 10)}
            minTickGap={40}
            fontSize={12}
          />
          <YAxis
            domain={["auto", "auto"]}
            tickFormatter={(value: number) =>
              formatCurrency(value, locale, {
                notation: "compact",
                maximumFractionDigits: 0,
              })
            }
            width={52}
            fontSize={12}
          />
          <Tooltip
            formatter={(value, name) => [
              formatCurrency(Number(value ?? 0), locale, {
                maximumFractionDigits: Number(value ?? 0) >= 1000 ? 0 : 2,
              }),
              String(name),
            ]}
            labelFormatter={(label) => String(label).slice(0, 10)}
          />
          <Legend />
          {symbols.map((symbol, index) => (
            <Line
              key={symbol}
              type="monotone"
              dataKey={symbol}
              name={symbol}
              stroke={COLORS[index % COLORS.length]}
              strokeWidth={2}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
