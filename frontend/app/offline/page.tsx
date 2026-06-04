import { WifiOff } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function OfflinePage() {
  return (
    <AppShell title="Offline" subtitle="Network access is unavailable">
      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <WifiOff className="size-5" aria-hidden="true" />
            Offline shell active
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
          <p>
            Polaris Quant is installed and ready, but live trading data requires
            a network connection.
          </p>
          <p>
            Reconnect to load positions, orders, account balances, quotes, and
            strategy backtests.
          </p>
        </CardContent>
      </Card>
    </AppShell>
  );
}
