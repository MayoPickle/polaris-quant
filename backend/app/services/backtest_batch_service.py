"""Helpers for batch backtest symbol resolution and report aggregation."""

from __future__ import annotations

import re
import csv
from io import StringIO
from dataclasses import dataclass, field
from html.parser import HTMLParser
from statistics import median

import httpx
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.backtest import BacktestJob, BacktestJobResult, UniverseSymbol
from app.strategies.backtest import BacktestResult

_SYMBOL_RE = re.compile(r"^[A-Z][A-Z0-9.-]{0,15}$")
_SPLIT_RE = re.compile(r"[,;\t]+")
_TOKEN_RE = re.compile(r"[\s,;]+")
_IGNORED_SYMBOL_TOKENS = {"SYMBOL", "TICKER", "TICKERS"}


@dataclass(frozen=True)
class UniverseDefinition:
    key: str
    name: str
    description: str
    symbol_headers: tuple[str, ...]
    source_url: str = ""
    source_format: str = "csv"
    static_symbols: tuple[str, ...] = ()
    translations: dict[str, dict[str, str]] = field(default_factory=dict)


UNIVERSES: dict[str, UniverseDefinition] = {
    "sp500": UniverseDefinition(
        key="sp500",
        name="S&P 500",
        description="Current S&P 500 constituents from a public CSV dataset.",
        source_url="https://raw.githubusercontent.com/datasets/s-and-p-500-companies/refs/heads/main/data/constituents.csv",
        source_format="csv",
        symbol_headers=("symbol", "ticker"),
        translations={
            "zh-CN": {
                "name": "S&P 500",
                "description": "来自公开 CSV 数据集的当前 S&P 500 成分股。",
            }
        },
    ),
    "nasdaq100": UniverseDefinition(
        key="nasdaq100",
        name="Nasdaq 100",
        description="Current Nasdaq-100 constituents from a public CSV dataset.",
        source_url="https://raw.githubusercontent.com/Gary-Strauss/NASDAQ100_Constituents/master/data/nasdaq100_constituents.csv",
        source_format="csv",
        symbol_headers=("ticker", "symbol"),
        translations={
            "zh-CN": {
                "name": "Nasdaq 100",
                "description": "来自公开 CSV 数据集的当前 Nasdaq-100 成分股。",
            }
        },
    ),
    "dow30": UniverseDefinition(
        key="dow30",
        name="Dow 30",
        description="Dow Jones Industrial Average components.",
        source_format="static",
        symbol_headers=("symbol", "ticker"),
        translations={
            "zh-CN": {
                "name": "Dow 30",
                "description": "道琼斯工业平均指数成分股。",
            }
        },
        static_symbols=(
            "AAPL",
            "AMGN",
            "AMZN",
            "AXP",
            "BA",
            "CAT",
            "CRM",
            "CSCO",
            "CVX",
            "DIS",
            "GS",
            "HD",
            "HON",
            "IBM",
            "JNJ",
            "JPM",
            "KO",
            "MCD",
            "MMM",
            "MRK",
            "MSFT",
            "NKE",
            "NVDA",
            "PG",
            "SHW",
            "TRV",
            "UNH",
            "V",
            "VZ",
            "WMT",
        ),
    ),
}


class WikiTableParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.tables: list[list[list[str]]] = []
        self._table_depth = 0
        self._current_table: list[list[str]] | None = None
        self._current_row: list[str] | None = None
        self._current_cell: list[str] | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attrs_dict = dict(attrs)
        if tag == "table":
            self._table_depth += 1
            classes = attrs_dict.get("class", "")
            if self._table_depth == 1 and "wikitable" in classes:
                self._current_table = []
        elif tag == "tr" and self._current_table is not None:
            self._current_row = []
        elif tag in {"td", "th"} and self._current_row is not None:
            self._current_cell = []

    def handle_data(self, data: str) -> None:
        if self._current_cell is not None:
            self._current_cell.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag in {"td", "th"} and self._current_cell is not None and self._current_row is not None:
            text = _clean_cell("".join(self._current_cell))
            self._current_row.append(text)
            self._current_cell = None
        elif tag == "tr" and self._current_row is not None and self._current_table is not None:
            if any(cell for cell in self._current_row):
                self._current_table.append(self._current_row)
            self._current_row = None
        elif tag == "table":
            if self._current_table is not None:
                self.tables.append(self._current_table)
                self._current_table = None
            self._table_depth = max(0, self._table_depth - 1)


def _clean_cell(value: str) -> str:
    value = re.sub(r"\[[^\]]+\]", "", value)
    return " ".join(value.replace("\xa0", " ").split()).strip()


def normalize_symbol(value: str) -> str | None:
    symbol = value.strip().upper().lstrip("$")
    symbol = re.sub(r"\[[^\]]+\]", "", symbol)
    symbol = symbol.replace("/", ".")
    symbol = symbol.strip(" .,\t\r\n")
    if symbol in _IGNORED_SYMBOL_TOKENS:
        return None
    return symbol if _SYMBOL_RE.match(symbol) else None


def parse_imported_symbols(symbols: list[str] | None = None, symbols_text: str = "") -> list[str]:
    out: list[str] = []
    seen: set[str] = set()

    def add(raw: str) -> None:
        symbol = normalize_symbol(raw)
        if symbol and symbol not in seen:
            seen.add(symbol)
            out.append(symbol)

    for raw in symbols or []:
        add(raw)

    for line in symbols_text.splitlines():
        line = line.strip()
        if not line:
            continue
        if _SPLIT_RE.search(line):
            parts = [p.strip() for p in _SPLIT_RE.split(line) if p.strip()]
            if len(parts) > 1 and any(" " in p for p in parts[1:]):
                add(parts[0])
            else:
                for part in parts:
                    add(part)
        else:
            for token in _TOKEN_RE.split(line):
                add(token)

    return out


def list_universes(locale: str = "en-US") -> list[dict[str, str]]:
    return [
        {
            "key": u.key,
            "name": u.translations.get(locale, {}).get("name", u.name),
            "description": u.translations.get(locale, {}).get(
                "description", u.description
            ),
        }
        for u in UNIVERSES.values()
    ]


def resolve_batch_symbols(
    db: Session,
    *,
    imported_symbols: list[str] | None,
    symbols_text: str,
    universe_keys: list[str],
) -> list[str]:
    symbols = parse_imported_symbols(imported_symbols, symbols_text)
    seen = set(symbols)

    for key in universe_keys:
        for symbol in get_universe_symbols(db, key):
            if symbol not in seen:
                seen.add(symbol)
                symbols.append(symbol)

    if not symbols:
        raise ValueError("Provide at least one imported symbol or universe.")
    if len(symbols) > settings.BACKTEST_MAX_SYMBOLS:
        raise ValueError(
            f"Batch contains {len(symbols)} symbols; max is {settings.BACKTEST_MAX_SYMBOLS}."
        )
    return symbols


def get_universe_symbols(db: Session, key: str) -> list[str]:
    if key not in UNIVERSES:
        raise ValueError(f"Unknown universe: {key!r}")

    rows = (
        db.query(UniverseSymbol)
        .filter(UniverseSymbol.universe == key, UniverseSymbol.is_active.is_(True))
        .order_by(UniverseSymbol.symbol)
        .all()
    )
    if not rows:
        refresh_universe(db, key)
        rows = (
            db.query(UniverseSymbol)
            .filter(UniverseSymbol.universe == key, UniverseSymbol.is_active.is_(True))
            .order_by(UniverseSymbol.symbol)
            .all()
        )
    return [row.symbol for row in rows]


def refresh_universe(db: Session, key: str) -> int:
    definition = UNIVERSES[key]
    if definition.source_format == "static":
        symbols = list(definition.static_symbols)
    else:
        headers = {"User-Agent": f"{settings.APP_NAME}/0.1 batch-backtest universe refresh"}
        with httpx.Client(timeout=20.0, follow_redirects=True, headers=headers) as client:
            response = client.get(definition.source_url)
            response.raise_for_status()
        if definition.source_format == "csv":
            symbols = _extract_symbols_from_csv(response.text, definition.symbol_headers)
        else:
            symbols = _extract_symbols_from_wikitables(response.text, definition.symbol_headers)
    if not symbols:
        raise ValueError(f"Could not parse symbols for universe {definition.name}.")

    (
        db.query(UniverseSymbol)
        .filter(UniverseSymbol.universe == key)
        .update({UniverseSymbol.is_active: False}, synchronize_session=False)
    )
    source = definition.source_url or f"static:{key}"
    for symbol in symbols:
        row = (
            db.query(UniverseSymbol)
            .filter(UniverseSymbol.universe == key, UniverseSymbol.symbol == symbol)
            .one_or_none()
        )
        if row:
            row.is_active = True
            row.source = source
        else:
            db.add(
                UniverseSymbol(
                    universe=key,
                    symbol=symbol,
                    source=source,
                    is_active=True,
                )
            )
    db.commit()
    return len(symbols)


def _extract_symbols_from_csv(text: str, symbol_headers: tuple[str, ...]) -> list[str]:
    reader = csv.DictReader(StringIO(text))
    if not reader.fieldnames:
        return []
    columns = {_normalize_header(name): name for name in reader.fieldnames}
    symbol_column = next(
        (columns.get(_normalize_header(header)) for header in symbol_headers),
        None,
    )
    if symbol_column is None:
        return []

    symbols: list[str] = []
    seen: set[str] = set()
    for row in reader:
        symbol = normalize_symbol(row.get(symbol_column, ""))
        if symbol and symbol not in seen:
            seen.add(symbol)
            symbols.append(symbol)
    return symbols


def _extract_symbols_from_wikitables(html: str, symbol_headers: tuple[str, ...]) -> list[str]:
    parser = WikiTableParser()
    parser.feed(html)

    best_symbols: list[str] = []
    for table in parser.tables:
        if len(table) < 2:
            continue
        headers = [_normalize_header(cell) for cell in table[0]]
        symbol_index = next(
            (i for i, header in enumerate(headers) if header in symbol_headers),
            None,
        )
        if symbol_index is None:
            continue
        symbols: list[str] = []
        seen: set[str] = set()
        for row in table[1:]:
            if symbol_index >= len(row):
                continue
            symbol = normalize_symbol(row[symbol_index])
            if symbol and symbol not in seen:
                seen.add(symbol)
                symbols.append(symbol)
        if len(symbols) > len(best_symbols):
            best_symbols = symbols
    return best_symbols


def _normalize_header(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.lower())


def result_from_backtest(job_id: str, result: BacktestResult) -> BacktestJobResult:
    return BacktestJobResult(
        job_id=job_id,
        symbol=result.symbol,
        status="completed",
        final_equity=result.final_equity,
        total_return_pct=result.total_return_pct,
        buy_hold_return_pct=result.buy_hold_return_pct,
        alpha_return_pct=result.alpha_return_pct,
        num_trades=result.num_trades,
        win_rate_pct=result.win_rate_pct,
        max_drawdown_pct=result.max_drawdown_pct,
        sharpe=result.sharpe,
        equity_curve=result.equity_curve,
        trades=result.trades,
    )


def failed_result(job_id: str, symbol: str, error: str) -> BacktestJobResult:
    return BacktestJobResult(job_id=job_id, symbol=symbol, status="failed", error=error)


def build_batch_summary(job: BacktestJob, results: list[BacktestJobResult]) -> dict:
    completed = [r for r in results if r.status == "completed"]
    failed = [r for r in results if r.status == "failed"]
    returns = [r.total_return_pct for r in completed if r.total_return_pct is not None]
    buy_hold_returns = [
        r.buy_hold_return_pct for r in completed if r.buy_hold_return_pct is not None
    ]
    alphas = [r.alpha_return_pct for r in completed if r.alpha_return_pct is not None]
    sharpes = [r.sharpe for r in completed if r.sharpe is not None]
    drawdowns = [r.max_drawdown_pct for r in completed if r.max_drawdown_pct is not None]

    by_return = sorted(
        completed,
        key=lambda r: r.total_return_pct if r.total_return_pct is not None else float("-inf"),
        reverse=True,
    )
    by_sharpe = sorted(
        completed,
        key=lambda r: r.sharpe if r.sharpe is not None else float("-inf"),
        reverse=True,
    )
    by_alpha = sorted(
        completed,
        key=lambda r: r.alpha_return_pct if r.alpha_return_pct is not None else float("-inf"),
        reverse=True,
    )
    by_drawdown = sorted(
        completed,
        key=lambda r: r.max_drawdown_pct if r.max_drawdown_pct is not None else float("inf"),
    )
    median_symbol = _median_return_symbol(by_return)

    return {
        "status": job.status,
        "total_symbols": job.total_symbols,
        "completed_symbols": job.completed_symbols,
        "succeeded_symbols": job.succeeded_symbols,
        "failed_symbols": job.failed_symbols,
        "average_return_pct": round(sum(returns) / len(returns), 2) if returns else 0.0,
        "average_buy_hold_return_pct": (
            round(sum(buy_hold_returns) / len(buy_hold_returns), 2)
            if buy_hold_returns
            else 0.0
        ),
        "average_alpha_return_pct": round(sum(alphas) / len(alphas), 2) if alphas else 0.0,
        "median_return_pct": round(median(returns), 2) if returns else 0.0,
        "average_sharpe": round(sum(sharpes) / len(sharpes), 2) if sharpes else 0.0,
        "average_max_drawdown_pct": round(sum(drawdowns) / len(drawdowns), 2) if drawdowns else 0.0,
        "total_trades": sum(r.num_trades or 0 for r in completed),
        "best_return": _rank_rows(by_return[:10]),
        "worst_return": _rank_rows(list(reversed(by_return[-10:]))),
        "best_alpha": _rank_rows(by_alpha[:10]),
        "best_sharpe": _rank_rows(by_sharpe[:10]),
        "lowest_drawdown": _rank_rows(by_drawdown[:10]),
        "representative_symbols": {
            "best": by_return[0].symbol if by_return else None,
            "median": median_symbol,
            "worst": by_return[-1].symbol if by_return else None,
        },
        "return_distribution": _distribution(returns),
        "failures": [{"symbol": r.symbol, "error": r.error} for r in failed[:100]],
    }


def _rank_rows(results: list[BacktestJobResult]) -> list[dict]:
    return [
        {
            "symbol": r.symbol,
            "total_return_pct": r.total_return_pct,
            "buy_hold_return_pct": r.buy_hold_return_pct,
            "alpha_return_pct": r.alpha_return_pct,
            "sharpe": r.sharpe,
            "max_drawdown_pct": r.max_drawdown_pct,
            "win_rate_pct": r.win_rate_pct,
            "num_trades": r.num_trades,
            "final_equity": r.final_equity,
        }
        for r in results
    ]


def _median_return_symbol(results_desc: list[BacktestJobResult]) -> str | None:
    if not results_desc:
        return None
    return results_desc[len(results_desc) // 2].symbol


def _distribution(values: list[float]) -> list[dict[str, float | int | str]]:
    if not values:
        return []
    low = min(values)
    high = max(values)
    if low == high:
        return [{"range": f"{round(low, 2)}%", "count": len(values), "start": low, "end": high}]

    bucket_count = min(12, max(4, int(len(values) ** 0.5)))
    width = (high - low) / bucket_count
    buckets = [0 for _ in range(bucket_count)]
    for value in values:
        index = min(bucket_count - 1, int((value - low) / width))
        buckets[index] += 1
    return [
        {
            "range": f"{round(low + i * width, 1)}% to {round(low + (i + 1) * width, 1)}%",
            "start": round(low + i * width, 2),
            "end": round(low + (i + 1) * width, 2),
            "count": count,
        }
        for i, count in enumerate(buckets)
    ]
