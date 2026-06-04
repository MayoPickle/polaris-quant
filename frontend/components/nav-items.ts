import type { LucideIcon } from "lucide-react";
import {
  BrainCircuit,
  BriefcaseBusiness,
  LayoutDashboard,
  ListOrdered,
  Search,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

export const NAV_ITEMS: NavItem[] = [
  { label: "Overview", href: "/", icon: LayoutDashboard },
  { label: "Strategies", href: "/strategies", icon: BrainCircuit },
  { label: "Portfolio", href: "/portfolio", icon: BriefcaseBusiness },
  { label: "Orders", href: "/orders", icon: ListOrdered },
  { label: "Market", href: "/market", icon: Search },
];

export function isNavItemActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}
