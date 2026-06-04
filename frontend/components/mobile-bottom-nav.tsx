"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { isNavItemActive, NAV_ITEMS } from "@/components/nav-items";
import { cn } from "@/lib/utils";

export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-2 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] shadow-[0_-10px_30px_rgba(0,0,0,0.04)] backdrop-blur md:hidden">
      <div className="grid grid-cols-5 gap-1">
        {NAV_ITEMS.map((item) => {
          const active = isNavItemActive(pathname, item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[0.68rem] font-medium leading-none transition-colors",
                active
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
