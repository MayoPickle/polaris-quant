"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { isNavItemActive, PRIMARY_NAV_ITEMS } from "@/components/nav-items";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

export function MobileBottomNav() {
  const pathname = usePathname();
  const { t } = useI18n();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 px-2 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] shadow-[0_-10px_30px_rgba(15,23,42,0.06)] backdrop-blur md:hidden">
      <div className="grid grid-cols-6 gap-1">
        {PRIMARY_NAV_ITEMS.map((item) => {
          const active = isNavItemActive(pathname, item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[0.68rem] font-semibold leading-none transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              <span className="truncate">{t.nav[item.labelKey]}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
