import { AppShell } from "@/components/app-shell";
import { AutomationDashboard } from "@/components/automation/automation-dashboard";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { getServerLocale } from "@/lib/i18n/server";
import { safe } from "@/lib/safe";
import { serverApi as api } from "@/lib/server-api";

export default async function AutomationPage() {
  const locale = await getServerLocale();
  const t = getDictionary(locale);
  const [account, health, available, instances, signals, orders] = await Promise.all([
    safe(api.account()),
    safe(api.health()),
    safe(api.availableStrategies(locale)),
    safe(api.listStrategies({ includeArchived: true })),
    safe(api.strategySignals({ limit: 50 })),
    safe(api.listOrders()),
  ]);

  return (
    <AppShell title={t.pages.automation.title} subtitle={t.pages.automation.subtitle}>
      <AutomationDashboard
        account={account}
        health={health}
        strategies={available ?? []}
        instances={instances ?? []}
        signals={signals}
        orders={orders ?? []}
      />
    </AppShell>
  );
}
