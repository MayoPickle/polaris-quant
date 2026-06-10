"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n/client";

export function OrderCancelButton({
  orderId,
  symbol,
  compact = false,
}: {
  orderId: number;
  symbol: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancel() {
    if (!window.confirm(t.pages.history.confirmCancelOrder.replace("{symbol}", symbol))) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await api.cancelOrder(orderId);
      router.refresh();
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : t.pages.history.cancelFailed);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-col items-end gap-1">
      <Button
        type="button"
        variant="destructive"
        size={compact ? "icon-sm" : "sm"}
        onClick={() => void cancel()}
        disabled={loading}
        title={t.pages.history.cancelOrder}
      >
        <X data-icon={compact ? undefined : "inline-start"} />
        <span className={compact ? "sr-only" : undefined}>
          {loading ? t.common.cancelling : t.common.cancel}
        </span>
      </Button>
      {error && (
        <p className="max-w-48 text-right text-xs leading-4 text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
