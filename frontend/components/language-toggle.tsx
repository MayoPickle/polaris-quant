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

export function LanguageToggle() {
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
      className={isPending ? "opacity-70" : undefined}
    >
      <LanguageToggleItem
        locale="zh-CN"
        label={t.language.zh}
        ariaLabel={t.language.switchToZh}
      />
      <LanguageToggleItem
        locale="en-US"
        label={t.language.en}
        ariaLabel={t.language.switchToEn}
      />
    </ToggleGroup>
  );
}

function LanguageToggleItem({
  locale,
  label,
  ariaLabel,
}: {
  locale: Locale;
  label: string;
  ariaLabel: string;
}) {
  return (
    <ToggleGroupItem value={locale} aria-label={ariaLabel} className="min-w-9">
      {label}
    </ToggleGroupItem>
  );
}
