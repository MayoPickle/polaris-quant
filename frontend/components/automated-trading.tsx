"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n/client";
import type { Health, StrategyDescriptor, StrategyInstance } from "@/types";

import { AutomatedTradingInstancesPanel } from "./automated-trading/instances-panel";
import { AutomatedTradingStartForm } from "./automated-trading/start-form";
import type { ParamSpec } from "./automated-trading/types";
import { HOURLY_SCHEDULE, paramsFor, parseSymbols } from "./automated-trading/utils";

export function AutomatedTrading({
  strategies,
  instances,
  health,
}: {
  strategies: StrategyDescriptor[];
  instances: StrategyInstance[];
  health: Health | null;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [strategyKey, setStrategyKey] = useState(strategies[0]?.key ?? "");
  const selectedStrategy = useMemo(
    () => strategies.find((strategy) => strategy.key === strategyKey) ?? strategies[0],
    [strategies, strategyKey]
  );
  const props = (selectedStrategy?.param_schema?.properties as Record<string, ParamSpec>) ?? {};
  const [params, setParams] = useState<Record<string, number>>(() => paramsFor(selectedStrategy));
  const [name, setName] = useState("");
  const [symbolsText, setSymbolsText] = useState("AAPL");
  const [liveText, setLiveText] = useState("");
  const [rowLiveText, setRowLiveText] = useState("");
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isLive = health?.broker_env === "live";
  const activeCount = instances.filter((instance) => instance.is_active).length;

  async function start() {
    if (!strategyKey) return;
    const symbols = parseSymbols(symbolsText);
    if (symbols.length === 0) {
      setError(t.automatedTrading.addSymbolError);
      return;
    }
    if (isLive && liveText !== "LIVE") {
      setError(t.automatedTrading.liveStartError);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await api.createStrategy({
        name: name.trim() || `${selectedStrategy?.name ?? strategyKey} ${t.automatedTrading.autoSuffix}`,
        strategy_key: strategyKey,
        params,
        symbols,
        schedule: HOURLY_SCHEDULE,
        is_active: true,
        live_confirmed: !isLive || liveText === "LIVE",
      });
      setName("");
      setLiveText("");
      router.refresh();
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : t.automatedTrading.createError);
    } finally {
      setLoading(false);
    }
  }

  async function setActive(instance: StrategyInstance, isActive: boolean) {
    if (isLive && isActive && rowLiveText !== "LIVE") {
      setError(t.automatedTrading.liveResumeError);
      return;
    }
    setBusyId(instance.id);
    setError(null);
    try {
      await api.updateStrategy(instance.id, {
        is_active: isActive,
        live_confirmed: !isLive || !isActive || rowLiveText === "LIVE",
      });
      if (isActive) setRowLiveText("");
      router.refresh();
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : t.automatedTrading.updateError);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <AutomatedTradingStartForm
        error={error}
        health={health}
        isLive={isLive}
        liveText={liveText}
        loading={loading}
        name={name}
        params={params}
        props={props}
        strategies={strategies}
        strategyKey={strategyKey}
        symbolsText={symbolsText}
        onLiveTextChange={setLiveText}
        onNameChange={setName}
        onParamChange={(key, value) => setParams((current) => ({ ...current, [key]: value }))}
        onParamsReplace={setParams}
        onStart={() => void start()}
        onStrategyKeyChange={setStrategyKey}
        onSymbolsTextChange={setSymbolsText}
      />
      <AutomatedTradingInstancesPanel
        activeCount={activeCount}
        busyId={busyId}
        instances={instances}
        isLive={isLive}
        rowLiveText={rowLiveText}
        onRowLiveTextChange={setRowLiveText}
        onSetActive={(instance, isActive) => void setActive(instance, isActive)}
      />
    </section>
  );
}
