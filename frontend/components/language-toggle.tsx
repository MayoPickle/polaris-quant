"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  localeCookieValue,
  isSupportedLocale,
  type Locale,
} from "@/lib/i18n/config";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

export function LanguageToggle({
  className,
  itemClassName,
}: {
  className?: string;
  itemClassName?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { locale, t } = useI18n();

  function changeLocale(values: string[]) {
    const next = values[0];
    if (!isSupportedLocale(next) || next === locale) return;
    document.cookie = localeCookieValue(next);
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <ToggleGroup
      value={[locale]}
      onValueChange={changeLocale}
      variant="outline"
      size="sm"
      spacing={0}
      aria-label={t.language.label}
      className={cn(isPending && "opacity-70", className)}
    >
      <LanguageToggleItem
        locale="zh-CN"
        label={t.language.zh}
        ariaLabel={t.language.switchToZh}
        className={itemClassName}
      />
      <LanguageToggleItem
        locale="en-US"
        label={t.language.en}
        ariaLabel={t.language.switchToEn}
        className={itemClassName}
      />
    </ToggleGroup>
  );
}

function LanguageToggleItem({
  locale,
  label,
  ariaLabel,
  className,
}: {
  locale: Locale;
  label: string;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <ToggleGroupItem
      value={locale}
      aria-label={ariaLabel}
      className={cn("min-w-9", className)}
    >
      {label}
    </ToggleGroupItem>
  );
}
