"use client";

import { Database, RefreshCw } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, WorkbenchPanel } from "@/components/workbench";
import { useI18n } from "@/lib/i18n/client";
import type { MarketDataIngestionJobCreate } from "@/types";

import { parseSymbols } from "./utils";

type FormState = {
  kind: "backfill" | "daily_sync" | "repair";
  provider: string;
  feed: string;
  timeframe: "1Min" | "1Hour" | "1Day";
  adjustment: string;
  start: string;
  end: string;
  symbols: string;
};

const DEFAULT_FORM: FormState = {
  kind: "backfill",
  provider: "alpaca",
  feed: "sip",
  timeframe: "1Min",
  adjustment: "split",
  start: "2016-01-01T09:30",
  end: "",
  symbols: "",
};

export function MarketDataControlPanel({
  loading,
  onCreate,
  onRefreshAssets,
}: {
  loading: boolean;
  onCreate: (payload: MarketDataIngestionJobCreate) => Promise<void>;
  onRefreshAssets: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);

  async function submit() {
    const symbols = parseSymbols(form.symbols);
    if (largeJobNeedsConfirmation(form, symbols) && !window.confirm(t.marketData.confirmLargeJob)) {
      return;
    }
    await onCreate({
      kind: form.kind,
      provider: form.provider || null,
      feed: form.feed || null,
      timeframe: form.timeframe,
      adjustment: form.adjustment || null,
      symbols,
      start_ts: form.start ? new Date(form.start).toISOString() : null,
      end_ts: form.end ? new Date(form.end).toISOString() : null,
    });
  }

  return (
    <WorkbenchPanel
      title={t.marketData.operationsTitle}
      description={t.marketData.operationsDescription}
      actions={
        <Button variant="outline" size="sm" disabled={loading} onClick={onRefreshAssets}>
          <RefreshCw data-icon="inline-start" />
          {t.marketData.refreshAssets}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Field label={t.marketData.jobKind}>
            <select
              value={form.kind}
              onChange={(event) => setForm({ ...form, kind: event.target.value as FormState["kind"] })}
              className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
            >
              <option value="backfill">backfill</option>
              <option value="daily_sync">daily_sync</option>
              <option value="repair">repair</option>
            </select>
          </Field>
          <Field label={t.marketData.provider}>
            <input
              value={form.provider}
              onChange={(event) => setForm({ ...form, provider: event.target.value })}
              className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
            />
          </Field>
          <Field label={t.marketData.feed}>
            <select
              value={form.feed}
              onChange={(event) => setForm({ ...form, feed: event.target.value })}
              className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
            >
              <option value="sip">sip</option>
              <option value="iex">iex</option>
            </select>
          </Field>
          <Field label={t.marketData.timeframe}>
            <select
              value={form.timeframe}
              onChange={(event) => setForm({ ...form, timeframe: event.target.value as FormState["timeframe"] })}
              className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
            >
              <option value="1Min">1Min</option>
              <option value="1Hour">1Hour</option>
              <option value="1Day">1Day</option>
            </select>
          </Field>
          <Field label={t.marketData.adjustment}>
            <select
              value={form.adjustment}
              onChange={(event) => setForm({ ...form, adjustment: event.target.value })}
              className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
            >
              <option value="split">split</option>
              <option value="raw">raw</option>
              <option value="all">all</option>
            </select>
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t.marketData.start}>
            <input
              type="datetime-local"
              value={form.start}
              onChange={(event) => setForm({ ...form, start: event.target.value })}
              className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
            />
          </Field>
          <Field label={t.marketData.end}>
            <input
              type="datetime-local"
              value={form.end}
              onChange={(event) => setForm({ ...form, end: event.target.value })}
              className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
            />
          </Field>
        </div>

        <Field label={t.marketData.symbols}>
          <textarea
            value={form.symbols}
            onChange={(event) => setForm({ ...form, symbols: event.target.value })}
            placeholder={t.marketData.symbolsPlaceholder}
            className="min-h-28 w-full resize-y rounded-lg border bg-background px-3 py-2 text-sm uppercase"
          />
        </Field>
        <p className="text-xs leading-5 text-muted-foreground">{t.marketData.allAssetsHint}</p>

        <Button disabled={loading} onClick={submit}>
          <Database data-icon="inline-start" />
          {t.marketData.createJob}
        </Button>
      </div>
    </WorkbenchPanel>
  );
}

function largeJobNeedsConfirmation(form: FormState, symbols: string[]) {
  if (symbols.length === 0) return true;
  if (!form.start || !form.end) return true;
  const days = Math.abs(new Date(form.end).getTime() - new Date(form.start).getTime()) / 86_400_000;
  return days > 365 || symbols.length > 100;
}
