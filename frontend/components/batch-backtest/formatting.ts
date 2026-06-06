export function pct(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : `${value.toFixed(2)}%`;
}

export function num(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : value.toFixed(2);
}

export function returnTone(value: number | null | undefined) {
  if (value === null || value === undefined) return "";
  return value >= 0 ? "text-green-600" : "text-red-600";
}

export function toneFor(
  value: number | null | undefined
): "positive" | "negative" | "neutral" {
  if (value === null || value === undefined || value === 0) return "neutral";
  return value > 0 ? "positive" : "negative";
}
