import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth-form";
import { Logo } from "@/components/logo";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { getServerLocale } from "@/lib/i18n/server";
import { safe } from "@/lib/safe";
import { serverApi } from "@/lib/server-api";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const locale = await getServerLocale();
  const t = getDictionary(locale);
  const params = await searchParams;
  const nextPath = sanitizeNextPath(params.next);
  const setupStatus = await safe(serverApi.setupStatus());

  if (setupStatus?.needs_setup) {
    redirect(nextPath ? `/setup?next=${encodeURIComponent(nextPath)}` : "/setup");
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-8">
      <section className="w-full max-w-sm rounded-lg border bg-card p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="mb-5 flex items-center gap-3">
          <Logo className="size-9" />
          <div>
            <h1 className="text-lg font-semibold">{t.auth.loginTitle}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t.auth.loginDescription}
            </p>
          </div>
        </div>
        <AuthForm mode="login" nextPath={nextPath} />
      </section>
    </main>
  );
}

function sanitizeNextPath(value: string | string[] | undefined): string | undefined {
  const next = Array.isArray(value) ? value[0] : value;
  if (!next || !next.startsWith("/") || next.startsWith("//")) return undefined;
  if (next.startsWith("/login") || next.startsWith("/setup")) return undefined;
  return next;
}
