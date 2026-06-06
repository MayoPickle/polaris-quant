import { enUSBase } from "./en-US-base";
import { enUSPages } from "./en-US-pages";
import { enUSStrategies } from "./en-US-strategies";

export const enUS = {
  ...enUSBase,
  ...enUSPages,
  ...enUSStrategies,
} as const;
