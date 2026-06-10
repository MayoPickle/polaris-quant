"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import {
  Archive,
  Edit3,
  Pause,
  Play,
  Save,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  EmptyState,
  Field,
  MetricGrid,
  MetricTile,
  WorkbenchPanel,
} from "@/components/workbench";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n/client";
import {
  brokerEnvLabel,
  formatCurrency,
  formatDateTime,
  formatPercent,
  orderSideLabel,
} from "@/lib/i18n/format";
import type {
  Account,
  Health,
  Order,
  StrategyDescriptor,
  StrategyInstance,
  StrategySignal,
} from "@/types";

import type { ParamSpec } from "../automated-trading/types";
import { HOURLY_SCHEDULE, paramsFor, parseSymbols } from "../automated-trading/utils";

const SCHEDULE_PRESETS = [
  { key: "hourly", value: HOURLY_SCHEDULE },
  { key: "market_open", value: "35 9 * * mon-fri" },
  { key: "market_close", value: "55 15 * * mon-fri" },
] as const;

type SchedulePresetKey = (typeof SCHEDULE_PRESETS)[number]["key"] | "custom";

type EditDraft = {
  name: string;
  symbolsText: string;
  schedulePreset: SchedulePresetKey;
  schedule: string;
  params: Record<string, number>;
};

export function AutomationDashboard({
  account,
  health,
  strategies,
  instances,
  signals,
  orders,
}: {
  account: Account | null;
  health: Health | null;
  strategies: StrategyDescriptor[];
  instances: StrategyInstance[];
  signals: StrategySignal[] | null;
  orders: Order[];
}) {
  const { locale, t } = useI18n();
  const isLive = health?.broker_env === "live";
  const activeInstances = instances.filter(
    (instance) => instance.is_active && !instance.archived_at
  );
  const erroredInstances = instances.filter(
    (instance) => instance.last_error && !instance.archived_at
  );
  const nextRunAt = activeInstances
    .map((instance) => instance.next_run_at)
    .filter((value): value is string => Boolean(value))
    .sort()[0] ?? null;
  const automatedOrders = orders.filter((order) => order.source === "automated");

  return (
    <div className="flex flex-col gap-4 md:gap-5">
      <WorkbenchPanel
        title={t.automatedTrading.readinessTitle}
        description={t.automatedTrading.readinessDescription}
      >
        <MetricGrid className="md:grid-cols-4 xl:grid-cols-8">
          <MetricTile
            label={t.automatedTrading.tradingGuard}
            value={health?.trading_enabled ? t.common.enabled : t.common.disabled}
            detail={t.pages.overview.tradingGuardDetail}
            tone={health?.trading_enabled ? "positive" : "warning"}
          />
          <MetricTile
            label={t.automatedTrading.broker}
            value={brokerEnvLabel(health?.broker_env, locale)}
            detail={health?.env ?? t.common.unavailable}
            tone={health?.broker_env === "live" ? "warning" : "neutral"}
          />
          <MetricTile
            label={t.automatedTrading.sizing}
            value={
              health?.openai_sizing_enabled
                ? health.position_model
                : formatPercent(health?.default_position_allocation_pct ?? 1, locale)
            }
            detail={
              health?.openai_sizing_enabled
                ? t.pages.overview.sizingOpenAi
                : t.pages.overview.sizingFallback
            }
            tone="info"
          />
          <MetricTile
            label={t.automatedTrading.buyingPower}
            value={account ? formatCurrency(account.buying_power, locale) : "—"}
            detail={t.pages.overview.buyingPowerDetail}
            tone="info"
          />
          <MetricTile
            label={t.automatedTrading.cash}
            value={account ? formatCurrency(account.cash, locale) : "—"}
            detail={t.pages.overview.equityDetail}
          />
          <MetricTile
            label={t.automatedTrading.activeAutomations}
            value={activeInstances.length}
            detail={`${erroredInstances.length} ${t.common.errors}`}
            tone={erroredInstances.length > 0 ? "negative" : activeInstances.length > 0 ? "positive" : "neutral"}
          />
          <MetricTile
            label={t.automatedTrading.nextRun}
            value={formatDateTime(nextRunAt, locale)}
            detail={t.automatedTrading.scheduler}
            tone={nextRunAt ? "positive" : "neutral"}
          />
          <MetricTile
            label={t.automatedTrading.automatedOrders}
            value={automatedOrders.length}
            detail={t.pages.history.title}
          />
        </MetricGrid>
      </WorkbenchPanel>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <NewAutomationPanel
          health={health}
          isLive={isLive}
          strategies={strategies}
        />
        <ConfiguredAutomationsPanel
          health={health}
          instances={instances}
          isLive={isLive}
          strategies={strategies}
        />
      </section>

      <RecentDecisionsPanel signals={signals} />
    </div>
  );
}

function NewAutomationPanel({
  health,
  isLive,
  strategies,
}: {
  health: Health | null;
  isLive: boolean;
  strategies: StrategyDescriptor[];
}) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [strategyKey, setStrategyKey] = useState(strategies[0]?.key ?? "");
  const selectedStrategy = useMemo(
    () => strategies.find((strategy) => strategy.key === strategyKey) ?? strategies[0],
    [strategies, strategyKey]
  );
  const props = (selectedStrategy?.param_schema?.properties as Record<string, ParamSpec>) ?? {};
  const [params, setParams] = useState<Record<string, number>>(() =>
    paramsFor(selectedStrategy)
  );
  const [name, setName] = useState("");
  const [symbolsText, setSymbolsText] = useState("AAPL");
  const [schedulePreset, setSchedulePreset] = useState<SchedulePresetKey>("hourly");
  const [customSchedule, setCustomSchedule] = useState(HOURLY_SCHEDULE);
  const [enableImmediately, setEnableImmediately] = useState(false);
  const [liveText, setLiveText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tradingEnabled = health?.trading_enabled === true;
  const schedule = scheduleForPreset(schedulePreset, customSchedule);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!strategyKey) return;
    const symbols = parseSymbols(symbolsText);
    if (symbols.length === 0) {
      setError(t.automatedTrading.addSymbolError);
      return;
    }
    if (!schedule.trim()) {
      setError(t.automatedTrading.invalidSchedule);
      return;
    }
    if (enableImmediately && !tradingEnabled) {
      setError(t.automatedTrading.tradingDisabledActiveHint);
      return;
    }
    if (isLive && enableImmediately && liveText !== "LIVE") {
      setError(t.automatedTrading.liveStartError);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await api.createStrategy({
        name:
          name.trim() ||
          `${selectedStrategy?.name ?? strategyKey} ${t.automatedTrading.autoSuffix}`,
        strategy_key: strategyKey,
        params,
        symbols,
        schedule,
        is_active: enableImmediately,
        live_confirmed: !isLive || !enableImmediately || liveText === "LIVE",
      });
      setName("");
      setSymbolsText("AAPL");
      setEnableImmediately(false);
      setLiveText("");
      router.refresh();
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : t.automatedTrading.createError);
    } finally {
      setLoading(false);
    }
  }

  return (
    <WorkbenchPanel
      title={t.automatedTrading.newTitle}
      description={t.automatedTrading.newDescription}
      actions={
        <Badge variant={tradingEnabled ? "default" : "outline"}>
          {tradingEnabled ? t.common.enabled : t.common.disabled}
        </Badge>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Field label={t.automatedTrading.strategy}>
            <select
              value={strategyKey}
              onChange={(event) => {
                const key = event.target.value;
                const nextStrategy = strategies.find((strategy) => strategy.key === key);
                setStrategyKey(key);
                setParams(paramsFor(nextStrategy));
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
              onChange={(event) => setName(event.target.value)}
              className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
              placeholder={t.automatedTrading.namePlaceholder}
            />
          </Field>
          <Field label={t.automatedTrading.symbols}>
            <input
              value={symbolsText}
              onChange={(event) => setSymbolsText(event.target.value.toUpperCase())}
              className="h-10 w-full rounded-lg border bg-background px-3 text-sm font-medium uppercase"
              placeholder="AAPL, MSFT"
            />
          </Field>
          <Field label={t.automatedTrading.schedulePreset}>
            <ScheduleSelect value={schedulePreset} onChange={setSchedulePreset} />
          </Field>
        </div>

        {schedulePreset === "custom" && (
          <Field label={t.automatedTrading.customCron}>
            <input
              value={customSchedule}
              onChange={(event) => setCustomSchedule(event.target.value)}
              className="h-10 w-full rounded-lg border bg-background px-3 font-mono text-sm"
            />
          </Field>
        )}

        <ScheduleHint schedule={schedule} locale={locale} />

        {Object.keys(props).length > 0 && (
          <ParamGrid
            params={params}
            props={props}
            onParamChange={(key, value) =>
              setParams((current) => ({ ...current, [key]: value }))
            }
          />
        )}

        <div className="grid gap-3 md:grid-cols-[minmax(0,16rem)_minmax(0,16rem)_1fr]">
          <label
            className={[
              "flex h-10 cursor-pointer items-center gap-3 rounded-lg border bg-background px-3 text-sm",
              !tradingEnabled ? "cursor-not-allowed opacity-60" : "",
            ].join(" ")}
          >
            <input
              type="checkbox"
              checked={enableImmediately}
              disabled={!tradingEnabled}
              onChange={(event) => setEnableImmediately(event.target.checked)}
            />
            <span className="font-medium">{t.automatedTrading.enableImmediately}</span>
          </label>
          {isLive && enableImmediately && (
            <Field label={t.automatedTrading.liveConfirmation}>
              <input
                value={liveText}
                onChange={(event) => setLiveText(event.target.value)}
                className="h-10 w-full rounded-lg border bg-background px-3 text-sm font-semibold"
                placeholder="LIVE"
              />
            </Field>
          )}
          <p className="flex items-center text-sm text-muted-foreground">
            {!tradingEnabled
              ? t.automatedTrading.tradingDisabledActiveHint
              : t.automatedTrading.savePausedHint}
          </p>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={loading || strategies.length === 0}>
            <Play data-icon="inline-start" />
            {loading ? t.automatedTrading.saving : t.automatedTrading.saveAutomation}
          </Button>
        </div>
      </form>
    </WorkbenchPanel>
  );
}

function ConfiguredAutomationsPanel({
  health,
  instances,
  isLive,
  strategies,
}: {
  health: Health | null;
  instances: StrategyInstance[];
  isLive: boolean;
  strategies: StrategyDescriptor[];
}) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [resumeLiveText, setResumeLiveText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const activeCount = instances.filter(
    (instance) => instance.is_active && !instance.archived_at
  ).length;

  function beginEdit(instance: StrategyInstance) {
    setError(null);
    setEditingId(instance.id);
    setDraft({
      name: instance.name,
      symbolsText: instance.symbols.join(", "),
      schedulePreset: presetForSchedule(instance.schedule),
      schedule: instance.schedule || HOURLY_SCHEDULE,
      params: numericParams(instance.params),
    });
  }

  async function saveEdit(instance: StrategyInstance) {
    if (!draft) return;
    const symbols = parseSymbols(draft.symbolsText);
    const schedule = scheduleForPreset(draft.schedulePreset, draft.schedule);
    if (symbols.length === 0) {
      setError(t.automatedTrading.addSymbolError);
      return;
    }
    if (!schedule.trim()) {
      setError(t.automatedTrading.invalidSchedule);
      return;
    }
    setBusyId(instance.id);
    setError(null);
    try {
      await api.updateStrategy(instance.id, {
        name: draft.name.trim() || instance.name,
        symbols,
        schedule,
        params: draft.params,
      });
      setEditingId(null);
      setDraft(null);
      router.refresh();
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : t.automatedTrading.editError);
    } finally {
      setBusyId(null);
    }
  }

  async function setActive(instance: StrategyInstance, isActive: boolean) {
    if (isLive && isActive && resumeLiveText !== "LIVE") {
      setError(t.automatedTrading.liveResumeError);
      return;
    }
    setBusyId(instance.id);
    setError(null);
    try {
      await api.updateStrategy(instance.id, {
        is_active: isActive,
        live_confirmed: !isLive || !isActive || resumeLiveText === "LIVE",
      });
      if (isActive) setResumeLiveText("");
      router.refresh();
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : t.automatedTrading.updateError);
    } finally {
      setBusyId(null);
    }
  }

  async function archive(instance: StrategyInstance) {
    if (instance.is_active) {
      setError(t.automatedTrading.pauseBeforeArchive);
      return;
    }
    if (!window.confirm(t.automatedTrading.confirmArchive.replace("{name}", instance.name))) {
      return;
    }
    setBusyId(instance.id);
    setError(null);
    try {
      await api.archiveStrategy(instance.id);
      router.refresh();
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : t.automatedTrading.archiveError);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <WorkbenchPanel
      title={t.automatedTrading.configuredTitle}
      description={`${instances.length} ${t.common.total} · ${activeCount} ${t.automatedTrading.totalActive}`}
      actions={
        <Badge variant={activeCount > 0 ? "default" : "outline"}>
          {activeCount > 0 ? t.enums.automationState.active : t.enums.automationState.idle}
        </Badge>
      }
      className="self-start"
      contentClassName="flex flex-col gap-3"
    >
      {isLive && instances.some((instance) => !instance.is_active && !instance.archived_at) && (
        <Field label={t.automatedTrading.resumeLiveConfirmation}>
          <input
            value={resumeLiveText}
            onChange={(event) => setResumeLiveText(event.target.value)}
            className="h-9 w-full rounded-lg border bg-background px-3 text-sm font-semibold"
            placeholder="LIVE"
          />
        </Field>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {instances.map((instance) => {
        const strategy = strategies.find((item) => item.key === instance.strategy_key);
        const props = (strategy?.param_schema?.properties as Record<string, ParamSpec>) ?? {};
        const isEditing = editingId === instance.id && draft != null;

        return (
          <div key={instance.id} className="rounded-lg border bg-background p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{instance.name}</p>
                <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                  {instance.strategy_key}
                </p>
              </div>
              <Badge variant={automationStateVariant(instance)}>
                {automationStateLabel(instance, t)}
              </Badge>
            </div>

            {isEditing ? (
              <div className="mt-3 flex flex-col gap-3">
                <Field label={t.automatedTrading.name}>
                  <input
                    value={draft.name}
                    onChange={(event) =>
                      setDraft((current) =>
                        current ? { ...current, name: event.target.value } : current
                      )
                    }
                    className="h-9 w-full rounded-lg border bg-background px-3 text-sm"
                  />
                </Field>
                <Field label={t.automatedTrading.symbols}>
                  <input
                    value={draft.symbolsText}
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? { ...current, symbolsText: event.target.value.toUpperCase() }
                          : current
                      )
                    }
                    className="h-9 w-full rounded-lg border bg-background px-3 text-sm font-medium uppercase"
                  />
                </Field>
                <Field label={t.automatedTrading.schedulePreset}>
                  <ScheduleSelect
                    value={draft.schedulePreset}
                    onChange={(value) =>
                      setDraft((current) =>
                        current ? { ...current, schedulePreset: value } : current
                      )
                    }
                  />
                </Field>
                {draft.schedulePreset === "custom" && (
                  <Field label={t.automatedTrading.customCron}>
                    <input
                      value={draft.schedule}
                      onChange={(event) =>
                        setDraft((current) =>
                          current ? { ...current, schedule: event.target.value } : current
                        )
                      }
                      className="h-9 w-full rounded-lg border bg-background px-3 font-mono text-sm"
                    />
                  </Field>
                )}
                <ScheduleHint schedule={scheduleForPreset(draft.schedulePreset, draft.schedule)} locale={locale} />
                {Object.keys(props).length > 0 && (
                  <ParamGrid
                    params={draft.params}
                    props={props}
                    compact
                    onParamChange={(key, value) =>
                      setDraft((current) =>
                        current
                          ? { ...current, params: { ...current.params, [key]: value } }
                          : current
                      )
                    }
                  />
                )}
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setEditingId(null);
                      setDraft(null);
                    }}
                  >
                    <X data-icon="inline-start" />
                    {t.common.cancel}
                  </Button>
                  <Button
                    size="sm"
                    type="button"
                    onClick={() => void saveEdit(instance)}
                    disabled={busyId === instance.id}
                  >
                    <Save data-icon="inline-start" />
                    {t.automatedTrading.saveChanges}
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                  <p className="truncate">{instance.symbols.join(", ") || t.common.noSymbols}</p>
                  <p className="line-clamp-2 text-foreground">
                    {describeCronSchedule(instance.schedule, locale)}
                  </p>
                  <p className="truncate font-mono">{instance.schedule || t.common.noSchedule}</p>
                  <p>{t.automatedTrading.next}: {formatDateTime(instance.next_run_at, locale)}</p>
                  <p>{t.automatedTrading.last}: {formatDateTime(instance.last_run_at, locale)}</p>
                  {instance.archived_at && (
                    <p>{t.automatedTrading.archived}: {formatDateTime(instance.archived_at, locale)}</p>
                  )}
                </div>
                {instance.last_error && (
                  <p className="mt-2 line-clamp-2 text-xs text-red-600">
                    {instance.last_error}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  {!instance.archived_at && (
                    <Button
                      size="sm"
                      type="button"
                      variant="outline"
                      onClick={() => beginEdit(instance)}
                      disabled={busyId === instance.id}
                    >
                      <Edit3 data-icon="inline-start" />
                      {t.automatedTrading.edit}
                    </Button>
                  )}
                  {!instance.archived_at && instance.is_active && (
                    <Button
                      size="sm"
                      type="button"
                      variant="outline"
                      onClick={() => void setActive(instance, false)}
                      disabled={busyId === instance.id}
                    >
                      <Pause data-icon="inline-start" />
                      {t.automatedTrading.stop}
                    </Button>
                  )}
                  {!instance.archived_at && !instance.is_active && (
                    <Button
                      size="sm"
                      type="button"
                      variant="outline"
                      onClick={() => void setActive(instance, true)}
                      disabled={busyId === instance.id || health?.trading_enabled !== true}
                    >
                      <Play data-icon="inline-start" />
                      {t.automatedTrading.resume}
                    </Button>
                  )}
                  {!instance.archived_at && (
                    <Button
                      size="sm"
                      type="button"
                      variant="destructive"
                      onClick={() => void archive(instance)}
                      disabled={busyId === instance.id || instance.is_active}
                    >
                      <Archive data-icon="inline-start" />
                      {t.automatedTrading.archive}
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        );
      })}

      {instances.length === 0 && (
        <EmptyState className="py-5 text-left">
          {t.automatedTrading.noStrategiesConfigured}
        </EmptyState>
      )}
    </WorkbenchPanel>
  );
}

function RecentDecisionsPanel({ signals }: { signals: StrategySignal[] | null }) {
  const { locale, t } = useI18n();

  return (
    <WorkbenchPanel
      title={t.automatedTrading.recentDecisionsTitle}
      description={t.automatedTrading.recentDecisionsDescription}
      actions={<Badge variant="outline">{signals?.length ?? 0} {t.common.total}</Badge>}
      contentClassName="p-0"
    >
      <div className="md:hidden">
        {(signals ?? []).map((signal) => (
          <div key={signal.id} className="flex flex-col gap-3 border-b p-4 last:border-b-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold">{signal.symbol}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {signal.strategy_name}
                </p>
              </div>
              <Badge variant={signalStatusVariant(signal.status)}>
                {signalStatusLabel(signal.status, t)}
              </Badge>
            </div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className={signal.side === "buy" ? "text-green-600" : signal.side === "sell" ? "text-red-600" : "text-muted-foreground"}>
                {orderSideLabel(signal.side, locale)}
              </span>
              <span className="text-muted-foreground">
                {t.common.qty} {signal.qty}
              </span>
              <span className="text-muted-foreground">
                {formatDateTime(signal.created_at, locale)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {signal.reason ?? signal.allocation_rationale ?? t.automatedTrading.noReason}
            </p>
            {signal.order_id && (
              <Link href="/history" className="text-xs font-medium text-primary hover:underline">
                {t.automatedTrading.viewHistory}
              </Link>
            )}
          </div>
        ))}
        {(!signals || signals.length === 0) && (
          <div className="p-4">
            <EmptyState>
              {signals === null
                ? t.automatedTrading.couldNotLoadSignals
                : t.automatedTrading.noSignals}
            </EmptyState>
          </div>
        )}
      </div>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="px-4 py-3 font-medium">{t.common.placed}</th>
              <th className="px-4 py-3 font-medium">{t.automatedTrading.strategy}</th>
              <th className="px-4 py-3 font-medium">{t.batchBacktest.symbol}</th>
              <th className="px-4 py-3 font-medium">{t.common.side}</th>
              <th className="px-4 py-3 text-right font-medium">{t.common.qty}</th>
              <th className="px-4 py-3 font-medium">{t.common.status}</th>
              <th className="px-4 py-3 font-medium">{t.automatedTrading.reason}</th>
              <th className="px-4 py-3 text-right font-medium">{t.automatedTrading.allocation}</th>
              <th className="px-4 py-3 text-right font-medium">{t.automatedTrading.order}</th>
            </tr>
          </thead>
          <tbody>
            {(signals ?? []).map((signal) => (
              <tr key={signal.id} className="border-b last:border-b-0">
                <td className="px-4 py-3 text-muted-foreground">
                  {formatDateTime(signal.created_at, locale)}
                </td>
                <td className="max-w-[14rem] px-4 py-3">
                  <p className="truncate font-medium">{signal.strategy_name}</p>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {signal.strategy_key}
                  </p>
                </td>
                <td className="px-4 py-3 font-medium">{signal.symbol}</td>
                <td className="px-4 py-3">
                  <span className={signal.side === "buy" ? "text-green-600" : signal.side === "sell" ? "text-red-600" : "text-muted-foreground"}>
                    {orderSideLabel(signal.side, locale)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">{signal.qty}</td>
                <td className="px-4 py-3">
                  <Badge variant={signalStatusVariant(signal.status)}>
                    {signalStatusLabel(signal.status, t)}
                  </Badge>
                </td>
                <td className="max-w-[18rem] px-4 py-3 text-muted-foreground">
                  <span className="line-clamp-2">
                    {signal.reason ?? signal.allocation_rationale ?? t.automatedTrading.noReason}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  {signal.allocation_pct != null
                    ? formatPercent(signal.allocation_pct, locale)
                    : "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  {signal.order_id ? (
                    <Link href="/history" className="font-medium text-primary hover:underline">
                      {t.automatedTrading.viewHistory}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
            {(!signals || signals.length === 0) && (
              <tr>
                <td colSpan={9} className="px-4 py-6">
                  <EmptyState>
                    {signals === null
                      ? t.automatedTrading.couldNotLoadSignals
                      : t.automatedTrading.noSignals}
                  </EmptyState>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </WorkbenchPanel>
  );
}

function ParamGrid({
  params,
  props,
  onParamChange,
  compact = false,
}: {
  params: Record<string, number>;
  props: Record<string, ParamSpec>;
  onParamChange: (key: string, value: number) => void;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "grid grid-cols-2 gap-3" : "grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6"}>
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
  );
}

function ScheduleSelect({
  value,
  onChange,
}: {
  value: SchedulePresetKey;
  onChange: (value: SchedulePresetKey) => void;
}) {
  const { t } = useI18n();

  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value as SchedulePresetKey)}
      className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
    >
      <option value="hourly">{t.automatedTrading.hourlySchedule}</option>
      <option value="market_open">{t.automatedTrading.marketOpenSchedule}</option>
      <option value="market_close">{t.automatedTrading.marketCloseSchedule}</option>
      <option value="custom">{t.automatedTrading.customSchedule}</option>
    </select>
  );
}

function ScheduleHint({ schedule, locale }: { schedule: string; locale: string }) {
  return (
    <div className="text-sm">
      <p className="font-medium text-foreground">{describeCronSchedule(schedule, locale)}</p>
      <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
        {schedule || "—"}
      </p>
    </div>
  );
}

function scheduleForPreset(preset: SchedulePresetKey, customSchedule: string) {
  if (preset === "custom") return customSchedule;
  return SCHEDULE_PRESETS.find((item) => item.key === preset)?.value ?? HOURLY_SCHEDULE;
}

function presetForSchedule(schedule: string): SchedulePresetKey {
  return SCHEDULE_PRESETS.find((item) => item.value === schedule)?.key ?? "custom";
}

function numericParams(params: Record<string, unknown>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(params).map(([key, value]) => [key, Number(value)])
  );
}

function automationStateLabel(
  instance: StrategyInstance,
  t: ReturnType<typeof useI18n>["t"]
) {
  if (instance.archived_at) return t.automatedTrading.archived;
  if (instance.last_error) return t.automatedTrading.errored;
  return instance.is_active ? t.enums.automationState.active : t.automatedTrading.paused;
}

function automationStateVariant(
  instance: StrategyInstance
): "default" | "secondary" | "destructive" | "outline" {
  if (instance.archived_at) return "outline";
  if (instance.last_error) return "destructive";
  return instance.is_active ? "default" : "secondary";
}

function signalStatusLabel(status: string, t: ReturnType<typeof useI18n>["t"]) {
  if (status === "submitted") return t.automatedTrading.submitted;
  if (status === "rejected") return t.automatedTrading.rejected;
  if (status === "skipped") return t.automatedTrading.skipped;
  if (status === "no_signal") return t.automatedTrading.noSignal;
  return t.automatedTrading.unknownStatus;
}

function signalStatusVariant(
  status: string
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "submitted") return "default";
  if (status === "rejected") return "destructive";
  if (status === "skipped") return "secondary";
  return "outline";
}

function describeCronSchedule(schedule: string, locale: string) {
  const zh = locale.startsWith("zh");
  const trimmed = schedule.trim();
  const fallback = zh ? "使用自定义 cron 调度" : "Uses a custom cron schedule";
  if (!trimmed) return zh ? "未设置调度" : "No schedule set";

  const [minute, hour, dayOfMonth, month, dayOfWeek, extra] = trimmed.split(/\s+/);
  if (extra || !minute || !hour || !dayOfMonth || !month || !dayOfWeek) {
    return fallback;
  }
  if (dayOfMonth !== "*" || month !== "*") return fallback;

  const day = describeCronDays(dayOfWeek, zh);
  const time = describeCronTimes(hour, minute, zh);
  if (!day || !time) return fallback;

  return [day.label, time.label, day.note].filter(Boolean).join(zh ? "，" : ", ");
}

function describeCronDays(field: string, zh: boolean) {
  const normalized = field.toLowerCase();
  if (normalized === "*") return { label: zh ? "每天" : "Every day", note: "" };

  const dayNames = zh
    ? ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]
    : ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const namedDays: Record<string, number> = {
    mon: 0,
    tue: 1,
    wed: 2,
    thu: 3,
    fri: 4,
    sat: 5,
    sun: 6,
  };

  const namedRange = parseNamedRange(normalized, namedDays);
  if (namedRange) return { label: formatDayList(namedRange, dayNames, zh), note: "" };

  const numericRange = parseNumericRange(normalized, 0, 6);
  if (numericRange) {
    return {
      label: formatDayList(numericRange, dayNames, zh),
      note: zh
        ? "数字按调度器规则：0=周一"
        : "numeric weekdays use scheduler rules: 0=Monday",
    };
  }

  return null;
}

function describeCronTimes(hourField: string, minuteField: string, zh: boolean) {
  const exactMinute = parseExactNumber(minuteField, 0, 59);
  const hours = parseNumericRange(hourField, 0, 23);
  if (exactMinute != null && hours) {
    const times = hours.map((hour) => `${String(hour).padStart(2, "0")}:${String(exactMinute).padStart(2, "0")}`);
    return {
      label: zh
        ? `${formatList(times, "、", "、")} 运行`
        : `at ${formatList(times, ", ", " and ")}`,
    };
  }

  const everyMinutes = minuteField.match(/^\*\/([1-9]\d?)$/);
  if (everyMinutes && hours) {
    const start = `${String(hours[0]).padStart(2, "0")}:00`;
    const end = `${String(hours[hours.length - 1]).padStart(2, "0")}:59`;
    return {
      label: zh
        ? `${start}-${end} 每 ${everyMinutes[1]} 分钟运行`
        : `every ${everyMinutes[1]} minutes from ${start} to ${end}`,
    };
  }

  return null;
}

function parseNamedRange(field: string, names: Record<string, number>) {
  const values = field.split(",").flatMap((part) => {
    const [start, end, extra] = part.split("-");
    if (extra || !(start in names)) return [];
    if (!end) return [names[start]];
    if (!(end in names) || names[end] < names[start]) return [];
    return range(names[start], names[end]);
  });
  return values.length > 0 ? Array.from(new Set(values)).sort((a, b) => a - b) : null;
}

function parseNumericRange(field: string, min: number, max: number) {
  const values = field.split(",").flatMap((part) => {
    const [startRaw, endRaw, extra] = part.split("-");
    const start = parseExactNumber(startRaw, min, max);
    if (extra || start == null) return [];
    if (!endRaw) return [start];
    const end = parseExactNumber(endRaw, min, max);
    if (end == null || end < start) return [];
    return range(start, end);
  });
  return values.length > 0 ? Array.from(new Set(values)).sort((a, b) => a - b) : null;
}

function parseExactNumber(value: string, min: number, max: number) {
  if (!/^\d+$/.test(value)) return null;
  const number = Number(value);
  return number >= min && number <= max ? number : null;
}

function range(start: number, end: number) {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function formatDayList(days: number[], dayNames: string[], zh: boolean) {
  const labels = days.map((day) => dayNames[day]).filter(Boolean);
  if (labels.length === 5 && days.join(",") === "0,1,2,3,4") {
    return zh ? "周一到周五" : "Monday to Friday";
  }
  return formatList(labels, zh ? "、" : ", ", zh ? "、" : " and ");
}

function formatList(values: string[], separator: string, finalSeparator: string) {
  if (values.length <= 2) return values.join(finalSeparator);
  return `${values.slice(0, -1).join(separator)}${finalSeparator}${values[values.length - 1]}`;
}
