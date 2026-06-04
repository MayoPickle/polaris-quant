import { cn } from "@/lib/utils";

/**
 * Polaris Quant brand mark — a North Star (Polaris) sparkle inside a rounded
 * badge. Inherits theme colors via `bg-foreground` / `text-background`.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-[inset_0_0_0_1px_rgba(255,255,255,0.16)]",
        className
      )}
    >
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
        className="h-[60%] w-[60%]"
      >
        {/* Four-point north star with short diagonal rays */}
        <path d="M12 1.5 L13.9 10.1 L22.5 12 L13.9 13.9 L12 22.5 L10.1 13.9 L1.5 12 L10.1 10.1 Z" />
        <path
          d="M12 5.5 L12.8 11.2 L18.5 12 L12.8 12.8 L12 18.5 L11.2 12.8 L5.5 12 L11.2 11.2 Z"
          opacity="0.55"
          transform="rotate(45 12 12)"
        />
      </svg>
    </span>
  );
}
