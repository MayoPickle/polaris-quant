import type { StrategyDescriptor } from "@/types";

import type { ParamSpec } from "./types";

export const HOURLY_SCHEDULE = "55 10-15 * * mon-fri";

export function paramsFor(strategy?: StrategyDescriptor): Record<string, number> {
  const props = (strategy?.param_schema?.properties as Record<string, ParamSpec>) ?? {};
  const out: Record<string, number> = {};
  for (const [name, spec] of Object.entries(props)) {
    if (typeof spec.default === "number") out[name] = spec.default;
  }
  return out;
}

export function parseSymbols(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[,\s]+/)
        .map((symbol) => symbol.trim().toUpperCase())
        .filter(Boolean)
    )
  );
}
