"""Momentum (rate-of-change) trend strategy."""

from __future__ import annotations

from app.strategies.base import Bar, Signal, Strategy
from app.strategies.indicators import roc
from app.strategies.registry import register


@register
class MomentumStrategy(Strategy):
    key = "momentum"
    name = "Momentum (ROC)"
    description = "Buy when rate-of-change rises above the threshold; sell when it turns negative."
    param_schema = {
        "type": "object",
        "properties": {
            "period": {"type": "integer", "default": 20, "minimum": 2, "title": "Lookback"},
            "threshold": {"type": "number", "default": 2, "minimum": 0, "title": "Entry threshold %"},
            "qty": {"type": "number", "default": 1, "minimum": 0, "title": "Order quantity"},
        },
        "required": ["period", "threshold", "qty"],
    }

    def generate_signals(self, bars_by_symbol: dict[str, list[Bar]]) -> list[Signal]:
        period, threshold, qty = self.params["period"], self.params["threshold"], self.params["qty"]
        signals: list[Signal] = []
        for symbol, bars in bars_by_symbol.items():
            series = roc([b.close for b in bars], period)
            value = series[-1] if series else None
            if value is None:
                continue
            if value > threshold:
                signals.append(Signal(symbol, "buy", qty, {"roc": round(value, 2)}))
            elif value < 0:
                signals.append(Signal(symbol, "sell", qty, {"roc": round(value, 2)}))
        return signals
