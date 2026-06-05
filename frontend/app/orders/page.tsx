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
import {
  formatCurrency,
  orderSideLabel,
  orderStatusLabel,
  orderTypeLabel,
} from "@/lib/i18n/format";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { getServerLocale } from "@/lib/i18n/server";
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
  const locale = await getServerLocale();
  const t = getDictionary(locale);
  const orders = await safe(api.listOrders());

  return (
    <AppShell title={t.pages.orders.title} subtitle={t.pages.orders.subtitle}>
      <WorkbenchPanel
        title={t.pages.orders.historyTitle}
        description={t.pages.orders.historyDescription}
        actions={<Badge variant="outline">{(orders ?? []).length} {t.common.orders}</Badge>}
        contentClassName="p-0"
      >
      <div className="md:hidden">
        {(orders ?? []).map((o) => (
          <div key={o.id} className="border-b p-4 last:border-b-0">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{o.symbol}</p>
                  <p className="text-xs text-muted-foreground">
                    {orderTypeLabel(o.order_type, locale)} · {t.common.qty} {o.qty} · {t.common.filled} {o.filled_qty}
                  </p>
                </div>
                <Badge variant={statusVariant(o.status)}>
                  {orderStatusLabel(o.status, locale)}
                </Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span
                  className={
                    o.side === "buy" ? "text-green-600" : "text-red-600"
                  }
                >
                  {orderSideLabel(o.side, locale)}
                </span>
                <span className="font-medium">
                  {o.filled_avg_price != null
                    ? `${formatCurrency(o.filled_avg_price, locale)} ${t.common.avg}`
                    : t.common.noFillPrice}
              </span>
            </div>
          </div>
        ))}
        {(!orders || orders.length === 0) && (
          <div className="p-4">
            <EmptyState>
              {orders === null ? t.pages.orders.couldNotLoadOrders : t.common.noOrders}
            </EmptyState>
          </div>
        )}
      </div>

      <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.batchBacktest.symbol}</TableHead>
                <TableHead>{t.common.side}</TableHead>
                <TableHead>{t.common.type}</TableHead>
                <TableHead className="text-right">{t.common.qty}</TableHead>
                <TableHead className="text-right">{t.common.filled}</TableHead>
                <TableHead className="text-right">{t.common.avgPrice}</TableHead>
                <TableHead className="text-right">{t.batchBacktest.status}</TableHead>
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
                      {orderSideLabel(o.side, locale)}
                    </span>
                  </TableCell>
                  <TableCell>{orderTypeLabel(o.order_type, locale)}</TableCell>
                  <TableCell className="text-right">{o.qty}</TableCell>
                  <TableCell className="text-right">{o.filled_qty}</TableCell>
                  <TableCell className="text-right">
                    {o.filled_avg_price != null
                      ? formatCurrency(o.filled_avg_price, locale)
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant={statusVariant(o.status)}>
                      {orderStatusLabel(o.status, locale)}
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
                      ? t.pages.orders.couldNotLoadOrders
                      : t.common.noOrders}
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
