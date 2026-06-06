export type PositionSizingMethod =
  | "fixed_target"
  | "fixed_risk"
  | "atr_risk"
  | "pyramiding"
  | "equal_weight"
  | "volatility_target";

export interface PositionSizingConfig {
  method: PositionSizingMethod;
  target_pct: number;
  risk_amount: number;
  stop_loss_pct: number;
  atr_period: number;
  atr_multiple: number;
  tranche_pct: number;
  max_position_pct: number;
  universe_size: number;
  target_volatility_pct: number;
  volatility_lookback: number;
}

