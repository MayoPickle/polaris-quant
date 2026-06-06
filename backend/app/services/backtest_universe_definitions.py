"""Batch backtest universe definitions."""

from __future__ import annotations

from dataclasses import dataclass, field


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

