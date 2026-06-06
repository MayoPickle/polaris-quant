import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState, WorkbenchPanel } from "@/components/workbench";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { formatCurrency } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/config";
import type { Position } from "@/types";

export function PositionsPanel({
  locale,
  positions,
}: {
  locale: Locale;
  positions: Position[] | null;
}) {
  const t = getDictionary(locale);
  const usd = (value: number) => formatCurrency(value, locale);
  const positionRows = positions ?? [];

  return (
    <WorkbenchPanel
      title={t.pages.overview.openPositionsTitle}
      description={t.pages.overview.openPositionsDescription}
      actions={<Badge variant="outline">{positionRows.length} {t.common.symbols}</Badge>}
      contentClassName="p-0"
    >
      <div className="md:hidden">
        {positionRows.map((p) => (
          <div key={p.symbol} className="border-b p-4 last:border-b-0">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold">{p.symbol}</p>
                <p className="text-xs text-muted-foreground">
                  {t.common.qty} {p.qty} · {t.common.avg} {usd(p.avg_entry_price)}
                </p>
              </div>
              <p className={`text-sm font-semibold ${p.unrealized_pl >= 0 ? "text-green-600" : "text-red-600"}`}>
                {usd(p.unrealized_pl)}
              </p>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t.common.marketValue}</span>
              <span className="font-medium">{usd(p.market_value)}</span>
            </div>
          </div>
        ))}
        {(!positions || positions.length === 0) && (
          <div className="p-4">
            <EmptyState>
              {positions === null
                ? t.pages.overview.couldNotLoadPositions
                : t.common.noPositions}
            </EmptyState>
          </div>
        )}
      </div>
      <DesktopPositionsTable locale={locale} positions={positions} />
    </WorkbenchPanel>
  );
}

function DesktopPositionsTable({
  locale,
  positions,
}: {
  locale: Locale;
  positions: Position[] | null;
}) {
  const t = getDictionary(locale);
  const usd = (value: number) => formatCurrency(value, locale);
  const positionRows = positions ?? [];

  return (
    <div className="hidden md:block">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t.batchBacktest.symbol}</TableHead>
            <TableHead className="text-right">{t.common.qty}</TableHead>
            <TableHead className="text-right">{t.common.avgPrice}</TableHead>
            <TableHead className="text-right">{t.common.marketValue}</TableHead>
            <TableHead className="text-right">{t.pages.overview.unrealizedPl}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {positionRows.map((p) => (
            <TableRow key={p.symbol}>
              <TableCell className="font-medium">{p.symbol}</TableCell>
              <TableCell className="text-right">{p.qty}</TableCell>
              <TableCell className="text-right">{usd(p.avg_entry_price)}</TableCell>
              <TableCell className="text-right">{usd(p.market_value)}</TableCell>
              <TableCell className={`text-right ${p.unrealized_pl >= 0 ? "text-green-600" : "text-red-600"}`}>
                {usd(p.unrealized_pl)}
              </TableCell>
            </TableRow>
          ))}
          {(!positions || positions.length === 0) && (
            <TableRow>
              <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                {positions === null
                  ? t.pages.overview.couldNotLoadPositions
                  : t.common.noPositions}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

