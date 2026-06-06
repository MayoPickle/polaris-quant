import type { BatchBacktestJob, StrategyDescriptor } from "@/types";

import { FINAL_STATUSES } from "./constants";
import type { ParamSpec } from "./types";

export function paramsFor(s?: StrategyDescriptor): Record<string, number> {
  const props = (s?.param_schema?.properties as Record<string, ParamSpec>) ?? {};
  const out: Record<string, number> = {};
  for (const [name, spec] of Object.entries(props)) {
    if (typeof spec.default === "number") out[name] = spec.default;
  }
  return out;
}

export function isRunning(job: BatchBacktestJob | null): boolean {
  return !!job && !FINAL_STATUSES.has(job.status);
}

