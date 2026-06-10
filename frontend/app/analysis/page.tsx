import { AppShell } from "@/components/app-shell";
import { RegressionDashboard } from "@/components/analysis/regression-dashboard";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { getServerLocale } from "@/lib/i18n/server";
import { safe } from "@/lib/safe";
import { serverApi as api } from "@/lib/server-api";

const DEFAULT_SYMBOL = "AAPL";
const DEFAULT_RANGE: AnalysisRange = "3M";

type AnalysisRange = "1D" | "1W" | "1M" | "3M" | "6M" | "1Y" | "5Y" | "10Y";

export default async function AnalysisPage() {
  const locale = await getServerLocale();
  const t = getDictionary(locale);
  const defaultWindow = rangeWindow(DEFAULT_RANGE);
  const initialBars = await safe(
    api.marketBars([DEFAULT_SYMBOL], {
      timeframe: defaultWindow.timeframe,
      start_date: defaultWindow.startDate,
      end_date: defaultWindow.endDate,
    })
  );

  return (
    <AppShell title={t.pages.analysis.title} subtitle={t.pages.analysis.subtitle}>
      <RegressionDashboard
        initialBars={initialBars}
        initialSymbol={DEFAULT_SYMBOL}
        initialRange={DEFAULT_RANGE}
      />
    </AppShell>
  );
}

function rangeWindow(range: AnalysisRange) {
  const end = new Date();
  const start = new Date(end);
  const timeframe = timeframeForRange(range);

  switch (range) {
    case "1D":
      break;
    case "1W":
      start.setUTCDate(start.getUTCDate() - 6);
      break;
    case "1M":
      start.setUTCMonth(start.getUTCMonth() - 1);
      break;
    case "3M":
      start.setUTCMonth(start.getUTCMonth() - 3);
      break;
    case "6M":
      start.setUTCMonth(start.getUTCMonth() - 6);
      break;
    case "1Y":
      start.setUTCFullYear(start.getUTCFullYear() - 1);
      break;
    case "5Y":
      start.setUTCFullYear(start.getUTCFullYear() - 5);
      break;
    case "10Y":
      start.setUTCFullYear(start.getUTCFullYear() - 10);
      break;
  }

  return {
    startDate: dateInputValue(start),
    endDate: dateInputValue(end),
    timeframe,
  };
}

function dateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function timeframeForRange(range: AnalysisRange) {
  if (range === "1D") return "1Min";
  if (range === "1W") return "1Hour";
  return "1Day";
}
