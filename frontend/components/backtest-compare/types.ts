export type ParamSpec = { type?: string; default?: number; title?: string };

export type CompareRow = {
  id: number;
  strategyKey: string;
  symbol: string;
  params: Record<string, number>;
};

