"use client";

import { Search } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState, Field, WorkbenchPanel } from "@/components/workbench";
import { useI18n } from "@/lib/i18n/client";
import { formatDateTime } from "@/lib/i18n/format";
import type { MarketDataCoverage } from "@/types";

import { formatNumber } from "./utils";

export function MarketDataCoveragePanel({
  rows,
  loading,
  onSearch,
}: {
  rows: MarketDataCoverage[];
  loading: boolean;
  onSearch: (symbol: string) => Promise<void>;
}) {
  const { locale, t } = useI18n();
  const [symbol, setSymbol] = useState("AAPL");

  return (
    <WorkbenchPanel title={t.marketData.coverageTitle} description={t.marketData.coverageDescription}>
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <Field label={t.marketData.searchSymbol}>
            <input
              value={symbol}
              onChange={(event) => setSymbol(event.target.value.toUpperCase())}
              className="h-10 w-full rounded-lg border bg-background px-3 text-sm uppercase"
            />
          </Field>
          <Button
            className="self-end"
            disabled={loading || !symbol.trim()}
            onClick={() => onSearch(symbol)}
          >
            <Search data-icon="inline-start" />
            {t.marketData.searchSymbol}
          </Button>
        </div>

        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.batchBacktest.symbol}</TableHead>
                <TableHead>{t.marketData.coverageWindow}</TableHead>
                <TableHead className="text-right">{t.marketData.rowCounts}</TableHead>
                <TableHead className="text-right">{t.marketData.latest}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={`${row.provider}-${row.feed}-${row.timeframe}-${row.symbol}`}>
                  <TableCell>
                    <div className="flex min-w-32 flex-col gap-1">
                      <span className="font-medium">{row.symbol}</span>
                      <Badge variant="outline">
                        {row.provider}/{row.feed}/{row.timeframe}/{row.adjustment}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="min-w-52 text-xs">
                    <p>{formatDateTime(row.first_ts, locale)}</p>
                    <p className="text-muted-foreground">{formatDateTime(row.last_ts, locale)}</p>
                  </TableCell>
                  <TableCell className="text-right">
                    {formatNumber(row.row_count, locale)}
                  </TableCell>
                  <TableCell className="text-right text-xs">
                    {formatDateTime(row.last_success_at, locale)}
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="p-4">
                    <EmptyState>{t.marketData.noCoverageForSymbol}</EmptyState>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </WorkbenchPanel>
  );
}
