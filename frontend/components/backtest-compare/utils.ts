import type { BacktestResult, StrategyDescriptor } from "@/types";

import type { CompareRow, ParamSpec } from "./types";

let nextId = 1;

export function paramsFor(s?: StrategyDescriptor): Record<string, number> {
  const props = (s?.param_schema?.properties as Record<string, ParamSpec>) ?? {};
  const out: Record<string, number> = {};
  for (const [name, spec] of Object.entries(props)) {
    if (typeof spec.default === "number") out[name] = spec.default;
  }
  return out;
}

export function makeRow(strategies: StrategyDescriptor[], symbol = "AAPL"): CompareRow {
  const s = strategies[0];
  return { id: nextId++, strategyKey: s?.key ?? "", symbol, params: paramsFor(s) };
}

export function initialRows(strategies: StrategyDescriptor[]) {
  return [
    makeRow(strategies),
    { ...makeRow(strategies), params: { ...paramsFor(strategies[0]), fast: 20, slow: 50 } },
    { ...makeRow(strategies), params: { ...paramsFor(strategies[0]), fast: 5, slow: 20 } },
  ];
}

export function labelFor(row: CompareRow): string {
  const vals = Object.entries(row.params)
    .filter(([k]) => k !== "qty")
    .map(([, v]) => v)
    .join("/");
  return `${row.symbol.toUpperCase()} ${row.strategyKey} ${vals}`.trim();
}

export function equityChartData(results: BacktestResult[] | null) {
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
}

