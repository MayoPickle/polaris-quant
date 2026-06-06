"use client";

import { useState } from "react";

import {
  DEFAULT_POSITION_SIZING,
  PositionSizingFields,
} from "@/components/position-sizing-fields";
import { Button } from "@/components/ui/button";
import { Field, WorkbenchPanel } from "@/components/workbench";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n/client";
import type { BacktestResult, StrategyDescriptor } from "@/types";

import { CompareResults } from "./backtest-compare/results";
import { CompareRunEditor } from "./backtest-compare/run-editor";
import type { CompareRow } from "./backtest-compare/types";
import { initialRows, labelFor, makeRow, paramsFor } from "./backtest-compare/utils";

export function BacktestCompare({ strategies }: { strategies: StrategyDescriptor[] }) {
  const { t } = useI18n();
  const [rows, setRows] = useState<CompareRow[]>(() => initialRows(strategies));
  const [lookback, setLookback] = useState(365);
  const [positionSizing, setPositionSizing] = useState(DEFAULT_POSITION_SIZING);
  const [results, setResults] = useState<BacktestResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(id: number, patch: Partial<CompareRow>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function changeStrategy(id: number, key: string) {
    update(id, { strategyKey: key, params: paramsFor(strategies.find((s) => s.key === key)) });
  }

  async function run() {
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const res = await api.backtestCompare({
        lookback_days: lookback,
        position_sizing: positionSizing,
        timeframe: "1Day",
        runs: rows.map((r) => ({
          label: labelFor(r),
          strategy_key: r.strategyKey,
          params: r.params,
          symbol: r.symbol.trim().toUpperCase(),
        })),
      });
      setResults(res.results);
    } catch {
      setError(t.backtestCompare.error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <WorkbenchPanel
      title={t.backtestCompare.title}
      description={t.backtestCompare.description}
      contentClassName="flex flex-col gap-5"
    >
      <CompareRunEditor
        rows={rows}
        strategies={strategies}
        onRemove={(id) => setRows((rs) => rs.filter((r) => r.id !== id))}
        onStrategyChange={changeStrategy}
        onUpdate={update}
      />

      <div className="grid gap-3 md:flex md:flex-wrap md:items-end">
        <Field label={t.backtestCompare.lookback} className="md:w-28">
          <input
            type="number"
            value={lookback}
            onChange={(e) => setLookback(Number(e.target.value))}
            className="h-10 w-full rounded-lg border bg-background px-3 text-sm md:h-9"
          />
        </Field>
        {rows.length < 6 && (
          <Button
            variant="outline"
            className="w-full md:w-auto"
            onClick={() => setRows((rs) => [...rs, makeRow(strategies)])}
          >
            + {t.backtestCompare.addRun}
          </Button>
        )}
        <Button onClick={() => void run()} disabled={loading} className="w-full md:w-auto">
          {loading ? t.common.running : t.backtestCompare.runComparison}
        </Button>
      </div>

      <PositionSizingFields
        value={positionSizing}
        onChange={setPositionSizing}
        className="xl:grid-cols-6"
      />

      {error && <p className="text-sm text-red-600">{error}</p>}
      <CompareResults results={results} />
    </WorkbenchPanel>
  );
}

