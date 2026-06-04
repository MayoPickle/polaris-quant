import { AppShell } from "@/components/app-shell";
import { PositionPriceHistoryChart } from "@/components/position-price-history-chart";
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
  StatusDot,
  WorkbenchPanel,
} from "@/components/workbench";
import { api } from "@/lib/api";
import { safe } from "@/lib/safe";
import type { Order, Position, StrategyInstance } from "@/types";

const usd = (value: number) =>
  value.toLocaleString("en-US", { style: "currency", currency: "USD" });

const pct = (value: number) => `${value.toFixed(Math.abs(value) >= 10 ? 0 : 1)}%`;

function orderStatusVariant(
  status: string
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "filled") return "default";
  if (status === "rejected" || status === "canceled") return "destructive";
  if (status === "partially_filled") return "secondary";
  return "outline";
}

function formatDate(value: string | null) {
  if (!value) return "Never";
  return new Date(value).toLocaleString();
}

export default async function OverviewPage() {
  const [health, clock, account, positions, orders, strategyInstances] = await Promise.all([
    safe(api.health()),
    safe(api.marketClock()),
    safe(api.account()),
    safe(api.listPositions()),
    safe(api.listOrders()),
    safe(api.listStrategies()),
  ]);

  const positionRows = positions ?? [];
  const orderRows = orders ?? [];
  const strategyRows = strategyInstances ?? [];
  const activeStrategies = strategyRows.filter((strategy) => strategy.is_active);
  const erroredStrategies = strategyRows.filter((strategy) => strategy.last_error);
  const recentOrders = orderRows.slice(0, 6);
  const totalUnrealized = positionRows.reduce((sum, p) => sum + p.unrealized_pl, 0);
  const grossExposure = positionRows.reduce((sum, p) => sum + p.market_value, 0);
  const exposurePct = account && account.equity > 0 ? (grossExposure / account.equity) * 100 : null;
  const pendingOrders = orderRows.filter(
    (order) => !["filled", "canceled", "rejected"].includes(order.status)
  ).length;
  const priceHistorySymbols = [...positionRows]
    .sort((a, b) => b.market_value - a.market_value)
    .slice(0, 5)
    .map((position) => position.symbol);
  const priceHistory =
    priceHistorySymbols.length > 0
      ? await safe(
          api.marketBars(priceHistorySymbols, {
            timeframe: "1Day",
            lookback_days: 90,
          })
        )
      : undefined;

  const accountStats = [
    {
      label: "Equity",
      value: account ? usd(account.equity) : "—",
      tone: "neutral",
      detail: account ? `${usd(account.cash)} cash` : "Account unavailable",
    },
    {
      label: "Buying power",
      value: account ? usd(account.buying_power) : "—",
      tone: "info",
      detail: "Available capacity",
    },
    {
      label: "Exposure",
      value: exposurePct == null ? "—" : pct(exposurePct),
      tone: exposurePct != null && exposurePct > 80 ? "warning" : "neutral",
      detail: `${usd(grossExposure)} market value`,
    },
    {
      label: "Unrealized P/L",
      value: positions ? usd(totalUnrealized) : "—",
      tone: totalUnrealized > 0 ? "positive" : totalUnrealized < 0 ? "negative" : "neutral",
      detail: `${positionRows.length} open positions`,
    },
  ] as const;

  const operatingStatus = [
    {
      label: "Market",
      value: clock?.is_open ? "Open" : "Closed",
      detail: "US equities",
      tone: clock?.is_open ? "positive" : "neutral",
    },
    {
      label: "Trading guard",
      value: health?.trading_enabled ? "Enabled" : "Disabled",
      detail: "Order gate",
      tone: health?.trading_enabled ? "positive" : "warning",
    },
    {
      label: "Broker",
      value: health?.broker_env?.toUpperCase() ?? "—",
      detail: health?.env ?? "API unavailable",
      tone: "neutral",
    },
    {
      label: "Sizing",
      value: health?.openai_sizing_enabled
        ? health.position_model
        : `${health?.default_position_allocation_pct ?? 1}% preset`,
      detail: health?.openai_sizing_enabled ? "OpenAI allocator" : "Fallback allocation",
      tone: health?.openai_sizing_enabled ? "info" : "neutral",
    },
  ] as const;

  return (
    <AppShell
      title="Overview"
      subtitle={health ? "Account, automation, and order flow" : "Backend unreachable"}
      actions={
        <Badge variant={health ? "default" : "destructive"}>
          {health ? "API online" : "API offline"}
        </Badge>
      }
    >
      <MetricGrid>
        {accountStats.map((s) => (
          <MetricTile
            key={s.label}
            label={s.label}
            value={s.value}
            detail={s.detail}
            tone={s.tone}
          />
        ))}
      </MetricGrid>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_23rem]">
        <WorkbenchPanel
          title="Operating status"
          description="Current broker and automation readiness."
          actions={<Badge variant={pendingOrders > 0 ? "secondary" : "outline"}>{pendingOrders} pending</Badge>}
        >
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {operatingStatus.map((item) => (
              <div key={item.label} className="min-w-0 rounded-md border bg-background p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-xs font-medium text-muted-foreground">{item.label}</p>
                  <StatusDot tone={item.tone} />
                </div>
                <p className="mt-2 truncate text-sm font-semibold">{item.value}</p>
                <p className="mt-1 truncate text-xs text-muted-foreground">{item.detail}</p>
              </div>
            ))}
          </div>
        </WorkbenchPanel>

        <WorkbenchPanel
          title="Automation"
          description={`${activeStrategies.length} active · ${strategyRows.length} configured`}
          actions={
            <Badge variant={erroredStrategies.length > 0 ? "destructive" : activeStrategies.length > 0 ? "default" : "outline"}>
              {erroredStrategies.length > 0 ? "Errors" : activeStrategies.length > 0 ? "Running" : "Idle"}
            </Badge>
          }
          className="self-start"
          contentClassName="flex flex-col gap-2"
        >
          {activeStrategies.slice(0, 4).map((strategy: StrategyInstance) => (
            <div key={strategy.id} className="rounded-md border bg-background p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{strategy.name}</p>
                  <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                    {strategy.strategy_key}
                  </p>
                </div>
                <Badge variant="default">On</Badge>
              </div>
              <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                <p className="truncate">{strategy.symbols.join(", ") || "No symbols"}</p>
                <p className="truncate font-mono">{strategy.schedule || "No schedule"}</p>
                <p>Last run: {formatDate(strategy.last_run_at)}</p>
              </div>
              {strategy.last_error && (
                <p className="mt-2 line-clamp-2 text-xs text-red-600">{strategy.last_error}</p>
              )}
            </div>
          ))}
          {activeStrategies.length > 4 && (
            <p className="px-1 text-xs text-muted-foreground">
              +{activeStrategies.length - 4} more active strategies
            </p>
          )}
          {strategyInstances === null && <EmptyState className="py-5">Could not load automation.</EmptyState>}
          {strategyInstances !== null && activeStrategies.length === 0 && (
            <EmptyState className="py-5">No active automated strategies.</EmptyState>
          )}
        </WorkbenchPanel>
      </div>

      <WorkbenchPanel
        title="Position price history"
        description="Daily close for the five largest open positions over the last 90 days."
        actions={
          <Badge
            variant={
              priceHistory === null && priceHistorySymbols.length > 0
                ? "destructive"
                : "outline"
            }
          >
            {priceHistory
              ? `${priceHistory.series.length} symbols`
              : priceHistorySymbols.length > 0
                ? "Unavailable"
                : "No positions"}
          </Badge>
        }
      >
        {priceHistory ? (
          <PositionPriceHistoryChart series={priceHistory.series} />
        ) : (
          <EmptyState>
            {priceHistorySymbols.length > 0
              ? "Could not load price history."
              : positions === null
                ? "Could not load positions."
                : "No open positions to chart."}
          </EmptyState>
        )}
      </WorkbenchPanel>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <WorkbenchPanel
          title="Open positions"
          description="Current exposure and unrealized performance."
          actions={<Badge variant="outline">{positionRows.length} symbols</Badge>}
          contentClassName="p-0"
        >
          <div className="md:hidden">
            {positionRows.map((p: Position) => (
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
                    ? "Could not load positions."
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
                {positionRows.map((p: Position) => (
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
                        ? "Could not load positions."
                        : "No open positions."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </WorkbenchPanel>

        <WorkbenchPanel
          title="Recent orders"
          description="Latest manual and automated orders."
          actions={<Badge variant="outline">{orderRows.length} orders</Badge>}
          contentClassName="p-0"
        >
          <div className="md:hidden">
            {recentOrders.map((order: Order) => (
              <div key={order.id} className="border-b p-4 last:border-b-0">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{order.symbol}</p>
                    <p className="text-xs text-muted-foreground">
                      {order.order_type} · Qty {order.qty} · Filled {order.filled_qty}
                    </p>
                  </div>
                  <Badge variant={orderStatusVariant(order.status)}>
                    {order.status.replace("_", " ")}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className={order.side === "buy" ? "text-green-600" : "text-red-600"}>
                    {order.side.toUpperCase()}
                  </span>
                  <span className="font-medium">
                    {order.filled_avg_price != null
                      ? `${usd(order.filled_avg_price)} avg`
                      : "No fill price"}
                  </span>
                </div>
              </div>
            ))}
            {(!orders || orders.length === 0) && (
              <div className="p-4">
                <EmptyState>
                  {orders === null ? "Could not load orders." : "No orders yet."}
                </EmptyState>
              </div>
            )}
          </div>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Side</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Filled</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentOrders.map((order: Order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium">{order.symbol}</TableCell>
                    <TableCell>
                      <span className={order.side === "buy" ? "text-green-600" : "text-red-600"}>
                        {order.side.toUpperCase()}
                      </span>
                    </TableCell>
                    <TableCell className="capitalize">{order.order_type}</TableCell>
                    <TableCell className="text-right">{order.qty}</TableCell>
                    <TableCell className="text-right">{order.filled_qty}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={orderStatusVariant(order.status)}>
                        {order.status.replace("_", " ")}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {(!orders || orders.length === 0) && (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="py-8 text-center text-muted-foreground"
                    >
                      {orders === null ? "Could not load orders." : "No orders yet."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </WorkbenchPanel>
      </div>
    </AppShell>
  );
}
