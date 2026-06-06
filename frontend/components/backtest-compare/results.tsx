"use client";

import type { BacktestResult } from "@/types";

import { CompareResultsCards } from "./results-cards";
import { CompareResultsChart } from "./results-chart";
import { CompareResultsTable } from "./results-table";

export function CompareResults({ results }: { results: BacktestResult[] | null }) {
  if (!results || results.length === 0) return null;

  return (
    <>
      <CompareResultsChart results={results} />
      <CompareResultsCards results={results} />
      <CompareResultsTable results={results} />
    </>
  );
}

