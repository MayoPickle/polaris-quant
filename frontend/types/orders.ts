type OrderSide = "buy" | "sell";
type OrderType = "market" | "limit" | "stop" | "stop_limit";

export interface OrderCreate {
  symbol: string;
  side: OrderSide;
  qty: number;
  order_type?: OrderType;
  limit_price?: number | null;
}

export interface Order {
  id: number;
  broker_order_id: string | null;
  symbol: string;
  side: string;
  order_type: string;
  qty: number;
  status: string;
  filled_qty: number;
  filled_avg_price: number | null;
}

