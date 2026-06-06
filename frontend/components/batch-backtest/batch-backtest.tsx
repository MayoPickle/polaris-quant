"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { DEFAULT_POSITION_SIZING } from "@/components/position-sizing-fields";
import { Badge } from "@/components/ui/badge";
import { WorkbenchPanel } from "@/components/workbench";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n/client";
import { batchStatusLabel } from "@/lib/i18n/format";
import type {
  BacktestUniverse,
  BatchBacktestJob,
  BatchBacktestReport,
  StrategyDescriptor,
} from "@/types";

import { BatchForm } from "./batch-form";
import { BatchReport } from "./batch-report";
import { FINAL_STATUSES } from "./constants";
import { ProgressPanel } from "./progress-panel";
import { pushBatchJobId } from "./url";
import { isRunning, paramsFor } from "./utils";
import type { ParamSpec } from "./types";

export function BatchBacktest({
  strategies,
  universes,
}: {
  strategies: StrategyDescriptor[];
  universes: BacktestUniverse[];
}) {
  const { locale, t } = useI18n();
  const [strategyKey, setStrategyKey] = useState(strategies[0]?.key ?? "");
  const selectedStrategy = useMemo(
    () => strategies.find((s) => s.key === strategyKey) ?? strategies[0],
    [strategies, strategyKey]
  );
  const props = (selectedStrategy?.param_schema?.properties as Record<string, ParamSpec>) ?? {};
  const [params, setParams] = useState<Record<string, number>>(() =>
    paramsFor(selectedStrategy)
  );
  const [selectedUniverses, setSelectedUniverses] = useState<string[]>([]);
  const [symbolsText, setSymbolsText] = useState("");
  const [fileName, setFileName] = useState("");
  const [lookback, setLookback] = useState(365);
  const [timeframe, setTimeframe] = useState("1Day");
  const [initialCapital, setInitialCapital] = useState(100_000);
  const [positionSizing, setPositionSizing] = useState(DEFAULT_POSITION_SIZING);
  const [job, setJob] = useState<BatchBacktestJob | null>(null);
  const [report, setReport] = useState<BatchBacktestReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadFromUrlError = t.batchBacktest.loadFromUrlError;
  const refreshError = t.batchBacktest.refreshError;

  useEffect(() => {
    const jobId = new URLSearchParams(window.location.search).get("batchJobId");

    let cancelled = false;
    void (async () => {
      try {
        const next = jobId ? await api.batchBacktest(jobId) : await api.latestBatchBacktest();
        if (!next || cancelled) return;
        setJob(next);
        if (!jobId) pushBatchJobId(next.id);
        if (next.status === "completed") {
          setReport(await api.batchBacktestReport(next.id));
        }
      } catch {
        if (!cancelled) setError(loadFromUrlError);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadFromUrlError]);

  useEffect(() => {
    const jobId = job?.id;
    const status = job?.status;
    if (!jobId || FINAL_STATUSES.has(status ?? "")) return;

    let cancelled = false;
    const timer = window.setInterval(() => {
      void (async () => {
        try {
          const next = await api.batchBacktest(jobId);
          if (cancelled) return;
          if (next.status === "completed") {
            const nextReport = await api.batchBacktestReport(jobId);
            if (!cancelled) {
              setJob(next);
              setReport(nextReport);
            }
          } else {
            setJob(next);
          }
        } catch {
          if (!cancelled) setError(refreshError);
        }
      })();
    }, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [job?.id, job?.status, refreshError]);

  async function refreshJob(jobId: string) {
    try {
      const next = await api.batchBacktest(jobId);
      setJob(next);
      if (next.status === "completed") {
        setReport(await api.batchBacktestReport(jobId));
      }
    } catch {
      setError(t.batchBacktest.refreshError);
    }
  }

  async function start() {
    if (!strategyKey || loading || isRunning(job)) return;
    if (!symbolsText.trim() && selectedUniverses.length === 0) {
      setError(t.batchBacktest.inputRequiredError);
      return;
    }
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const next = await api.createBatchBacktest({
        strategy_key: strategyKey,
        params,
        symbols_text: symbolsText,
        universes: selectedUniverses,
        timeframe,
        lookback_days: lookback,
        initial_capital: initialCapital,
        position_sizing: positionSizing,
      });
      setJob(next);
      pushBatchJobId(next.id);
    } catch (exc) {
      setError(exc instanceof Error ? `${t.batchBacktest.startError} ${exc.message}` : t.batchBacktest.startError);
    } finally {
      setLoading(false);
    }
  }

  async function cancel() {
    if (!job) return;
    setError(null);
    try {
      setJob(await api.cancelBatchBacktest(job.id));
    } catch {
      setError(t.batchBacktest.cancelError);
    }
  }

  async function loadReport() {
    if (!job) return;
    setError(null);
    try {
      setReport(await api.batchBacktestReport(job.id));
    } catch {
      setError(t.batchBacktest.loadReportError);
    }
  }

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setSymbolsText(await file.text());
  }

  function toggleUniverse(key: string) {
    setSelectedUniverses((keys) =>
      keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key]
    );
  }

  function handleStrategyChange(key: string) {
    setStrategyKey(key);
    setParams(paramsFor(strategies.find((s) => s.key === key)));
  }

  const progress = job?.total_symbols
    ? Math.round((job.completed_symbols / job.total_symbols) * 100)
    : 0;
  const batchRunning = isRunning(job);

  return (
    <WorkbenchPanel
      title={t.batchBacktest.title}
      description={t.batchBacktest.description}
      actions={
        job ? (
          <Badge variant={job.status === "completed" ? "default" : "secondary"}>
            {batchStatusLabel(job.status, locale)}
          </Badge>
        ) : null
      }
      contentClassName="flex flex-col gap-5"
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)]">
        <BatchForm
          batchRunning={batchRunning}
          fileName={fileName}
          initialCapital={initialCapital}
          jobId={job?.id}
          loading={loading}
          lookback={lookback}
          params={params}
          positionSizing={positionSizing}
          props={props}
          selectedUniverses={selectedUniverses}
          strategies={strategies}
          strategyKey={strategyKey}
          symbolsText={symbolsText}
          timeframe={timeframe}
          universes={universes}
          onCancel={() => void cancel()}
          onFileImport={(event) => void importFile(event)}
          onInitialCapitalChange={setInitialCapital}
          onLookbackChange={setLookback}
          onParamChange={(name, value) => setParams((p) => ({ ...p, [name]: value }))}
          onPositionSizingChange={setPositionSizing}
          onRefresh={(jobId) => void refreshJob(jobId)}
          onStart={() => void start()}
          onStrategyChange={handleStrategyChange}
          onSymbolsTextChange={setSymbolsText}
          onTimeframeChange={setTimeframe}
          onUniverseToggle={toggleUniverse}
        />
        <ProgressPanel
          job={job}
          positionSizing={positionSizing}
          progress={progress}
          reportLoaded={!!report}
          onLoadReport={() => void loadReport()}
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {report && <BatchReport report={report} />}
    </WorkbenchPanel>
  );
}
