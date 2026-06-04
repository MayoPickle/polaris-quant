import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function WorkbenchPanel({
  title,
  description,
  actions,
  children,
  className,
  contentClassName,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-lg border bg-card text-card-foreground shadow-[0_1px_2px_rgba(15,23,42,0.03)]",
        className
      )}
    >
      {(title || description || actions) && (
        <header className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            {title && (
              <h2 className="truncate text-sm font-semibold tracking-tight">
                {title}
              </h2>
            )}
            {description && (
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {description}
              </p>
            )}
          </div>
          {actions && (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {actions}
            </div>
          )}
        </header>
      )}
      <div className={cn("p-4", contentClassName)}>{children}</div>
    </section>
  );
}

export function MetricGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn("grid grid-cols-2 gap-2 md:gap-3 xl:grid-cols-4", className)}
    >
      {children}
    </section>
  );
}

export function MetricTile({
  label,
  value,
  detail,
  tone = "neutral",
  className,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: "neutral" | "positive" | "negative" | "warning" | "info";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-lg border bg-card px-3 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.025)]",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-xs font-medium text-muted-foreground">
          {label}
        </p>
        <StatusDot tone={tone} />
      </div>
      <p
        className={cn(
          "mt-2 truncate text-lg font-semibold tracking-tight md:text-xl",
          tone === "positive" && "text-green-600",
          tone === "negative" && "text-red-600",
          tone === "warning" && "text-amber-600",
          tone === "info" && "text-primary"
        )}
      >
        {value}
      </p>
      {detail && (
        <p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p>
      )}
    </div>
  );
}

export function StatusDot({
  tone = "neutral",
  className,
}: {
  tone?: "neutral" | "positive" | "negative" | "warning" | "info";
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "size-2 shrink-0 rounded-full bg-muted-foreground/35",
        tone === "positive" && "bg-green-500",
        tone === "negative" && "bg-red-500",
        tone === "warning" && "bg-amber-500",
        tone === "info" && "bg-primary",
        className
      )}
    />
  );
}

export function EmptyState({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-dashed bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground",
        className
      )}
    >
      {children}
    </div>
  );
}

export function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <span className="truncate text-xs font-medium text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
