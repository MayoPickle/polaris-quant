import { Badge } from "@/components/ui/badge";
import { StatusDot, WorkbenchPanel } from "@/components/workbench";
import { brokerEnvLabel, marketSessionLabel } from "@/lib/i18n/format";
import { getDictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import type { Health, MarketClock } from "@/types";

export function OperatingStatusPanel({
  clock,
  health,
  locale,
  pendingOrders,
}: {
  clock: MarketClock | null;
  health: Health | null;
  locale: Locale;
  pendingOrders: number;
}) {
  const t = getDictionary(locale);
  const operatingStatus = [
    {
      label: t.pages.overview.market,
      value: marketSessionLabel(clock?.is_open, locale),
      detail: t.pages.overview.marketDetail,
      tone: clock?.is_open ? "positive" : "neutral",
    },
    {
      label: t.pages.overview.tradingGuard,
      value: health?.trading_enabled ? t.common.enabled : t.common.disabled,
      detail: t.pages.overview.tradingGuardDetail,
      tone: health?.trading_enabled ? "positive" : "warning",
    },
    {
      label: t.pages.overview.broker,
      value: brokerEnvLabel(health?.broker_env, locale),
      detail: health?.env ?? t.common.apiOffline,
      tone: "neutral",
    },
    {
      label: t.pages.overview.sizing,
      value: health?.openai_sizing_enabled
        ? health.position_model
        : `${health?.default_position_allocation_pct ?? 1}% ${t.pages.overview.preset}`,
      detail: health?.openai_sizing_enabled
        ? t.pages.overview.sizingOpenAi
        : t.pages.overview.sizingFallback,
      tone: health?.openai_sizing_enabled ? "info" : "neutral",
    },
  ] as const;

  return (
    <WorkbenchPanel
      title={t.pages.overview.operatingTitle}
      description={t.pages.overview.operatingDescription}
      actions={<Badge variant={pendingOrders > 0 ? "secondary" : "outline"}>{pendingOrders} {t.common.pending}</Badge>}
    >
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {operatingStatus.map((item) => (
          <div key={item.label} className="min-w-0 rounded-md border bg-background p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="truncate text-xs font-medium text-muted-foreground">{item.label}</p>
              <StatusDot tone={item.tone} />
            </div>
            <p className="mt-2 truncate text-sm font-semibold">{item.value}</p>
            <p className="mt-1 truncate text-xs text-muted-foreground">{item.detail}</p>
          </div>
        ))}
      </div>
    </WorkbenchPanel>
  );
}

