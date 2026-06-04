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
import { safe } from "@/lib/safe";

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export default async function PortfolioPage() {
  const [account, positions] = await Promise.all([
    safe(api.account()),
    safe(api.listPositions()),
  ]);

  const totalUnrealized = (positions ?? []).reduce(
    (sum, p) => sum + p.unrealized_pl,
    0
  );

  const cards = [
    { label: "Equity", value: account ? usd(account.equity) : "—" },
    { label: "Cash", value: account ? usd(account.cash) : "—" },
    { label: "Buying power", value: account ? usd(account.buying_power) : "—" },
    {
      label: "Unrealized P/L",
      value: positions ? usd(totalUnrealized) : "—",
      tone: totalUnrealized >= 0 ? "pos" : "neg",
    },
  ];

  return (
    <AppShell title="Portfolio" subtitle="Account balances and open positions">
      <MetricGrid>
        {cards.map((c) => (
          <MetricTile
            key={c.label}
            label={c.label}
            value={c.value}
            detail={c.label === "Unrealized P/L" ? "Open positions" : "Account"}
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
          Account data unavailable — check that the broker credentials in the
          backend are valid.
        </p>
      )}

      <WorkbenchPanel
        title="Open positions"
        description="Symbol exposure, market value, and unrealized P/L."
        actions={<Badge variant="outline">{(positions ?? []).length} symbols</Badge>}
        contentClassName="p-0"
      >
        <div className="md:hidden">
          {(positions ?? []).map((p) => (
            <div key={p.symbol} className="border-b p-4 last:border-b-0">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{p.symbol}</p>
                    <p className="text-xs text-muted-foreground">
                      Qty {p.qty} · Avg {usd(p.avg_entry_price)}
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
                  <span className="text-muted-foreground">Market value</span>
                  <span className="font-medium">{usd(p.market_value)}</span>
                </div>
            </div>
          ))}
          {(!positions || positions.length === 0) && (
            <div className="p-4">
              <EmptyState>
                {positions === null
                  ? "Could not load positions (broker not connected)."
                  : "No open positions."}
              </EmptyState>
            </div>
          )}
        </div>
        <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Symbol</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Avg entry</TableHead>
                  <TableHead className="text-right">Market value</TableHead>
                  <TableHead className="text-right">Unrealized P/L</TableHead>
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
                        ? "Could not load positions (broker not connected)."
                        : "No open positions."}
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
