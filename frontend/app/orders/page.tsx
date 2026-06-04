import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
      <div className="flex flex-col gap-3 md:hidden">
        {(orders ?? []).map((o) => (
          <Card key={o.id} size="sm" className="rounded-lg">
            <CardContent className="flex flex-col gap-3">
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
            </CardContent>
          </Card>
        ))}
        {(!orders || orders.length === 0) && (
          <Card size="sm" className="rounded-lg">
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              {orders === null ? "Could not load orders." : "No orders yet."}
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
        </CardContent>
      </Card>
    </AppShell>
  );
}
