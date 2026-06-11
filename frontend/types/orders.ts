import type { BrokerEnv } from "./account";

export type OrderSide = "buy" | "sell";
export type OrderSource = "manual" | "automated";
export type OrderType = "market" | "limit" | "stop" | "stop_limit";

export interface OrderCreate {
  symbol: string;
  side: OrderSide;
  qty: number;
  order_type?: OrderType;
  limit_price?: number | null;
  extended_hours?: boolean;
}

export interface Order {
  id: number;
  broker_env: BrokerEnv;
  broker_order_id: string | null;
  created_at: string;
  strategy_instance_id: number | null;
  source: OrderSource;
  symbol: string;
  side: string;
  order_type: string;
  qty: number;
  limit_price: number | null;
  extended_hours: boolean;
  status: string;
  filled_qty: number;
  filled_avg_price: number | null;
}
