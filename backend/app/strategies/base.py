"""Strategy abstraction.

A strategy is a pure function of market data + params -> signals. It does NOT
place orders or touch the broker; the engine/worker takes signals, runs them
through risk checks, and submits orders. This keeps strategies easy to backtest.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Literal

# Bar is defined in the broker/data layer; re-exported here as the strategy's
# input contract so existing `from app.strategies.base import Bar` keeps working.
from app.brokers.base import Bar  # noqa: F401

SignalSide = Literal["buy", "sell", "hold"]


@dataclass
class Signal:
    symbol: str
    side: SignalSide
    qty: float = 0.0
    meta: dict = field(default_factory=dict)


class Strategy(ABC):
    """Base class for all strategies.

    Subclasses declare a unique `key`, a human `name`, a `description`, and a
    `param_schema` (used to render the config form in the frontend). They
    implement `generate_signals` over historical bars per symbol.
    """

    key: str = ""
    name: str = ""
    description: str = ""
    param_schema: dict = {}

    def __init__(self, params: dict | None = None) -> None:
        self.params = {**self.default_params(), **(params or {})}

    @classmethod
    def default_params(cls) -> dict:
        """Default values derived from the param schema."""
        return {
            name: spec.get("default")
            for name, spec in cls.param_schema.get("properties", {}).items()
            if "default" in spec
        }

    @abstractmethod
    def generate_signals(self, bars_by_symbol: dict[str, list[Bar]]) -> list[Signal]:
        """Return zero or more signals given recent bars for each symbol."""
        ...
