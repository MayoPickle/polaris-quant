import { WifiOff } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { getServerLocale } from "@/lib/i18n/server";

export default async function OfflinePage() {
  const locale = await getServerLocale();
  const t = getDictionary(locale);

  return (
    <AppShell title={t.pages.offline.title} subtitle={t.pages.offline.subtitle}>
      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <WifiOff className="size-5" aria-hidden="true" />
            {t.pages.offline.shellActive}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
          <p>{t.pages.offline.description}</p>
          <p>{t.pages.offline.reconnect}</p>
        </CardContent>
      </Card>
    </AppShell>
  );
}
