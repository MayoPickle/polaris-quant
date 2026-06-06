import type { Locale } from "@/lib/i18n/config";

import { enUS } from "./locales/en-US";
import { zhCN } from "./locales/zh-CN";

const dictionaries = {
  "zh-CN": zhCN,
  "en-US": enUS,
} as const;

type WidenStrings<T> = T extends string
  ? string
  : T extends Record<string, unknown>
    ? { [K in keyof T]: WidenStrings<T[K]> }
    : T;

export type Dictionary = WidenStrings<(typeof dictionaries)["en-US"]>;

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale] as Dictionary;
}
