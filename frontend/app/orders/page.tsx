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
import { EmptyState, WorkbenchPanel } from "@/components/workbench";
import { api } from "@/lib/api";
import { safe } from "@/lib/safe";

function statusVariant(
  status: string
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "filled") return "default";
  if (status === "rejected" || status === "canceled") return "destructive";
  if (status === "partially_filled") return "secondary";
  return "outline";
}

export default async function OrdersPage() {
  const orders = await safe(api.listOrders());

  return (
    <AppShell title="Orders" subtitle="Order history across manual and strategy trades">
      <WorkbenchPanel
        title="Order history"
        description="Manual and strategy-generated orders in one ledger."
        actions={<Badge variant="outline">{(orders ?? []).length} orders</Badge>}
        contentClassName="p-0"
      >
      <div className="md:hidden">
        {(orders ?? []).map((o) => (
          <div key={o.id} className="border-b p-4 last:border-b-0">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{o.symbol}</p>
                  <p className="text-xs text-muted-foreground">
                    {o.order_type} · Qty {o.qty} · Filled {o.filled_qty}
                  </p>
                </div>
                <Badge variant={statusVariant(o.status)}>
                  {o.status.replace("_", " ")}
                </Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span
                  className={
                    o.side === "buy" ? "text-green-600" : "text-red-600"
                  }
                >
                  {o.side.toUpperCase()}
                </span>
                <span className="font-medium">
                  {o.filled_avg_price != null
                    ? `$${o.filled_avg_price.toFixed(2)} avg`
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
                <TableHead className="text-right">Avg price</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(orders ?? []).map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-medium">{o.symbol}</TableCell>
                  <TableCell>
                    <span
                      className={
                        o.side === "buy" ? "text-green-600" : "text-red-600"
                      }
                    >
                      {o.side.toUpperCase()}
                    </span>
                  </TableCell>
                  <TableCell className="capitalize">{o.order_type}</TableCell>
                  <TableCell className="text-right">{o.qty}</TableCell>
                  <TableCell className="text-right">{o.filled_qty}</TableCell>
                  <TableCell className="text-right">
                    {o.filled_avg_price != null
                      ? `$${o.filled_avg_price.toFixed(2)}`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant={statusVariant(o.status)}>
                      {o.status.replace("_", " ")}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {(!orders || orders.length === 0) && (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-8 text-center text-muted-foreground"
                  >
                    {orders === null
                      ? "Could not load orders."
                      : "No orders yet."}
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
