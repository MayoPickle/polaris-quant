"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { api } from "@/lib/api";
import type { Quote } from "@/types";

export function QuoteLookup() {
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
      setError(`Could not fetch a quote for ${s}.`);
    } finally {
      setLoading(false);
    }
  }

  const fields = quote
    ? [
        { label: "Bid", value: quote.bid_price },
        { label: "Ask", value: quote.ask_price },
        { label: "Last", value: quote.last_price },
      ]
    : [];

  return (
    <Card className="rounded-lg md:rounded-xl">
      <CardHeader>
        <CardTitle>Quote lookup</CardTitle>
        <CardDescription>Fetch the latest quote for a symbol</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:flex">
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && lookup()}
            placeholder="e.g. AAPL"
            className="h-10 w-full rounded-lg border bg-background px-3 text-sm uppercase outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-9 sm:w-40"
          />
          <Button onClick={lookup} disabled={loading} className="w-full sm:w-auto">
            {loading ? "Loading…" : "Get quote"}
          </Button>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {quote && (
          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            {fields.map((f) => (
              <div key={f.label} className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">{f.label}</p>
                <p className="text-base font-semibold sm:text-lg">
                  ${f.value.toFixed(2)}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
