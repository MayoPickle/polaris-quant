import { AppShell } from "@/components/app-shell";
import { OrderCancelButton } from "@/components/order-cancel-button";
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
import {
  formatCurrency,
  formatDateTime,
  orderSideLabel,
  orderSessionLabel,
  orderSourceLabel,
  orderStatusLabel,
  orderTypeLabel,
} from "@/lib/i18n/format";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { getServerLocale } from "@/lib/i18n/server";
import { safe } from "@/lib/safe";
import { serverApi as api } from "@/lib/server-api";
import type { Locale } from "@/lib/i18n/config";
import type { Order } from "@/types";

function statusVariant(
  status: string
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "filled") return "default";
  if (status === "rejected" || status === "canceled") return "destructive";
  if (status === "partially_filled") return "secondary";
  return "outline";
}

function sourceVariant(source: string): "secondary" | "outline" {
  return source === "automated" ? "secondary" : "outline";
}

function priceLabel(value: number | null | undefined, locale: Locale) {
  return value != null ? formatCurrency(value, locale) : "—";
}

function canCancelOrder(order: Order) {
  return (
    order.broker_order_id != null &&
    ["new", "accepted", "partially_filled"].includes(order.status)
  );
}

export default async function HistoryPage() {
  const locale = await getServerLocale();
  const t = getDictionary(locale);
  const orders = await safe(api.listOrders());
  const orderRows = orders ?? [];

  return (
    <AppShell title={t.pages.history.title} subtitle={t.pages.history.subtitle}>
      <WorkbenchPanel
        title={t.pages.history.historyTitle}
        description={t.pages.history.historyDescription}
        actions={<Badge variant="outline">{orderRows.length} {t.common.orders}</Badge>}
        contentClassName="p-0"
      >
        <MobileHistoryList locale={locale} orders={orders} />
        <DesktopHistoryTable locale={locale} orders={orders} />
      </WorkbenchPanel>
    </AppShell>
  );
}

function MobileHistoryList({
  locale,
  orders,
}: {
  locale: Locale;
  orders: Order[] | null;
}) {
  const t = getDictionary(locale);

  return (
    <div className="md:hidden">
      {(orders ?? []).map((order) => (
        <div key={order.id} className="flex flex-col gap-3 border-b p-4 last:border-b-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold">{order.symbol}</p>
              <p className="text-xs text-muted-foreground">
                {formatDateTime(order.created_at, locale)}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap justify-end gap-2">
              <Badge variant={sourceVariant(order.source)}>
                {orderSourceLabel(order.source, locale)}
              </Badge>
              <Badge variant={statusVariant(order.status)}>
                {orderStatusLabel(order.status, locale)}
              </Badge>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className={order.side === "buy" ? "text-green-600" : "text-red-600"}>
              {orderSideLabel(order.side, locale)}
            </span>
            <span className="text-muted-foreground">
              {orderTypeLabel(order.order_type, locale)} · {t.common.qty} {order.qty} · {t.common.filled} {order.filled_qty}
            </span>
            {order.extended_hours && (
              <Badge variant="outline">
                {orderSessionLabel(order.extended_hours, locale)}
              </Badge>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-md border bg-background px-3 py-2">
              <p className="text-muted-foreground">{t.common.limitPrice}</p>
              <p className="mt-1 font-medium">{priceLabel(order.limit_price, locale)}</p>
            </div>
            <div className="rounded-md border bg-background px-3 py-2">
              <p className="text-muted-foreground">{t.common.stopPrice}</p>
              <p className="mt-1 font-medium">{priceLabel(order.stop_price, locale)}</p>
            </div>
            <div className="rounded-md border bg-background px-3 py-2">
              <p className="text-muted-foreground">{t.common.avgPrice}</p>
              <p className="mt-1 font-medium">
                {priceLabel(order.filled_avg_price, locale)}
              </p>
            </div>
          </div>
          {canCancelOrder(order) && (
            <div className="flex justify-end">
              <OrderCancelButton orderId={order.id} symbol={order.symbol} />
            </div>
          )}
        </div>
      ))}
      {(!orders || orders.length === 0) && (
        <div className="p-4">
          <EmptyState>
            {orders === null ? t.pages.history.couldNotLoadOrders : t.common.noOrders}
          </EmptyState>
        </div>
      )}
    </div>
  );
}

function DesktopHistoryTable({
  locale,
  orders,
}: {
  locale: Locale;
  orders: Order[] | null;
}) {
  const t = getDictionary(locale);

  return (
    <div className="hidden md:block">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t.common.placed}</TableHead>
            <TableHead>{t.batchBacktest.symbol}</TableHead>
            <TableHead>{t.common.source}</TableHead>
            <TableHead>{t.common.session}</TableHead>
            <TableHead>{t.common.side}</TableHead>
            <TableHead>{t.common.type}</TableHead>
            <TableHead className="text-right">{t.common.qty}</TableHead>
            <TableHead className="text-right">{t.common.limitPrice}</TableHead>
            <TableHead className="text-right">{t.common.stopPrice}</TableHead>
            <TableHead className="text-right">{t.common.filled}</TableHead>
            <TableHead className="text-right">{t.common.avgPrice}</TableHead>
            <TableHead className="text-right">{t.common.status}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(orders ?? []).map((order) => (
            <TableRow key={order.id}>
              <TableCell className="text-muted-foreground">
                {formatDateTime(order.created_at, locale)}
              </TableCell>
              <TableCell className="font-medium">{order.symbol}</TableCell>
              <TableCell>
                <Badge variant={sourceVariant(order.source)}>
                  {orderSourceLabel(order.source, locale)}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge variant={order.extended_hours ? "secondary" : "outline"}>
                  {orderSessionLabel(order.extended_hours, locale)}
                </Badge>
              </TableCell>
              <TableCell>
                <span className={order.side === "buy" ? "text-green-600" : "text-red-600"}>
                  {orderSideLabel(order.side, locale)}
                </span>
              </TableCell>
              <TableCell>{orderTypeLabel(order.order_type, locale)}</TableCell>
              <TableCell className="text-right">{order.qty}</TableCell>
              <TableCell className="text-right">
                {priceLabel(order.limit_price, locale)}
              </TableCell>
              <TableCell className="text-right">
                {priceLabel(order.stop_price, locale)}
              </TableCell>
              <TableCell className="text-right">{order.filled_qty}</TableCell>
              <TableCell className="text-right">
                {priceLabel(order.filled_avg_price, locale)}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-2">
                  <Badge variant={statusVariant(order.status)}>
                    {orderStatusLabel(order.status, locale)}
                  </Badge>
                  {canCancelOrder(order) && (
                    <OrderCancelButton
                      orderId={order.id}
                      symbol={order.symbol}
                      compact
                    />
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
          {(!orders || orders.length === 0) && (
            <TableRow>
              <TableCell
                colSpan={12}
                className="py-8 text-center text-muted-foreground"
              >
                {orders === null
                  ? t.pages.history.couldNotLoadOrders
                  : t.common.noOrders}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
