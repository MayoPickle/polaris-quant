"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { isNavItemActive, MOBILE_NAV_ITEMS } from "@/components/nav-items";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

export function MobileBottomNav() {
  const pathname = usePathname();
  const { t } = useI18n();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 px-2 pt-3 pb-[calc(env(safe-area-inset-bottom)+1rem)] shadow-[0_-10px_30px_rgba(15,23,42,0.06)] backdrop-blur md:hidden">
      <div className="grid grid-cols-5 items-end gap-1">
        {MOBILE_NAV_ITEMS.map((item) => {
          const active = isNavItemActive(pathname, item.href);
          const isTrading = item.labelKey === "trading";
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[0.68rem] font-semibold leading-none transition-colors",
                isTrading
                  ? "-mt-4 min-h-16 gap-1.5 rounded-xl bg-primary px-1.5 text-[0.78rem] font-bold text-primary-foreground shadow-[0_10px_24px_rgba(15,23,42,0.18)] hover:bg-primary/90"
                  : active
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className={cn("size-4", isTrading && "size-5")} aria-hidden="true" />
              <span className="truncate">{t.nav[item.labelKey]}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
