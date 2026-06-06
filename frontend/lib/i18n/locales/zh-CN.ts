import { zhCNBase } from "./zh-CN-base";
import { zhCNPages } from "./zh-CN-pages";
import { zhCNStrategies } from "./zh-CN-strategies";

export const zhCN = {
  ...zhCNBase,
  ...zhCNPages,
  ...zhCNStrategies,
} as const;
