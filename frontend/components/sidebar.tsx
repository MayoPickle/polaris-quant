"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ControlCenter } from "@/components/control-center";
import { Logo } from "@/components/logo";
import { isNavItemActive, PRIMARY_NAV_ITEMS } from "@/components/nav-items";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

export function Sidebar({
  marketStatus,
}: {
  marketStatus: {
    label: string;
    value: string;
    isOpen: boolean | null;
  };
}) {
  const pathname = usePathname();
  const { t } = useI18n();

  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col overflow-y-auto border-r bg-sidebar p-3 text-sidebar-foreground md:flex">
      <div className="mb-4 flex items-center gap-3 rounded-lg px-2 py-2">
        <Logo className="size-8 shrink-0" />
        <div className="min-w-0">
          <span className="block truncate text-base font-semibold tracking-tight">
            Polaris Quant
          </span>
          <span className="block truncate text-xs font-medium text-muted-foreground">
            {t.app.tagline}
          </span>
        </div>
      </div>
      <nav className="flex flex-col gap-1" aria-label={t.shell.primaryNavigation}>
        {PRIMARY_NAV_ITEMS.map((item) => {
          const active = isNavItemActive(pathname, item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-[0_1px_2px_rgba(15,23,42,0.08)]"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              {t.nav[item.labelKey]}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto rounded-lg border bg-card/55 p-3">
        <p className="text-xs font-semibold">{t.nav.controlCenter}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {t.shell.controlCenterDescription}
        </p>
        <ControlCenter
          marketStatus={marketStatus}
          className="mt-3 w-full justify-start"
        />
      </div>
    </aside>
  );
}
