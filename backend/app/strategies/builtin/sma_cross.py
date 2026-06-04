"""Simple moving-average crossover — a reference strategy.

Buys when the fast SMA crosses above the slow SMA, sells on the opposite cross.
Intentionally minimal: it exists to exercise the engine end-to-end.
"""

from __future__ import annotations

from app.strategies.base import Bar, Signal, Strategy
from app.strategies.registry import register


def _sma(values: list[float], window: int) -> float | None:
    if len(values) < window:
        return None
    return sum(values[-window:]) / window


@register
class SmaCrossStrategy(Strategy):
    key = "sma_cross"
    name = "SMA Crossover"
    description = "Buy when the fast SMA crosses above the slow SMA; sell on the reverse cross."
    param_schema = {
        "type": "object",
        "properties": {
            "fast": {"type": "integer", "default": 10, "minimum": 2, "title": "Fast window"},
            "slow": {"type": "integer", "default": 30, "minimum": 3, "title": "Slow window"},
            "qty": {"type": "number", "default": 1, "minimum": 0, "title": "Order quantity"},
        },
        "required": ["fast", "slow", "qty"],
    }

    def generate_signals(self, bars_by_symbol: dict[str, list[Bar]]) -> list[Signal]:
        fast, slow, qty = self.params["fast"], self.params["slow"], self.params["qty"]
        signals: list[Signal] = []

        for symbol, bars in bars_by_symbol.items():
            closes = [b.close for b in bars]
            if len(closes) < slow + 1:
                continue

            fast_now, slow_now = _sma(closes, fast), _sma(closes, slow)
            fast_prev, slow_prev = _sma(closes[:-1], fast), _sma(closes[:-1], slow)
            if None in (fast_now, slow_now, fast_prev, slow_prev):
                continue

            crossed_up = fast_prev <= slow_prev and fast_now > slow_now
            crossed_down = fast_prev >= slow_prev and fast_now < slow_now

            if crossed_up:
                signals.append(Signal(symbol, "buy", qty, {"fast": fast_now, "slow": slow_now}))
            elif crossed_down:
                signals.append(Signal(symbol, "sell", qty, {"fast": fast_now, "slow": slow_now}))

        return signals
