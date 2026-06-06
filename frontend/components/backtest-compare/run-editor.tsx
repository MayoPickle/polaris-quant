"use client";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/workbench";
import { useI18n } from "@/lib/i18n/client";
import type { StrategyDescriptor } from "@/types";

import { COLORS } from "./constants";
import type { CompareRow, ParamSpec } from "./types";

export function CompareRunEditor({
  rows,
  strategies,
  onRemove,
  onStrategyChange,
  onUpdate,
}: {
  rows: CompareRow[];
  strategies: StrategyDescriptor[];
  onRemove: (id: number) => void;
  onStrategyChange: (id: number, key: string) => void;
  onUpdate: (id: number, patch: Partial<CompareRow>) => void;
}) {
  const { t } = useI18n();

  return (
    <div className="flex flex-col gap-2">
      {rows.map((row, i) => {
        const strat = strategies.find((s) => s.key === row.strategyKey);
        const props =
          (strat?.param_schema?.properties as Record<string, ParamSpec>) ?? {};
        return (
          <div
            key={row.id}
            className="grid gap-3 rounded-lg border bg-muted/20 p-3 md:flex md:flex-wrap md:items-end md:gap-2"
          >
            <span
              className="hidden h-3 w-3 shrink-0 rounded-full md:mb-2 md:inline-block"
              style={{ backgroundColor: COLORS[i % COLORS.length] }}
            />
            <Field label={t.backtestCompare.strategy} className="md:min-w-44">
              <select
                value={row.strategyKey}
                onChange={(e) => onStrategyChange(row.id, e.target.value)}
                className="h-10 w-full rounded-lg border bg-background px-3 text-sm md:h-9"
              >
                {strategies.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t.backtestCompare.symbol} className="md:w-24">
              <input
                value={row.symbol}
                onChange={(e) => onUpdate(row.id, { symbol: e.target.value })}
                className="h-10 w-full rounded-lg border bg-background px-3 text-sm uppercase md:h-9"
              />
            </Field>
            {Object.entries(props).map(([name, spec]) => (
              <Field key={name} label={spec.title ?? name} className="md:w-20">
                <input
                  type="number"
                  value={row.params[name] ?? ""}
                  onChange={(e) =>
                    onUpdate(row.id, {
                      params: { ...row.params, [name]: Number(e.target.value) },
                    })
                  }
                  className="h-10 w-full rounded-lg border bg-background px-3 text-sm md:h-9"
                />
              </Field>
            ))}
            {rows.length > 1 && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-muted-foreground md:mb-0.5 md:w-auto"
                onClick={() => onRemove(row.id)}
              >
                {t.backtestCompare.remove}
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}

