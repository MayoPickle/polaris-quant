"use client";

import { useState } from "react";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, MetricGrid, MetricTile, WorkbenchPanel } from "@/components/workbench";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n/client";
import { formatCurrency } from "@/lib/i18n/format";
import type { Quote } from "@/types";

export function QuoteLookup() {
  const { locale, t } = useI18n();
  const [symbol, setSymbol] = useState("AAPL");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function lookup() {
    const s = symbol.trim().toUpperCase();
    if (!s) return;
    setLoading(true);
    setError(null);
    setQuote(null);
    try {
      setQuote(await api.quote(s));
    } catch {
      setError(`${t.quoteLookup.errorPrefix}${s}.`);
    } finally {
      setLoading(false);
    }
  }

  const fields = quote
    ? [
        { label: t.quoteLookup.bid, value: quote.bid_price },
        { label: t.quoteLookup.ask, value: quote.ask_price },
        { label: t.quoteLookup.last, value: quote.last_price },
      ]
    : [];

  return (
    <WorkbenchPanel
      title={t.quoteLookup.title}
      description={t.quoteLookup.description}
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-2 sm:flex sm:items-end">
          <Field label={t.quoteLookup.symbol} className="sm:w-40">
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && lookup()}
            placeholder={t.quoteLookup.placeholder}
            className="h-10 w-full rounded-lg border bg-background px-3 text-sm font-medium uppercase"
          />
          </Field>
          <Button onClick={lookup} disabled={loading} className="w-full sm:w-auto">
            <Search data-icon="inline-start" />
            {loading ? t.common.loading : t.quoteLookup.getQuote}
          </Button>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {quote && (
          <MetricGrid className="grid-cols-3 xl:grid-cols-3">
            {fields.map((f) => (
              <MetricTile
                key={f.label}
                label={f.label}
                value={formatCurrency(f.value, locale)}
                tone="info"
              />
            ))}
          </MetricGrid>
        )}
      </div>
    </WorkbenchPanel>
  );
}
