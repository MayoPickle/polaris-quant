"""Symbol normalization and import parsing for batch backtests."""

from __future__ import annotations

import re

_SYMBOL_RE = re.compile(r"^[A-Z][A-Z0-9.-]{0,15}$")
_SPLIT_RE = re.compile(r"[,;\t]+")
_TOKEN_RE = re.compile(r"[\s,;]+")
_IGNORED_SYMBOL_TOKENS = {"SYMBOL", "TICKER", "TICKERS"}


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

