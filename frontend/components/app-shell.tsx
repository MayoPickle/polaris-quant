import type { ReactNode } from "react";

import { LanguageToggle } from "@/components/language-toggle";
import { Logo } from "@/components/logo";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { Sidebar } from "@/components/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { getServerLocale } from "@/lib/i18n/server";

export async function AppShell({
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
  const locale = await getServerLocale();
  const t = getDictionary(locale);

  return (
    <div className="flex min-h-dvh flex-1 bg-background">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col bg-background">
        <header className="sticky top-0 z-30 border-b bg-card/95 px-4 pt-[max(env(safe-area-inset-top),0px)] shadow-[0_1px_2px_rgba(15,23,42,0.03)] backdrop-blur md:hidden">
          <div className="flex h-14 items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <Logo className="size-7 shrink-0" />
              <div className="min-w-0">
                <span className="block truncate text-sm font-semibold tracking-tight">
                  Polaris Quant
                </span>
                <span className="block truncate text-[0.68rem] font-medium text-muted-foreground">
                  {t.app.tagline}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <LanguageToggle />
              <ThemeToggle />
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 py-4 pb-28 md:px-6 md:py-5 lg:px-8">
          <header className="mb-4 rounded-lg border bg-card px-4 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.03)] md:mb-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <h1 className="truncate text-xl font-semibold tracking-tight md:text-2xl">
                {title}
                </h1>
                {subtitle && (
                  <p className="mt-1 max-w-2xl text-sm leading-5 text-muted-foreground">
                    {subtitle}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 md:justify-end">
                {actions}
              </div>
            </div>
          </header>

          <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-4 md:gap-5">
            {children}
          </div>
        </main>
      </div>
      <MobileBottomNav />
    </div>
  );
}
