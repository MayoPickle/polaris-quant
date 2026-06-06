"use client";

import { Play } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, WorkbenchPanel } from "@/components/workbench";
import { useI18n } from "@/lib/i18n/client";
import { brokerEnvLabel } from "@/lib/i18n/format";
import type { Health, StrategyDescriptor } from "@/types";

import type { ParamSpec } from "./types";
import { HOURLY_SCHEDULE, paramsFor } from "./utils";

export function AutomatedTradingStartForm({
  error,
  health,
  isLive,
  liveText,
  loading,
  name,
  params,
  props,
  strategies,
  strategyKey,
  symbolsText,
  onLiveTextChange,
  onNameChange,
  onParamChange,
  onParamsReplace,
  onStart,
  onStrategyKeyChange,
  onSymbolsTextChange,
}: {
  error: string | null;
  health: Health | null;
  isLive: boolean;
  liveText: string;
  loading: boolean;
  name: string;
  params: Record<string, number>;
  props: Record<string, ParamSpec>;
  strategies: StrategyDescriptor[];
  strategyKey: string;
  symbolsText: string;
  onLiveTextChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onParamChange: (key: string, value: number) => void;
  onParamsReplace: (params: Record<string, number>) => void;
  onStart: () => void;
  onStrategyKeyChange: (key: string) => void;
  onSymbolsTextChange: (value: string) => void;
}) {
  const { locale, t } = useI18n();

  return (
    <WorkbenchPanel
      title={t.automatedTrading.title}
      description={`${brokerEnvLabel(health?.broker_env, locale)} · ${health?.openai_sizing_enabled ? health.position_model : `${health?.default_position_allocation_pct ?? 1}% ${t.pages.overview.preset}`}`}
      actions={
        <Badge variant={health?.trading_enabled ? "default" : "destructive"}>
          {health?.trading_enabled
            ? t.automatedTrading.tradingOn
            : t.automatedTrading.tradingOff}
        </Badge>
      }
      contentClassName="flex flex-col gap-4"
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Field label={t.automatedTrading.strategy}>
          <select
            value={strategyKey}
            onChange={(event) => {
              const key = event.target.value;
              onStrategyKeyChange(key);
              onParamsReplace(paramsFor(strategies.find((strategy) => strategy.key === key)));
            }}
            className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
          >
            {strategies.map((strategy) => (
              <option key={strategy.key} value={strategy.key}>
                {strategy.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t.automatedTrading.name}>
          <input
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
            placeholder={t.automatedTrading.namePlaceholder}
          />
        </Field>
        <Field label={t.automatedTrading.symbols}>
          <input
            value={symbolsText}
            onChange={(event) => onSymbolsTextChange(event.target.value)}
            className="h-10 w-full rounded-lg border bg-background px-3 text-sm font-medium uppercase"
          />
        </Field>
        <Field label={t.automatedTrading.schedule}>
          <input
            value={HOURLY_SCHEDULE}
            readOnly
            className="h-10 w-full rounded-lg border bg-muted px-3 font-mono text-xs text-muted-foreground"
          />
        </Field>
      </div>

      {Object.keys(props).length > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {Object.entries(props).map(([key, spec]) => (
            <Field key={key} label={spec.title ?? key}>
              <input
                type="number"
                value={params[key] ?? ""}
                onChange={(event) => onParamChange(key, Number(event.target.value))}
                className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
              />
            </Field>
          ))}
        </div>
      )}

      {isLive && (
        <Field label={t.automatedTrading.liveConfirmation} className="max-w-xs">
          <input
            value={liveText}
            onChange={(event) => onLiveTextChange(event.target.value)}
            className="h-10 w-full rounded-lg border bg-background px-3 text-sm font-semibold"
            placeholder="LIVE"
          />
        </Field>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div>
        <Button onClick={onStart} disabled={loading || strategies.length === 0}>
          <Play data-icon="inline-start" />
          {loading ? t.common.starting : t.automatedTrading.start}
        </Button>
      </div>
    </WorkbenchPanel>
  );
}
