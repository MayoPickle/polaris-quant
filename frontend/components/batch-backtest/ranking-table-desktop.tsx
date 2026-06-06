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
import { cn } from "@/lib/utils";

import { num, pct, returnTone } from "./formatting";
import type { RankedResult, RankingSortKey, SortDirection } from "./types";

export function RankingTable({
  activeSort,
  onSort,
  pageRows,
  usd,
}: {
  activeSort: { key: RankingSortKey; direction: SortDirection };
  onSort: (key: RankingSortKey) => void;
  pageRows: RankedResult[];
  usd: (n: number) => string;
}) {
  const { t } = useI18n();

  return (
    <div className="hidden overflow-x-auto rounded-lg border md:block">
      <Table className="min-w-[62rem]">
        <TableHeader>
          <TableRow>
            <SortableTableHead label={t.batchBacktest.rank} sortKey="rank" activeSort={activeSort} onSort={onSort} />
            <SortableTableHead label={t.batchBacktest.symbol} sortKey="symbol" activeSort={activeSort} onSort={onSort} />
            <SortableTableHead label={t.batchBacktest.return} sortKey="total_return_pct" activeSort={activeSort} onSort={onSort} align="right" />
            <SortableTableHead label={t.batchBacktest.buyHold} sortKey="buy_hold_return_pct" activeSort={activeSort} onSort={onSort} align="right" />
            <SortableTableHead label={t.batchBacktest.alpha} sortKey="alpha_return_pct" activeSort={activeSort} onSort={onSort} align="right" />
            <SortableTableHead label={t.batchBacktest.sharpe} sortKey="sharpe" activeSort={activeSort} onSort={onSort} align="right" />
            <SortableTableHead label={t.batchBacktest.maxDd} sortKey="max_drawdown_pct" activeSort={activeSort} onSort={onSort} align="right" />
            <SortableTableHead label={t.batchBacktest.winRate} sortKey="win_rate_pct" activeSort={activeSort} onSort={onSort} align="right" />
            <SortableTableHead label={t.batchBacktest.trades} sortKey="num_trades" activeSort={activeSort} onSort={onSort} align="right" />
            <SortableTableHead label={t.batchBacktest.finalEquity} sortKey="final_equity" activeSort={activeSort} onSort={onSort} align="right" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {pageRows.map((row) => (
            <TableRow key={row.symbol}>
              <TableCell className="text-xs text-muted-foreground">#{row.rank}</TableCell>
              <TableCell className="font-mono text-xs">{row.symbol}</TableCell>
              <TableCell className={cn("text-right font-medium", returnTone(row.total_return_pct))}>
                {pct(row.total_return_pct)}
              </TableCell>
              <TableCell className={cn("text-right", returnTone(row.buy_hold_return_pct))}>
                {pct(row.buy_hold_return_pct)}
              </TableCell>
              <TableCell className={cn("text-right font-medium", returnTone(row.alpha_return_pct))}>
                {pct(row.alpha_return_pct)}
              </TableCell>
              <TableCell className="text-right">{num(row.sharpe)}</TableCell>
              <TableCell className="text-right text-red-600">
                {pct(row.max_drawdown_pct)}
              </TableCell>
              <TableCell className="text-right">{pct(row.win_rate_pct)}</TableCell>
              <TableCell className="text-right">{row.num_trades ?? 0}</TableCell>
              <TableCell className="text-right">
                {row.final_equity === null ? "—" : usd(row.final_equity)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function SortableTableHead({
  label,
  sortKey,
  activeSort,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: RankingSortKey;
  activeSort: { key: RankingSortKey; direction: SortDirection };
  onSort: (key: RankingSortKey) => void;
  align?: "left" | "right";
}) {
  const active = activeSort.key === sortKey;
  return (
    <TableHead className={align === "right" ? "text-right" : undefined}>
      <button
        type="button"
        className={cn(
          "inline-flex h-7 items-center gap-1 rounded-md text-xs font-semibold uppercase tracking-[0.02em] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
          align === "right" && "ml-auto"
        )}
        onClick={() => onSort(sortKey)}
      >
        {label}
        {active && (
          <span className="text-[0.65rem] text-foreground">
            {activeSort.direction === "asc" ? "↑" : "↓"}
          </span>
        )}
      </button>
    </TableHead>
  );
}

