import { PositionPriceHistoryChart } from "@/components/position-price-history-chart";
import { Badge } from "@/components/ui/badge";
import { EmptyState, WorkbenchPanel } from "@/components/workbench";
import { getDictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import type { MarketBarsResponse, Position } from "@/types";

export function PriceHistoryPanel({
  locale,
  positions,
  priceHistory,
  priceHistorySymbols,
}: {
  locale: Locale;
  positions: Position[] | null;
  priceHistory: MarketBarsResponse | null | undefined;
  priceHistorySymbols: string[];
}) {
  const t = getDictionary(locale);

  return (
    <WorkbenchPanel
      title={t.pages.overview.priceHistoryTitle}
      description={t.pages.overview.priceHistoryDescription}
      actions={
        <Badge
          variant={
            priceHistory === null && priceHistorySymbols.length > 0
              ? "destructive"
              : "outline"
          }
        >
          {priceHistory
            ? `${priceHistory.series.length} ${t.common.symbols}`
            : priceHistorySymbols.length > 0
              ? t.common.unavailable
              : t.common.noPositions}
        </Badge>
      }
    >
      {priceHistory ? (
        <PositionPriceHistoryChart series={priceHistory.series} />
      ) : (
        <EmptyState>
          {priceHistorySymbols.length > 0
            ? t.pages.overview.couldNotLoadPriceHistory
            : positions === null
              ? t.pages.overview.couldNotLoadPositions
              : t.pages.overview.noOpenPositionsToChart}
        </EmptyState>
      )}
    </WorkbenchPanel>
  );
}

