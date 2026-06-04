"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { isNavItemActive, NAV_ITEMS } from "@/components/nav-items";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r bg-muted/30 p-4 md:flex">
      <div className="mb-6 flex items-center gap-2 px-2">
        <div className="size-7 rounded-lg bg-foreground" />
        <span className="text-lg font-semibold tracking-tight">Polaris Quant</span>
      </div>
      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const active = isNavItemActive(pathname, item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
