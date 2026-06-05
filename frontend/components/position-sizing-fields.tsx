"use client";

import { Field } from "@/components/workbench";
import { useI18n } from "@/lib/i18n/client";
import { positionSizingMethodLabel } from "@/lib/i18n/format";
import { cn } from "@/lib/utils";
import type { PositionSizingConfig, PositionSizingMethod } from "@/types";

export const DEFAULT_POSITION_SIZING: PositionSizingConfig = {
  method: "fixed_target",
  target_pct: 20,
  risk_amount: 1_000,
  stop_loss_pct: 5,
  atr_period: 14,
  atr_multiple: 2,
  tranche_pct: 10,
  max_position_pct: 40,
  universe_size: 10,
  target_volatility_pct: 12,
  volatility_lookback: 20,
};

const POSITION_SIZING_METHODS: PositionSizingMethod[] = [
  "fixed_target",
  "fixed_risk",
  "atr_risk",
  "pyramiding",
  "equal_weight",
  "volatility_target",
];

type NumericKey = Exclude<keyof PositionSizingConfig, "method">;

type NumericFieldConfig = {
  key: NumericKey;
  label: string;
  min?: number;
  max?: number;
  step?: number;
};

export function PositionSizingFields({
  value,
  onChange,
  className,
}: {
  value: PositionSizingConfig;
  onChange: (value: PositionSizingConfig) => void;
  className?: string;
}) {
  const { locale, t } = useI18n();
  const fields = fieldsForMethod(value.method, t.positionSizing);

  function setNumber(key: NumericKey, nextValue: number) {
    onChange({ ...value, [key]: nextValue });
  }

  return (
    <div className={cn("grid gap-3 md:grid-cols-2 xl:grid-cols-4", className)}>
      <Field label={t.positionSizing.model}>
        <select
          value={value.method}
          onChange={(event) =>
            onChange({
              ...value,
              method: event.target.value as PositionSizingMethod,
            })
          }
          className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
        >
          {POSITION_SIZING_METHODS.map((method) => (
            <option key={method} value={method}>
              {positionSizingMethodLabel(method, locale)}
            </option>
          ))}
        </select>
      </Field>

      {fields.map((field) => (
        <NumericField
          key={field.key}
          label={field.label}
          value={value[field.key]}
          min={field.min}
          max={field.max}
          step={field.step}
          onChange={(nextValue) => setNumber(field.key, nextValue)}
        />
      ))}
    </div>
  );
}

function NumericField({
  label,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <Field label={label}>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
      />
    </Field>
  );
}

function fieldsForMethod(
  method: PositionSizingMethod,
  labels: {
    targetPct: string;
    riskAmount: string;
    stopLossPct: string;
    atrPeriod: string;
    atrMultiple: string;
    tranchePct: string;
    maxPositionPct: string;
    universeSize: string;
    targetVolatilityPct: string;
    volatilityLookback: string;
  }
): NumericFieldConfig[] {
  if (method === "fixed_target") {
    return [{ key: "target_pct", label: labels.targetPct, min: 1, max: 100 }];
  }
  if (method === "fixed_risk") {
    return [
      { key: "risk_amount", label: labels.riskAmount, min: 1, step: 100 },
      { key: "stop_loss_pct", label: labels.stopLossPct, min: 0.1, max: 100, step: 0.1 },
      { key: "max_position_pct", label: labels.maxPositionPct, min: 1, max: 100 },
    ];
  }
  if (method === "atr_risk") {
    return [
      { key: "risk_amount", label: labels.riskAmount, min: 1, step: 100 },
      { key: "atr_period", label: labels.atrPeriod, min: 2, max: 252 },
      { key: "atr_multiple", label: labels.atrMultiple, min: 0.1, max: 20, step: 0.1 },
      { key: "max_position_pct", label: labels.maxPositionPct, min: 1, max: 100 },
    ];
  }
  if (method === "pyramiding") {
    return [
      { key: "tranche_pct", label: labels.tranchePct, min: 1, max: 100 },
      { key: "max_position_pct", label: labels.maxPositionPct, min: 1, max: 100 },
    ];
  }
  if (method === "equal_weight") {
    return [
      { key: "universe_size", label: labels.universeSize, min: 1, max: 1000 },
      { key: "max_position_pct", label: labels.maxPositionPct, min: 1, max: 100 },
    ];
  }
  return [
    { key: "target_volatility_pct", label: labels.targetVolatilityPct, min: 0.1, max: 200, step: 0.1 },
    { key: "volatility_lookback", label: labels.volatilityLookback, min: 2, max: 252 },
    { key: "max_position_pct", label: labels.maxPositionPct, min: 1, max: 100 },
  ];
}
