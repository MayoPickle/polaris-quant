"""Bollinger Bands mean-reversion strategy."""

from __future__ import annotations

from app.strategies.base import Bar, Signal, Strategy
from app.strategies.indicators import rolling_std, sma
from app.strategies.registry import register


@register
class BollingerStrategy(Strategy):
    key = "bollinger"
    name = "Bollinger Bands"
    description = "Buy when price closes below the lower band; sell when it closes above the upper band."
    param_schema = {
        "type": "object",
        "properties": {
            "period": {"type": "integer", "default": 20, "minimum": 2, "title": "Period"},
            "num_std": {"type": "number", "default": 2, "minimum": 0.5, "title": "Std devs"},
            "qty": {"type": "number", "default": 1, "minimum": 0, "title": "Order quantity"},
        },
        "required": ["period", "num_std", "qty"],
    }

    def generate_signals(self, bars_by_symbol: dict[str, list[Bar]]) -> list[Signal]:
        period, num_std, qty = self.params["period"], self.params["num_std"], self.params["qty"]
        signals: list[Signal] = []
        for symbol, bars in bars_by_symbol.items():
            closes = [b.close for b in bars]
            mid = sma(closes, period)
            std = rolling_std(closes, period)
            if mid[-1] is None or std[-1] is None:
                continue
            upper = mid[-1] + num_std * std[-1]
            lower = mid[-1] - num_std * std[-1]
            price = closes[-1]
            if price < lower:
                signals.append(Signal(symbol, "buy", qty, {"lower": round(lower, 2)}))
            elif price > upper:
                signals.append(Signal(symbol, "sell", qty, {"upper": round(upper, 2)}))
        return signals
