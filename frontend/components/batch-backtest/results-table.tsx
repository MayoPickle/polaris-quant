"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/client";
import { formatCurrency } from "@/lib/i18n/format";
import { cn } from "@/lib/utils";
import type { BatchBacktestSymbolResult } from "@/types";

import { RESULTS_PAGE_SIZE } from "./constants";
import { num, pct, returnTone } from "./formatting";
import { RankingPagination } from "./ranking-pagination";
import { RankingTable } from "./ranking-table-desktop";
import { defaultSortDirection, sortRankedResults } from "./summary-utils";
import type { RankedResult, RankingSortKey, SortDirection } from "./types";

export function ResultsTable({ results }: { results: BatchBacktestSymbolResult[] }) {
  const { locale, t } = useI18n();
  const usd = (n: number) =>
    formatCurrency(n, locale, { maximumFractionDigits: 0 });
  const rankingSortLabels: Record<RankingSortKey, string> = {
    rank: t.batchBacktest.rank,
    symbol: t.batchBacktest.symbol,
    total_return_pct: t.batchBacktest.return,
    buy_hold_return_pct: t.batchBacktest.buyHold,
    alpha_return_pct: t.batchBacktest.alpha,
    sharpe: t.batchBacktest.sharpe,
    max_drawdown_pct: t.batchBacktest.maxDd,
    win_rate_pct: t.batchBacktest.winRate,
    num_trades: t.batchBacktest.trades,
    final_equity: t.batchBacktest.finalEquity,
  };
  const [sort, setSort] = useState<{
    key: RankingSortKey;
    direction: SortDirection;
  }>({
    key: "rank",
    direction: "asc",
  });
  const [page, setPage] = useState(1);

  const ranked = useMemo<RankedResult[]>(
    () => results.map((row, index) => ({ ...row, rank: index + 1 })),
    [results]
  );
  const sorted = useMemo(() => sortRankedResults(ranked, sort.key, sort.direction), [
    ranked,
    sort.direction,
    sort.key,
  ]);
  const pageCount = Math.max(1, Math.ceil(sorted.length / RESULTS_PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageStart = (safePage - 1) * RESULTS_PAGE_SIZE;
  const pageRows = sorted.slice(pageStart, pageStart + RESULTS_PAGE_SIZE);
  const visibleStart = sorted.length === 0 ? 0 : pageStart + 1;
  const visibleEnd = pageStart + pageRows.length;

  function handleSort(key: RankingSortKey) {
    setSort((current) => ({
      key,
      direction:
        current.key === key
          ? current.direction === "asc"
            ? "desc"
            : "asc"
          : defaultSortDirection(key),
    }));
    setPage(1);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h4 className="text-sm font-semibold">{t.batchBacktest.symbolRanking}</h4>
        <p className="text-xs text-muted-foreground">
          {visibleStart}-{visibleEnd} {t.common.of} {sorted.length}
        </p>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 md:hidden">
        {(Object.keys(rankingSortLabels) as RankingSortKey[]).map((key) => (
          <Button
            key={key}
            type="button"
            variant={sort.key === key ? "secondary" : "outline"}
            size="sm"
            className="shrink-0"
            onClick={() => handleSort(key)}
          >
            {rankingSortLabels[key]}
            {sort.key === key && (sort.direction === "asc" ? " ↑" : " ↓")}
          </Button>
        ))}
      </div>
      <RankingCards pageRows={pageRows} usd={usd} />
      <RankingTable
        activeSort={sort}
        onSort={handleSort}
        pageRows={pageRows}
        usd={usd}
      />
      <RankingPagination
        page={safePage}
        pageCount={pageCount}
        onPageChange={setPage}
      />
    </div>
  );
}

function RankingCards({
  pageRows,
  usd,
}: {
  pageRows: RankedResult[];
  usd: (n: number) => string;
}) {
  const { t } = useI18n();

  return (
    <div className="flex flex-col gap-2 md:hidden">
      {pageRows.map((row) => (
        <div key={row.symbol} className="rounded-lg border p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-sm font-semibold">{row.symbol}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                #{row.rank} {t.batchBacktest.byReturn} · {row.num_trades ?? 0} {t.batchBacktest.trades}
              </p>
            </div>
            <p className={cn("shrink-0 text-sm font-semibold", returnTone(row.total_return_pct))}>
              {pct(row.total_return_pct)}
            </p>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <RankingMetric label={t.batchBacktest.sharpe} value={num(row.sharpe)} />
            <RankingMetric label={t.batchBacktest.buyHold} value={pct(row.buy_hold_return_pct)} />
            <RankingMetric label={t.batchBacktest.alpha} value={pct(row.alpha_return_pct)} />
            <RankingMetric label={t.batchBacktest.maxDd} value={pct(row.max_drawdown_pct)} />
            <RankingMetric label={t.batchBacktest.winRate} value={pct(row.win_rate_pct)} />
            <RankingMetric
              label={t.batchBacktest.finalEquity}
              value={row.final_equity === null ? "—" : usd(row.final_equity)}
            />
          </dl>
        </div>
      ))}
    </div>
  );
}

function RankingMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 truncate font-medium">{value}</dd>
    </div>
  );
}
