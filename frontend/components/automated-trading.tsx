"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Pause, Play, RotateCcw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, Field, WorkbenchPanel } from "@/components/workbench";
import { api } from "@/lib/api";
import type { Health, StrategyDescriptor, StrategyInstance } from "@/types";

type ParamSpec = {
  type?: string;
  default?: number;
  title?: string;
};

const HOURLY_SCHEDULE = "55 10-15 * * 1-5";

function paramsFor(strategy?: StrategyDescriptor): Record<string, number> {
  const props = (strategy?.param_schema?.properties as Record<string, ParamSpec>) ?? {};
  const out: Record<string, number> = {};
  for (const [name, spec] of Object.entries(props)) {
    if (typeof spec.default === "number") out[name] = spec.default;
  }
  return out;
}

function parseSymbols(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[,\s]+/)
        .map((symbol) => symbol.trim().toUpperCase())
        .filter(Boolean)
    )
  );
}

function formatDate(value: string | null) {
  if (!value) return "Never";
  return new Date(value).toLocaleString();
}

export function AutomatedTrading({
  strategies,
  instances,
  health,
}: {
  strategies: StrategyDescriptor[];
  instances: StrategyInstance[];
  health: Health | null;
}) {
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
      setError("Add at least one symbol.");
      return;
    }
    if (isLive && liveText !== "LIVE") {
      setError("Type LIVE before starting a live automated strategy.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await api.createStrategy({
        name: name.trim() || `${selectedStrategy?.name ?? strategyKey} Auto`,
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
      setError(exc instanceof Error ? exc.message : "Could not start automated strategy.");
    } finally {
      setLoading(false);
    }
  }

  async function setActive(instance: StrategyInstance, isActive: boolean) {
    if (isLive && isActive && rowLiveText !== "LIVE") {
      setError("Type LIVE before resuming a live automated strategy.");
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
      setError(exc instanceof Error ? exc.message : "Could not update strategy.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <WorkbenchPanel
        title="Automated trading"
        description={`${health?.broker_env ?? "paper"} · ${health?.openai_sizing_enabled ? health.position_model : `${health?.default_position_allocation_pct ?? 1}% preset`}`}
        actions={
          <Badge variant={health?.trading_enabled ? "default" : "destructive"}>
            {health?.trading_enabled ? "Trading on" : "Trading off"}
          </Badge>
        }
        contentClassName="flex flex-col gap-4"
      >
        <div className="grid grid-cols-2 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Strategy">
            <select
              value={strategyKey}
              onChange={(event) => {
                const key = event.target.value;
                setStrategyKey(key);
                setParams(paramsFor(strategies.find((strategy) => strategy.key === key)));
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
          <Field label="Name">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
              placeholder="Auto name"
            />
          </Field>
          <Field label="Symbols">
            <input
              value={symbolsText}
              onChange={(event) => setSymbolsText(event.target.value)}
              className="h-10 w-full rounded-lg border bg-background px-3 text-sm font-medium uppercase"
            />
          </Field>
          <Field label="Schedule">
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
                  onChange={(event) =>
                    setParams((current) => ({ ...current, [key]: Number(event.target.value) }))
                  }
                  className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
                />
              </Field>
            ))}
          </div>
        )}

        {isLive && (
          <Field label="Live confirmation" className="max-w-xs">
            <input
              value={liveText}
              onChange={(event) => setLiveText(event.target.value)}
              className="h-10 w-full rounded-lg border bg-background px-3 text-sm font-semibold"
              placeholder="LIVE"
            />
          </Field>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div>
          <Button onClick={start} disabled={loading || strategies.length === 0}>
            <Play data-icon="inline-start" />
            {loading ? "Starting..." : "Start"}
          </Button>
        </div>
      </WorkbenchPanel>

      <WorkbenchPanel
        title="Configured"
        description={`${instances.length} total · ${activeCount} active`}
        actions={
          <Badge variant={activeCount > 0 ? "default" : "outline"}>
            {activeCount > 0 ? "Active" : "Idle"}
          </Badge>
        }
        className="self-start"
        contentClassName="flex flex-col gap-2"
      >
        {isLive && instances.some((instance) => !instance.is_active) && (
          <Field label="Resume live confirmation">
            <input
              value={rowLiveText}
              onChange={(event) => setRowLiveText(event.target.value)}
              className="h-9 w-full rounded-lg border bg-background px-3 text-sm font-semibold"
              placeholder="LIVE"
            />
          </Field>
        )}

        {instances.map((instance) => (
          <div key={instance.id} className="rounded-lg border bg-background p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{instance.name}</p>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  {instance.strategy_key}
                </p>
              </div>
              <Badge variant={instance.is_active ? "default" : "outline"}>
                {instance.is_active ? "On" : "Off"}
              </Badge>
            </div>
            <div className="mt-3 space-y-1 font-mono text-xs text-muted-foreground">
              <p className="truncate">{instance.symbols.join(", ") || "No symbols"}</p>
              <p>{instance.schedule || "No schedule"}</p>
              <p>Last: {formatDate(instance.last_run_at)}</p>
            </div>
            {instance.last_error && (
              <p className="mt-2 line-clamp-2 text-xs text-red-600">{instance.last_error}</p>
            )}
            <div className="mt-3 flex justify-end">
              {instance.is_active ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setActive(instance, false)}
                  disabled={busyId === instance.id}
                >
                  <Pause data-icon="inline-start" />
                  Stop
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setActive(instance, true)}
                  disabled={busyId === instance.id}
                >
                  <RotateCcw data-icon="inline-start" />
                  Resume
                </Button>
              )}
            </div>
          </div>
        ))}

        {instances.length === 0 && (
          <EmptyState className="py-5 text-left">No strategies configured yet.</EmptyState>
        )}
      </WorkbenchPanel>
    </section>
  );
}
