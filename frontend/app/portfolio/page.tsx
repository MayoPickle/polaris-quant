import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  EmptyState,
  MetricGrid,
  MetricTile,
  WorkbenchPanel,
} from "@/components/workbench";
import { api } from "@/lib/api";
import { formatCurrency } from "@/lib/i18n/format";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { getServerLocale } from "@/lib/i18n/server";
import { safe } from "@/lib/safe";

export default async function PortfolioPage() {
  const locale = await getServerLocale();
  const t = getDictionary(locale);
  const usd = (n: number) => formatCurrency(n, locale);
  const [account, positions] = await Promise.all([
    safe(api.account()),
    safe(api.listPositions()),
  ]);

  const totalUnrealized = (positions ?? []).reduce(
    (sum, p) => sum + p.unrealized_pl,
    0
  );

  const cards = [
    { label: t.pages.overview.equity, value: account ? usd(account.equity) : "—" },
    { label: t.pages.portfolio.cash, value: account ? usd(account.cash) : "—" },
    { label: t.pages.overview.buyingPower, value: account ? usd(account.buying_power) : "—" },
    {
      label: t.pages.overview.unrealizedPl,
      value: positions ? usd(totalUnrealized) : "—",
      tone: totalUnrealized >= 0 ? "pos" : "neg",
    },
  ];

  return (
    <AppShell title={t.pages.portfolio.title} subtitle={t.pages.portfolio.subtitle}>
      <MetricGrid>
        {cards.map((c) => (
          <MetricTile
            key={c.label}
            label={c.label}
            value={c.value}
            detail={
              c.label === t.pages.overview.unrealizedPl
                ? t.pages.portfolio.openPositionsDetail
                : t.common.account
            }
            tone={
              c.tone === "pos"
                ? "positive"
                : c.tone === "neg"
                  ? "negative"
                  : "neutral"
            }
          />
        ))}
      </MetricGrid>

      {!account && (
        <p className="rounded-lg border border-dashed bg-card px-4 py-3 text-sm text-muted-foreground">
          {t.pages.portfolio.brokerCredentialError}
        </p>
      )}

      <WorkbenchPanel
        title={t.pages.portfolio.openPositionsTitle}
        description={t.pages.portfolio.openPositionsDescription}
        actions={<Badge variant="outline">{(positions ?? []).length} {t.common.symbols}</Badge>}
        contentClassName="p-0"
      >
        <div className="md:hidden">
          {(positions ?? []).map((p) => (
            <div key={p.symbol} className="border-b p-4 last:border-b-0">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{p.symbol}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.common.qty} {p.qty} · {t.common.avg} {usd(p.avg_entry_price)}
                    </p>
                  </div>
                  <p
                    className={`text-sm font-semibold ${
                      p.unrealized_pl >= 0 ? "text-green-600" : "text-red-600"
                    }`}
                  >
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
                  ? t.pages.portfolio.couldNotLoadPositionsBroker
                  : t.common.noPositions}
              </EmptyState>
            </div>
          )}
        </div>
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
                {(positions ?? []).map((p) => (
                  <TableRow key={p.symbol}>
                    <TableCell className="font-medium">{p.symbol}</TableCell>
                    <TableCell className="text-right">{p.qty}</TableCell>
                    <TableCell className="text-right">
                      {usd(p.avg_entry_price)}
                    </TableCell>
                    <TableCell className="text-right">
                      {usd(p.market_value)}
                    </TableCell>
                    <TableCell
                      className={`text-right ${
                        p.unrealized_pl >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {usd(p.unrealized_pl)}
                    </TableCell>
                  </TableRow>
                ))}
                {(!positions || positions.length === 0) && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="py-8 text-center text-muted-foreground"
                    >
                      {positions === null
                        ? t.pages.portfolio.couldNotLoadPositionsBroker
                        : t.common.noPositions}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
        </div>
      </WorkbenchPanel>
    </AppShell>
  );
}
