"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n/client";

export function LogoutButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);

  async function logout() {
    setLoading(true);
    try {
      await api.logout();
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size={compact ? "icon" : "sm"}
      onClick={logout}
      disabled={loading}
      aria-label={t.auth.logout}
      title={t.auth.logout}
    >
      <LogOut data-icon={compact ? undefined : "inline-start"} />
      {!compact && t.auth.logout}
    </Button>
  );
}
