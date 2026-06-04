import { AppShell } from "@/components/app-shell";
import { BacktestCompare } from "@/components/backtest-compare";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api";
import { safe } from "@/lib/safe";

type ParamSpec = { type?: string; default?: unknown; title?: string };

export default async function StrategiesPage() {
  const [available, instances] = await Promise.all([
    safe(api.availableStrategies()),
    safe(api.listStrategies()),
  ]);

  return (
    <AppShell
      title="Strategies"
      subtitle="Pick a strategy to configure and activate"
    >
      {/* Backtest comparison — see strategy performance on historical data */}
      <BacktestCompare strategies={available ?? []} />

      {/* Strategy catalog */}
      <section className="grid gap-3 md:grid-cols-2 md:gap-4">
        {(available ?? []).map((s) => {
          const props =
            (s.param_schema?.properties as Record<string, ParamSpec>) ?? {};
          return (
            <Card key={s.key} className="flex flex-col rounded-lg md:rounded-xl">
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <CardTitle>{s.name}</CardTitle>
                  <Badge variant="secondary" className="font-mono text-xs">
                    {s.key}
                  </Badge>
                </div>
                <CardDescription>{s.description}</CardDescription>
              </CardHeader>
              <CardContent className="mt-auto">
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  Parameters
                </p>
                <ul className="space-y-1 text-sm">
                  {Object.entries(props).map(([name, spec]) => (
                    <li
                      key={name}
                      className="flex flex-wrap justify-between gap-x-4 gap-y-1"
                    >
                      <span className="font-mono text-xs">{name}</span>
                      <span className="text-muted-foreground">
                        {spec.type}
                        {spec.default !== undefined
                          ? ` · default ${String(spec.default)}`
                          : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          );
        })}
        {(!available || available.length === 0) && (
          <p className="text-muted-foreground">No strategies registered.</p>
        )}
      </section>

      {/* User's strategy instances */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Your strategies</h2>
        <div className="flex flex-col gap-3 md:hidden">
          {(instances ?? []).map((inst) => (
            <Card key={inst.id} size="sm" className="rounded-lg">
              <CardContent className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{inst.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {inst.strategy_key}
                    </p>
                  </div>
                  <Badge variant={inst.is_active ? "default" : "outline"}>
                    {inst.is_active ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Symbols</p>
                    <p className="font-mono text-xs">
                      {inst.symbols.join(", ") || "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Schedule</p>
                    <p className="font-mono text-xs">{inst.schedule || "—"}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {(!instances || instances.length === 0) && (
            <Card size="sm" className="rounded-lg">
              <CardContent className="py-6 text-center text-sm text-muted-foreground">
                No strategies configured yet.
              </CardContent>
            </Card>
          )}
        </div>

        <Card className="hidden md:flex">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Strategy</TableHead>
                  <TableHead>Symbols</TableHead>
                  <TableHead>Schedule</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(instances ?? []).map((inst) => (
                  <TableRow key={inst.id}>
                    <TableCell className="font-medium">{inst.name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-mono text-xs">
                        {inst.strategy_key}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {inst.symbols.join(", ") || "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {inst.schedule || "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant={inst.is_active ? "default" : "outline"}>
                        {inst.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {(!instances || instances.length === 0) && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="py-8 text-center text-muted-foreground"
                    >
                      No strategies configured yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>
    </AppShell>
  );
}
