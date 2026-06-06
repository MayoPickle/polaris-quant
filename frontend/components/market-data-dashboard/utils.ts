import type { Locale } from "@/lib/i18n/config";

import type { MarketDataIngestionJob, MarketDataIngestionStatus } from "@/types";

export function progressPct(job: MarketDataIngestionJob): number {
  if (job.total_work_units <= 0) {
    return job.status === "completed" ? 100 : 0;
  }
  return Math.min(
    100,
    Math.round((job.completed_work_units / job.total_work_units) * 100)
  );
}

export function statusVariant(
  status: MarketDataIngestionStatus
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "completed" || status === "running") return "default";
  if (status === "failed") return "destructive";
  if (status === "pausing" || status === "paused") return "secondary";
  return "outline";
}

export function activeJob(job: MarketDataIngestionJob): boolean {
  return ["queued", "running", "pausing"].includes(job.status);
}

export function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale).format(value);
}

export function parseSymbols(value: string): string[] {
  const seen = new Set<string>();
  return value
    .split(/[\s,;]+/)
    .map((symbol) => symbol.trim().toUpperCase())
    .filter((symbol) => {
      if (!symbol || seen.has(symbol)) return false;
      seen.add(symbol);
      return true;
    });
}
