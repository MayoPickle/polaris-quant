"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/client";

const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

export function ThemeToggle({
  className,
  variant = "outline",
  size = "icon",
}: {
  className?: string;
  variant?: "outline" | "ghost";
  size?: "icon" | "icon-sm" | "icon-xs";
}) {
  const { resolvedTheme, setTheme } = useTheme();
  const { t } = useI18n();
  const mounted = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  );

  const isDark = resolvedTheme === "dark";

  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      aria-label={t.theme.toggle}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {mounted && isDark ? <Sun /> : <Moon />}
    </Button>
  );
}
