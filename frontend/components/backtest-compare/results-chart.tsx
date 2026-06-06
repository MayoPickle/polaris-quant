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

import { useI18n } from "@/lib/i18n/client";
import { formatCurrency } from "@/lib/i18n/format";
import type { BacktestResult } from "@/types";

import { COLORS } from "./constants";
import { equityChartData } from "./utils";

export function CompareResultsChart({
  results,
}: {
  results: BacktestResult[];
}) {
  const { locale, t } = useI18n();
  const usd = (n: number) =>
    formatCurrency(n, locale, { maximumFractionDigits: 0 });

  return (
    <div className="h-64 w-full md:h-80">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={equityChartData(results)}
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
  );
}

