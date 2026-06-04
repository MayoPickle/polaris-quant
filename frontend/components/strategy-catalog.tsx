"use client";

import { useState } from "react";
import { ChevronRight, Search } from "lucide-react";

import { StrategyBacktest } from "@/components/strategy-backtest";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState, WorkbenchPanel } from "@/components/workbench";
import type { StrategyDescriptor } from "@/types";

type ParamSpec = {
  type?: string;
  default?: unknown;
  title?: string;
  minimum?: number;
  maximum?: number;
};

export function StrategyCatalog({ strategies }: { strategies: StrategyDescriptor[] }) {
  const [selected, setSelected] = useState<StrategyDescriptor | null>(null);
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const filteredStrategies = normalizedQuery
    ? strategies.filter((strategy) =>
        [strategy.name, strategy.key, strategy.description]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery)
      )
    : strategies;

  return (
    <>
      <WorkbenchPanel
        title="Available strategies"
        description={`${strategies.length} registered templates`}
        actions={
          <label className="relative block w-full sm:w-72">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search strategies"
              className="h-9 w-full rounded-lg border bg-background pl-9 pr-3 text-sm"
            />
          </label>
        }
        contentClassName="p-0"
      >
        <div>
          {filteredStrategies.map((s) => {
          const props = (s.param_schema?.properties as Record<string, ParamSpec>) ?? {};
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => setSelected(s)}
              className="group flex w-full items-center justify-between gap-4 border-b px-4 py-3.5 text-left outline-none transition-colors last:border-b-0 hover:bg-muted/45 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium group-hover:underline">
                    {s.name}
                  </span>
                  <Badge variant="secondary" className="font-mono text-xs">
                    {s.key}
                  </Badge>
                </span>
                <span className="mt-1 line-clamp-2 block text-sm text-muted-foreground">
                  {s.description}
                </span>
                <span className="mt-2 block text-xs text-muted-foreground">
                  {Object.keys(props).length} parameters
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
                <span className="hidden sm:inline">Backtest</span>
                <ChevronRight
                  className="size-4 transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </span>
            </button>
          );
        })}
          {filteredStrategies.length === 0 && (
            <div className="p-4">
              <EmptyState>No strategies found.</EmptyState>
            </div>
          )}
        </div>
      </WorkbenchPanel>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="top-2 max-h-[calc(100dvh-1rem)] max-w-[calc(100vw-1rem)] translate-y-0 overflow-y-auto p-3 sm:top-1/2 sm:max-h-[90vh] sm:max-w-4xl sm:-translate-y-1/2 sm:p-4">
          {selected && (
            <>
              <DialogHeader className="border-b pb-4 pr-8">
                <DialogTitle className="flex flex-wrap items-center gap-2 leading-tight">
                  {selected.name}
                  <Badge variant="secondary" className="font-mono text-xs">
                    {selected.key}
                  </Badge>
                </DialogTitle>
                <DialogDescription>{selected.description}</DialogDescription>
              </DialogHeader>

              <div className="flex flex-col gap-5 pt-2">
                <StrategyBacktest strategy={selected} />
                <details className="group border-t pt-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold">
                    Parameter details
                    <span className="text-muted-foreground transition-transform group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <div className="mt-3">
                    <ParametersTable strategy={selected} />
                  </div>
                </details>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ParametersTable({ strategy }: { strategy: StrategyDescriptor }) {
  const props = (strategy.param_schema?.properties as Record<string, ParamSpec>) ?? {};
  const required = (strategy.param_schema?.required as string[]) ?? [];

  return (
    <>
      <div className="flex flex-col gap-2 sm:hidden">
        {Object.entries(props).map(([name, spec]) => {
          const range =
            spec.minimum !== undefined || spec.maximum !== undefined
              ? `${spec.minimum ?? "−∞"} … ${spec.maximum ?? "∞"}`
              : "—";

          return (
            <div key={name} className="rounded-lg border p-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-xs">
                    {name}
                    {required.includes(name) && <span className="ml-1 text-red-500">*</span>}
                  </p>
                  <p className="mt-1 font-medium">{spec.title ?? "—"}</p>
                </div>
                <Badge variant="secondary" className="font-mono text-xs">
                  {spec.type ?? "—"}
                </Badge>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-muted-foreground">Default</p>
                  <p className="font-mono">
                    {spec.default !== undefined ? String(spec.default) : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Range</p>
                  <p className="font-mono">{range}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="hidden rounded-lg border sm:block">
        <Table className="min-w-[38rem]">
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Label</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Default</TableHead>
              <TableHead className="text-right">Range</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Object.entries(props).map(([name, spec]) => {
              const range =
                spec.minimum !== undefined || spec.maximum !== undefined
                  ? `${spec.minimum ?? "−∞"} … ${spec.maximum ?? "∞"}`
                  : "—";
              return (
                <TableRow key={name}>
                  <TableCell className="font-mono text-xs">
                    {name}
                    {required.includes(name) && <span className="ml-1 text-red-500">*</span>}
                  </TableCell>
                  <TableCell>{spec.title ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{spec.type}</TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {spec.default !== undefined ? String(spec.default) : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs text-muted-foreground">
                    {range}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
