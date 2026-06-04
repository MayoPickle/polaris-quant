import type { ReactNode } from "react";

import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { Sidebar } from "@/components/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";

export function AppShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-1 bg-background">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b bg-background/95 px-4 pt-[max(env(safe-area-inset-top),0px)] backdrop-blur md:hidden">
          <div className="flex h-14 items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <div className="size-7 shrink-0 rounded-lg bg-foreground" />
              <span className="truncate text-base font-semibold tracking-tight">
                Polaris Quant
              </span>
            </div>
            <ThemeToggle />
          </div>
        </header>

        <main className="flex-1 px-4 py-5 pb-28 md:p-8">
          <header className="mb-5 flex flex-col gap-3 md:mb-8 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
                {title}
              </h1>
              {subtitle && (
                <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
              )}
            </div>
            <div className="flex items-center gap-3 md:justify-end">
              {actions}
              <div className="hidden md:block">
                <ThemeToggle />
              </div>
            </div>
          </header>

          <div className="flex flex-col gap-8">{children}</div>
        </main>
      </div>
      <MobileBottomNav />
    </div>
  );
}
