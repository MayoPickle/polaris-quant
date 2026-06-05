import type { Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";

export function formatCurrency(
  value: number,
  locale: Locale,
  options: Intl.NumberFormatOptions = {}
) {
  return value.toLocaleString(locale, {
    style: "currency",
    currency: "USD",
    ...options,
  });
}

export function formatPercent(value: number, locale: Locale) {
  const digits = Math.abs(value) >= 10 ? 0 : 1;
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value) + "%";
}

export function formatDateTime(value: string | null, locale: Locale) {
  if (!value) return getDictionary(locale).common.never;
  return new Date(value).toLocaleString(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function orderSideLabel(side: string, locale: Locale) {
  const labels = getDictionary(locale).enums.orderSide as Record<string, string>;
  return labels[side] ?? side.toUpperCase();
}

export function orderTypeLabel(type: string, locale: Locale) {
  const labels = getDictionary(locale).enums.orderType as Record<string, string>;
  return labels[type] ?? humanize(type);
}

export function orderStatusLabel(status: string, locale: Locale) {
  const labels = getDictionary(locale).enums.orderStatus as Record<string, string>;
  return labels[status] ?? humanize(status);
}

export function batchStatusLabel(status: string | null | undefined, locale: Locale) {
  const labels = getDictionary(locale).enums.batchStatus as Record<string, string>;
  return labels[status ?? "idle"] ?? humanize(status ?? "idle");
}

export function marketSessionLabel(isOpen: boolean | null | undefined, locale: Locale) {
  const labels = getDictionary(locale).enums.marketSession;
  if (isOpen === undefined || isOpen === null) return labels.unknown;
  return isOpen ? labels.open : labels.closed;
}

export function brokerEnvLabel(env: string | null | undefined, locale: Locale) {
  const labels = getDictionary(locale).enums.brokerEnv as Record<string, string>;
  return env ? labels[env] ?? env.toUpperCase() : getDictionary(locale).common.unavailable;
}

export function countText(count: number, label: string) {
  return `${count} ${label}`;
}

function humanize(value: string) {
  return value.replaceAll("_", " ");
}
