import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function MarketSessionBadge({
  label,
  value,
  isOpen,
  compact = false,
  className,
}: {
  label: string;
  value: string;
  isOpen: boolean | null;
  compact?: boolean;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 bg-background font-medium",
        isOpen === true && "border-green-600/30 text-green-700 dark:text-green-400",
        isOpen === false && "text-muted-foreground",
        className
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 rounded-full bg-muted-foreground/45",
          isOpen === true && "bg-green-500"
        )}
      />
      {!compact && <span className="text-muted-foreground">{label}</span>}
      <span>{value}</span>
    </Badge>
  );
}
