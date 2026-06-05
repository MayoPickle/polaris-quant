export const LOCALE_COOKIE = "polaris_locale";
export const DEFAULT_LOCALE = "en-US";
export const SUPPORTED_LOCALES = ["zh-CN", "en-US"] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export function isSupportedLocale(value: string | null | undefined): value is Locale {
  return SUPPORTED_LOCALES.includes(value as Locale);
}

export function normalizeLocale(value: string | null | undefined): Locale {
  if (!value) return DEFAULT_LOCALE;
  const normalized = value.trim();
  if (isSupportedLocale(normalized)) return normalized;
  const lower = normalized.toLowerCase();
  if (lower.startsWith("zh")) return "zh-CN";
  if (lower.startsWith("en")) return "en-US";
  return DEFAULT_LOCALE;
}

export function localeCookieValue(locale: Locale) {
  return `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
}
