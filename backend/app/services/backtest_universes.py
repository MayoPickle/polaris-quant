"""Universe definitions and refresh helpers for batch backtests."""

from __future__ import annotations

import csv
import re
from html.parser import HTMLParser
from io import StringIO

import httpx
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.backtest import UniverseSymbol
from app.services.backtest_symbols import normalize_symbol, parse_imported_symbols
from app.services.backtest_universe_definitions import UNIVERSES


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


def list_universes(locale: str = "en-US") -> list[dict[str, str]]:
    return [
        {
            "key": u.key,
            "name": u.translations.get(locale, {}).get("name", u.name),
            "description": u.translations.get(locale, {}).get("description", u.description),
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


def _clean_cell(value: str) -> str:
    value = re.sub(r"\[[^\]]+\]", "", value)
    return " ".join(value.replace("\xa0", " ").split()).strip()


def _normalize_header(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.lower())
