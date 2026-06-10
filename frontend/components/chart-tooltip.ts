import type { CSSProperties } from "react";

const contentStyle = {
  backgroundColor: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  boxShadow: "0 14px 36px color-mix(in oklch, var(--background), black 35%)",
  color: "var(--popover-foreground)",
} satisfies CSSProperties;

const labelStyle = {
  color: "var(--popover-foreground)",
  fontWeight: 600,
} satisfies CSSProperties;

const itemStyle = {
  color: "var(--popover-foreground)",
} satisfies CSSProperties;

const wrapperStyle = {
  outline: "none",
  zIndex: 20,
} satisfies CSSProperties;

export const chartTooltipProps = {
  contentStyle,
  labelStyle,
  itemStyle,
  wrapperStyle,
  cursor: {
    stroke: "var(--foreground)",
    strokeOpacity: 0.35,
  },
};
