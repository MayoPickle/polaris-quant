import type { LucideIcon } from "lucide-react";
import {
  BrainCircuit,
  BriefcaseBusiness,
  LayoutDashboard,
  ListOrdered,
  Search,
} from "lucide-react";
import type { Dictionary } from "@/lib/i18n/dictionaries";

type NavLabelKey = keyof Dictionary["nav"];

export type NavItem = {
  labelKey: NavLabelKey;
  href: string;
  icon: LucideIcon;
};

export const NAV_ITEMS: NavItem[] = [
  { labelKey: "overview", href: "/", icon: LayoutDashboard },
  { labelKey: "strategies", href: "/strategies", icon: BrainCircuit },
  { labelKey: "portfolio", href: "/portfolio", icon: BriefcaseBusiness },
  { labelKey: "orders", href: "/orders", icon: ListOrdered },
  { labelKey: "market", href: "/market", icon: Search },
];

export function isNavItemActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}
