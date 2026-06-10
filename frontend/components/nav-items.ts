import type { LucideIcon } from "lucide-react";
import {
  BrainCircuit,
  BriefcaseBusiness,
  Bot,
  ChartCandlestick,
  ChartSpline,
  Database,
  History,
  LayoutDashboard,
  Search,
} from "lucide-react";
import type { Dictionary } from "@/lib/i18n/dictionaries";

type NavLabelKey = keyof Dictionary["nav"];

export type NavItem = {
  labelKey: NavLabelKey;
  href: string;
  icon: LucideIcon;
};

export const PRIMARY_NAV_ITEMS: NavItem[] = [
  { labelKey: "overview", href: "/", icon: LayoutDashboard },
  { labelKey: "strategies", href: "/strategies", icon: BrainCircuit },
  { labelKey: "automation", href: "/automation", icon: Bot },
  { labelKey: "trading", href: "/trading", icon: ChartCandlestick },
  { labelKey: "portfolio", href: "/portfolio", icon: BriefcaseBusiness },
  { labelKey: "market", href: "/market", icon: Search },
];

export const CONTROL_CENTER_NAV_ITEMS: NavItem[] = [
  { labelKey: "history", href: "/history", icon: History },
  { labelKey: "data", href: "/data", icon: Database },
  { labelKey: "analysis", href: "/analysis", icon: ChartSpline },
];

export const NAV_ITEMS: NavItem[] = [
  ...PRIMARY_NAV_ITEMS,
  ...CONTROL_CENTER_NAV_ITEMS,
];

export function isNavItemActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}
