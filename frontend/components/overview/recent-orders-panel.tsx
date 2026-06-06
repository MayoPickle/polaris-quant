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
import {
  formatCurrency,
  orderSideLabel,
  orderStatusLabel,
  orderTypeLabel,
} from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/config";
import type { Order } from "@/types";

import { orderStatusVariant } from "./overview-utils";

export function RecentOrdersPanel({
  locale,
  orders,
}: {
  locale: Locale;
  orders: Order[] | null;
}) {
  const t = getDictionary(locale);
  const orderRows = orders ?? [];
  const recentOrders = orderRows.slice(0, 6);

  return (
    <WorkbenchPanel
      title={t.pages.overview.recentOrdersTitle}
      description={t.pages.overview.recentOrdersDescription}
      actions={<Badge variant="outline">{orderRows.length} {t.common.orders}</Badge>}
      contentClassName="p-0"
    >
      <MobileOrdersList locale={locale} orders={orders} recentOrders={recentOrders} />
      <DesktopOrdersTable locale={locale} orders={orders} recentOrders={recentOrders} />
    </WorkbenchPanel>
  );
}

function MobileOrdersList({
  locale,
  orders,
  recentOrders,
}: {
  locale: Locale;
  orders: Order[] | null;
  recentOrders: Order[];
}) {
  const t = getDictionary(locale);
  const usd = (value: number) => formatCurrency(value, locale);

  return (
    <div className="md:hidden">
      {recentOrders.map((order) => (
        <div key={order.id} className="border-b p-4 last:border-b-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold">{order.symbol}</p>
              <p className="text-xs text-muted-foreground">
                {orderTypeLabel(order.order_type, locale)} · {t.common.qty} {order.qty} · {t.common.filled} {order.filled_qty}
              </p>
            </div>
            <Badge variant={orderStatusVariant(order.status)}>
              {orderStatusLabel(order.status, locale)}
            </Badge>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className={order.side === "buy" ? "text-green-600" : "text-red-600"}>
              {orderSideLabel(order.side, locale)}
            </span>
            <span className="font-medium">
              {order.filled_avg_price != null
                ? `${usd(order.filled_avg_price)} ${t.common.avg}`
                : t.common.noFillPrice}
            </span>
          </div>
        </div>
      ))}
      {(!orders || orders.length === 0) && (
        <div className="p-4">
          <EmptyState>
            {orders === null ? t.pages.overview.couldNotLoadOrders : t.common.noOrders}
          </EmptyState>
        </div>
      )}
    </div>
  );
}

function DesktopOrdersTable({
  locale,
  orders,
  recentOrders,
}: {
  locale: Locale;
  orders: Order[] | null;
  recentOrders: Order[];
}) {
  const t = getDictionary(locale);

  return (
    <div className="hidden md:block">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t.batchBacktest.symbol}</TableHead>
            <TableHead>{t.common.side}</TableHead>
            <TableHead>{t.common.type}</TableHead>
            <TableHead className="text-right">{t.common.qty}</TableHead>
            <TableHead className="text-right">{t.common.filled}</TableHead>
            <TableHead className="text-right">{t.batchBacktest.status}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {recentOrders.map((order) => (
            <TableRow key={order.id}>
              <TableCell className="font-medium">{order.symbol}</TableCell>
              <TableCell>
                <span className={order.side === "buy" ? "text-green-600" : "text-red-600"}>
                  {orderSideLabel(order.side, locale)}
                </span>
              </TableCell>
              <TableCell>{orderTypeLabel(order.order_type, locale)}</TableCell>
              <TableCell className="text-right">{order.qty}</TableCell>
              <TableCell className="text-right">{order.filled_qty}</TableCell>
              <TableCell className="text-right">
                <Badge variant={orderStatusVariant(order.status)}>
                  {orderStatusLabel(order.status, locale)}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
          {(!orders || orders.length === 0) && (
            <TableRow>
              <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                {orders === null ? t.pages.overview.couldNotLoadOrders : t.common.noOrders}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

