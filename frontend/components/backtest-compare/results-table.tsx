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
import { formatCurrency } from "@/lib/i18n/format";
import type { BacktestResult } from "@/types";

import { COLORS } from "./constants";

export function CompareResultsTable({ results }: { results: BacktestResult[] }) {
  const { locale, t } = useI18n();
  const usd = (n: number) =>
    formatCurrency(n, locale, { maximumFractionDigits: 0 });

  return (
    <div className="hidden md:block">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t.backtestCompare.run}</TableHead>
            <TableHead className="text-right">{t.backtestCompare.return}</TableHead>
            <TableHead className="text-right">{t.backtestCompare.buyHold}</TableHead>
            <TableHead className="text-right">{t.backtestCompare.alpha}</TableHead>
            <TableHead className="text-right">{t.backtestCompare.trades}</TableHead>
            <TableHead className="text-right">{t.backtestCompare.winRate}</TableHead>
            <TableHead className="text-right">{t.backtestCompare.maxDd}</TableHead>
            <TableHead className="text-right">{t.backtestCompare.sharpe}</TableHead>
            <TableHead className="text-right">{t.backtestCompare.finalEquity}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {results.map((res, i) => (
            <TableRow key={i}>
              <TableCell className="font-medium">
                <span className="flex items-center gap-2">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: COLORS[i % COLORS.length] }}
                  />
                  {res.label ?? `${t.backtestCompare.run} ${i + 1}`}
                </span>
              </TableCell>
              <ReturnCell value={res.total_return_pct} className="font-medium" />
              <ReturnCell value={res.buy_hold_return_pct} />
              <ReturnCell value={res.alpha_return_pct} className="font-medium" />
              <TableCell className="text-right">{res.num_trades}</TableCell>
              <TableCell className="text-right">{res.win_rate_pct.toFixed(0)}%</TableCell>
              <TableCell className="text-right text-red-600">
                {res.max_drawdown_pct.toFixed(2)}%
              </TableCell>
              <TableCell className="text-right">{res.sharpe.toFixed(2)}</TableCell>
              <TableCell className="text-right">{usd(res.final_equity)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ReturnCell({ value, className = "" }: { value: number; className?: string }) {
  return (
    <TableCell className={`text-right ${className} ${value >= 0 ? "text-green-600" : "text-red-600"}`}>
      {value.toFixed(2)}%
    </TableCell>
  );
}

