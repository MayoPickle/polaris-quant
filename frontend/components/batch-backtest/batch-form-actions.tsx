"use client";

import { FileUp, Play, RefreshCw, Square } from "lucide-react";
import type { ChangeEvent } from "react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/client";

export function BatchFormActions({
  batchRunning,
  fileName,
  jobId,
  loading,
  strategyKey,
  onCancel,
  onFileImport,
  onRefresh,
  onStart,
}: {
  batchRunning: boolean;
  fileName: string;
  jobId?: string;
  loading: boolean;
  strategyKey: string;
  onCancel: () => void;
  onFileImport: (event: ChangeEvent<HTMLInputElement>) => void;
  onRefresh: (jobId: string) => void;
  onStart: () => void;
}) {
  const { t } = useI18n();

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <label>
        <input
          type="file"
          accept=".csv,.txt,text/csv,text/plain"
          onChange={onFileImport}
          className="sr-only"
        />
        <span className="inline-flex h-8 w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border bg-background px-2.5 text-sm font-medium hover:bg-muted sm:w-auto">
          <FileUp data-icon="inline-start" />
          {t.batchBacktest.importFile}
        </span>
      </label>
      {fileName && (
        <span className="truncate text-sm text-muted-foreground">
          {fileName}
        </span>
      )}
      <div className="flex flex-col gap-2 sm:ml-auto sm:flex-row">
        <Button
          onClick={onStart}
          disabled={loading || batchRunning || !strategyKey}
          className="w-full sm:w-auto"
        >
          <Play data-icon="inline-start" />
          {loading
            ? t.common.starting
            : batchRunning
              ? t.batchBacktest.batchRunning
              : t.batchBacktest.startBatch}
        </Button>
        {jobId && (
          <Button
            variant="outline"
            onClick={() => onRefresh(jobId)}
            className="w-full sm:w-auto"
          >
            <RefreshCw data-icon="inline-start" />
            {t.batchBacktest.refresh}
          </Button>
        )}
        {batchRunning && (
          <Button variant="destructive" onClick={onCancel} className="w-full sm:w-auto">
            <Square data-icon="inline-start" />
            {t.batchBacktest.cancel}
          </Button>
        )}
      </div>
    </div>
  );
}

