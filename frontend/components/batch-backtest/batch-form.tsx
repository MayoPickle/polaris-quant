"use client";

import type { ChangeEvent } from "react";

import { PositionSizingFields } from "@/components/position-sizing-fields";
import { Field } from "@/components/workbench";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import type { BacktestUniverse, PositionSizingConfig, StrategyDescriptor } from "@/types";

import { BatchFormActions } from "./batch-form-actions";
import type { ParamSpec } from "./types";

type BatchFormProps = {
  batchRunning: boolean;
  fileName: string;
  initialCapital: number;
  jobId?: string;
  loading: boolean;
  lookback: number;
  params: Record<string, number>;
  positionSizing: PositionSizingConfig;
  props: Record<string, ParamSpec>;
  selectedUniverses: string[];
  strategies: StrategyDescriptor[];
  strategyKey: string;
  symbolsText: string;
  timeframe: string;
  universes: BacktestUniverse[];
  onCancel: () => void;
  onFileImport: (event: ChangeEvent<HTMLInputElement>) => void;
  onInitialCapitalChange: (value: number) => void;
  onLookbackChange: (value: number) => void;
  onParamChange: (name: string, value: number) => void;
  onPositionSizingChange: (value: PositionSizingConfig) => void;
  onRefresh: (jobId: string) => void;
  onStart: () => void;
  onStrategyChange: (key: string) => void;
  onSymbolsTextChange: (value: string) => void;
  onTimeframeChange: (value: string) => void;
  onUniverseToggle: (key: string) => void;
};

export function BatchForm({
  batchRunning,
  fileName,
  initialCapital,
  jobId,
  loading,
  lookback,
  params,
  positionSizing,
  props,
  selectedUniverses,
  strategies,
  strategyKey,
  symbolsText,
  timeframe,
  universes,
  onCancel,
  onFileImport,
  onInitialCapitalChange,
  onLookbackChange,
  onParamChange,
  onPositionSizingChange,
  onRefresh,
  onStart,
  onStrategyChange,
  onSymbolsTextChange,
  onTimeframeChange,
  onUniverseToggle,
}: BatchFormProps) {
  const { t } = useI18n();

  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-muted/15 p-3 md:p-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Field label={t.batchBacktest.strategy}>
          <select
            value={strategyKey}
            onChange={(e) => onStrategyChange(e.target.value)}
            className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
          >
            {strategies.map((s) => (
              <option key={s.key} value={s.key}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t.batchBacktest.timeframe}>
          <select
            value={timeframe}
            onChange={(e) => onTimeframeChange(e.target.value)}
            className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
          >
            <option value="1Day">{t.batchBacktest.daily}</option>
            <option value="1Hour">{t.batchBacktest.hourly}</option>
            <option value="1Min">{t.batchBacktest.minute}</option>
          </select>
        </Field>
        <Field label={t.batchBacktest.lookbackDays}>
          <input
            type="number"
            min={5}
            max={2000}
            value={lookback}
            onChange={(e) => onLookbackChange(Number(e.target.value))}
            className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
          />
        </Field>
        <Field label={t.batchBacktest.initialCapital}>
          <input
            type="number"
            min={1}
            value={initialCapital}
            onChange={(e) => onInitialCapitalChange(Number(e.target.value))}
            className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
          />
        </Field>
      </div>

      <PositionSizingFields
        value={positionSizing}
        onChange={onPositionSizingChange}
        className="xl:grid-cols-6"
      />

      {Object.keys(props).length > 0 && (
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
          {Object.entries(props).map(([name, spec]) => (
            <Field key={name} label={spec.title ?? name}>
              <input
                type="number"
                value={params[name] ?? ""}
                onChange={(e) => onParamChange(name, Number(e.target.value))}
                className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
              />
            </Field>
          ))}
        </div>
      )}

      <UniversePicker
        selectedUniverses={selectedUniverses}
        universes={universes}
        onUniverseToggle={onUniverseToggle}
      />

      <Field label={t.batchBacktest.importedSymbols}>
        <textarea
          value={symbolsText}
          onChange={(e) => onSymbolsTextChange(e.target.value)}
          placeholder={t.batchBacktest.importedSymbolsPlaceholder}
          className="min-h-32 w-full resize-y rounded-lg border bg-background px-3 py-2 text-sm uppercase"
        />
      </Field>

      <BatchFormActions
        batchRunning={batchRunning}
        fileName={fileName}
        jobId={jobId}
        loading={loading}
        strategyKey={strategyKey}
        onCancel={onCancel}
        onFileImport={onFileImport}
        onRefresh={onRefresh}
        onStart={onStart}
      />
    </div>
  );
}

function UniversePicker({
  selectedUniverses,
  universes,
  onUniverseToggle,
}: {
  selectedUniverses: string[];
  universes: BacktestUniverse[];
  onUniverseToggle: (key: string) => void;
}) {
  const { t } = useI18n();

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-semibold text-muted-foreground">
        {t.batchBacktest.universes}
      </span>
      <div className="grid gap-2 sm:grid-cols-3">
        {universes.map((universe) => (
          <label
            key={universe.key}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-lg border bg-background p-3 text-sm transition-colors",
              selectedUniverses.includes(universe.key)
                ? "border-primary bg-primary/5"
                : "hover:bg-muted/40"
            )}
          >
            <input
              type="checkbox"
              checked={selectedUniverses.includes(universe.key)}
              onChange={() => onUniverseToggle(universe.key)}
              className="mt-1"
            />
            <span className="min-w-0">
              <span className="block font-medium">{universe.name}</span>
              <span className="mt-1 line-clamp-2 block text-xs text-muted-foreground">
                {universe.description}
              </span>
            </span>
          </label>
        ))}
        {universes.length === 0 && (
          <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
            {t.batchBacktest.noUniverses}
          </p>
        )}
      </div>
    </div>
  );
}
