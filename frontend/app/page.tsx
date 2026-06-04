import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
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
import type { Position, StrategyDescriptor } from "@/types";

type Health = {
  status: string;
  app: string;
  env: string;
  broker_env: string;
  trading_enabled: boolean;
};

export default async function OverviewPage() {
  const [health, clock, strategies, positions] = await Promise.all([
    safe<Health>(
      fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/health`, {
        cache: "no-store",
      }).then((r) => r.json())
    ),
    safe(api.marketClock()),
    safe(api.availableStrategies()),
    safe(api.listPositions()),
  ]);

  const stats = [
    {
      label: "Market",
      value: clock?.is_open ? "Open" : "Closed",
      tone: clock?.is_open ? "ok" : "muted",
    },
    {
      label: "Trading",
      value: health?.trading_enabled ? "Enabled" : "Disabled",
      tone: health?.trading_enabled ? "ok" : "warn",
    },
    { label: "Broker", value: health?.broker_env ?? "—", tone: "muted" },
    { label: "Environment", value: health?.env ?? "—", tone: "muted" },
  ];

  return (
    <AppShell
      title="Overview"
      subtitle={health ? `Connected to ${health.app} API` : "Backend unreachable"}
      actions={
        <Badge variant={health ? "default" : "destructive"}>
          {health ? "API online" : "API offline"}
        </Badge>
      }
    >
      <section className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} size="sm" className="rounded-lg md:rounded-xl">
            <CardHeader className="pb-2">
              <CardDescription>{s.label}</CardDescription>
              <CardTitle className="text-xl capitalize md:text-2xl">
                {s.value}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  s.tone === "ok"
                    ? "bg-green-500"
                    : s.tone === "warn"
                      ? "bg-amber-500"
                      : "bg-muted-foreground/40"
                }`}
              />
            </CardContent>
          </Card>
        ))}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Available strategies</h2>
        <div className="flex flex-col gap-3 md:hidden">
          {(strategies ?? []).map((s: StrategyDescriptor) => (
            <Card key={s.key} size="sm" className="rounded-lg">
              <CardContent className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{s.name}</p>
                    <p className="line-clamp-2 text-sm text-muted-foreground">
                      {s.description}
                    </p>
                  </div>
                  <Badge variant="secondary" className="font-mono text-xs">
                    {s.key}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {
                    Object.keys((s.param_schema?.properties as object) ?? {})
                      .length
                  }{" "}
                  parameters
                </p>
              </CardContent>
            </Card>
          ))}
          {(!strategies || strategies.length === 0) && (
            <Card size="sm" className="rounded-lg">
              <CardContent className="py-6 text-center text-sm text-muted-foreground">
                No strategies registered.
              </CardContent>
            </Card>
          )}
        </div>
        <Card className="hidden md:flex">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Key</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Parameters</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(strategies ?? []).map((s: StrategyDescriptor) => (
                  <TableRow key={s.key}>
                    <TableCell>
                      <Badge variant="secondary" className="font-mono text-xs">
                        {s.key}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="max-w-md text-muted-foreground">
                      {s.description}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {
                        Object.keys(
                          (s.param_schema?.properties as object) ?? {}
                        ).length
                      }
                    </TableCell>
                  </TableRow>
                ))}
                {(!strategies || strategies.length === 0) && (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="py-8 text-center text-muted-foreground"
                    >
                      No strategies registered.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Open positions</h2>
        <div className="flex flex-col gap-3 md:hidden">
          {(positions ?? []).map((p: Position) => (
            <Card key={p.symbol} size="sm" className="rounded-lg">
              <CardContent className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{p.symbol}</p>
                    <p className="text-xs text-muted-foreground">
                      Qty {p.qty} · Avg ${p.avg_entry_price.toFixed(2)}
                    </p>
                  </div>
                  <p
                    className={`text-sm font-semibold ${
                      p.unrealized_pl >= 0 ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    ${p.unrealized_pl.toFixed(2)}
                  </p>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Market value</span>
                  <span className="font-medium">${p.market_value.toFixed(2)}</span>
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
                {(positions ?? []).map((p: Position) => (
                  <TableRow key={p.symbol}>
                    <TableCell className="font-medium">{p.symbol}</TableCell>
                    <TableCell className="text-right">{p.qty}</TableCell>
                    <TableCell className="text-right">
                      ${p.avg_entry_price.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      ${p.market_value.toFixed(2)}
                    </TableCell>
                    <TableCell
                      className={`text-right ${
                        p.unrealized_pl >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      ${p.unrealized_pl.toFixed(2)}
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
