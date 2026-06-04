"""RSI mean-reversion strategy."""

from __future__ import annotations

from app.strategies.base import Bar, Signal, Strategy
from app.strategies.indicators import rsi
from app.strategies.registry import register


@register
class RsiStrategy(Strategy):
    key = "rsi"
    name = "RSI Mean Reversion"
    description = "Buy when RSI falls below the oversold level; sell when it rises above overbought."
    param_schema = {
        "type": "object",
        "properties": {
            "period": {"type": "integer", "default": 14, "minimum": 2, "title": "RSI period"},
            "oversold": {"type": "number", "default": 30, "minimum": 1, "title": "Oversold"},
            "overbought": {"type": "number", "default": 70, "maximum": 99, "title": "Overbought"},
            "qty": {"type": "number", "default": 1, "minimum": 0, "title": "Order quantity"},
        },
        "required": ["period", "oversold", "overbought", "qty"],
    }

    def generate_signals(self, bars_by_symbol: dict[str, list[Bar]]) -> list[Signal]:
        period, oversold, overbought, qty = (
            self.params["period"],
            self.params["oversold"],
            self.params["overbought"],
            self.params["qty"],
        )
        signals: list[Signal] = []
        for symbol, bars in bars_by_symbol.items():
            series = rsi([b.close for b in bars], period)
            value = series[-1] if series else None
            if value is None:
                continue
            if value < oversold:
                signals.append(Signal(symbol, "buy", qty, {"rsi": round(value, 2)}))
            elif value > overbought:
                signals.append(Signal(symbol, "sell", qty, {"rsi": round(value, 2)}))
        return signals
