import { AppShell } from "@/components/app-shell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
      <section className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label} size="sm" className="rounded-lg md:rounded-xl">
            <CardHeader className="pb-2">
              <CardDescription>{c.label}</CardDescription>
              <CardTitle
                className={`text-xl md:text-2xl ${
                  c.tone === "pos"
                    ? "text-green-600"
                    : c.tone === "neg"
                      ? "text-red-600"
                      : ""
                }`}
              >
                {c.value}
              </CardTitle>
            </CardHeader>
            <CardContent />
          </Card>
        ))}
      </section>

      {!account && (
        <p className="text-sm text-muted-foreground">
          Account data unavailable — check that the broker credentials in the
          backend are valid.
        </p>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold">Open positions</h2>
        <div className="flex flex-col gap-3 md:hidden">
          {(positions ?? []).map((p) => (
            <Card key={p.symbol} size="sm" className="rounded-lg">
              <CardContent className="flex flex-col gap-3">
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
              </CardContent>
            </Card>
          ))}
          {(!positions || positions.length === 0) && (
            <Card size="sm" className="rounded-lg">
              <CardContent className="py-6 text-center text-sm text-muted-foreground">
                {positions === null
                  ? "Could not load positions (broker not connected)."
                  : "No open positions."}
              </CardContent>
            </Card>
          )}
        </div>
        <Card className="hidden md:flex">
          <CardContent className="p-0">
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
          </CardContent>
        </Card>
      </section>
    </AppShell>
  );
}
