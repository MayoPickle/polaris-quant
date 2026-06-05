"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n/client";

export function AuthForm({
  mode,
  nextPath,
}: {
  mode: "login" | "setup";
  nextPath?: string;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSetup = mode === "setup";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (isSetup) {
        await api.setup({ email, password });
      } else {
        await api.login({ email, password });
      }
      router.replace(nextPath || "/");
      router.refresh();
    } catch {
      setError(isSetup ? t.auth.setupError : t.auth.loginError);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">{t.auth.email}</span>
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder={t.auth.emailPlaceholder}
          className="h-10 rounded-lg border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">{t.auth.password}</span>
        <input
          type="password"
          autoComplete={isSetup ? "new-password" : "current-password"}
          required
          minLength={isSetup ? 8 : 1}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder={t.auth.passwordPlaceholder}
          className="h-10 rounded-lg border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
        />
      </label>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" disabled={loading} className="w-full">
        {loading
          ? isSetup
            ? t.auth.settingUp
            : t.auth.loggingIn
          : isSetup
            ? t.auth.setupSubmit
            : t.auth.loginSubmit}
      </Button>
    </form>
  );
}
