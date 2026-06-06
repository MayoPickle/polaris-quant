"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useI18n } from "@/lib/i18n/client";
import type { BatchBacktestSymbolResult } from "@/types";

export function FailuresList({ failed }: { failed: BatchBacktestSymbolResult[] }) {
  const { t } = useI18n();

  if (failed.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <h4 className="text-sm font-semibold">{t.batchBacktest.failures}</h4>
      <div className="flex flex-col gap-2 md:hidden">
        {failed.slice(0, 25).map((row) => (
          <div key={row.symbol} className="rounded-lg border p-3">
            <p className="font-mono text-xs font-medium">{row.symbol}</p>
            <p className="mt-2 text-sm text-muted-foreground">{row.error}</p>
          </div>
        ))}
      </div>
      <div className="hidden overflow-x-auto rounded-lg border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t.batchBacktest.symbol}</TableHead>
              <TableHead>{t.batchBacktest.error}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {failed.slice(0, 50).map((row) => (
              <TableRow key={row.symbol}>
                <TableCell className="font-mono text-xs">{row.symbol}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {row.error}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

