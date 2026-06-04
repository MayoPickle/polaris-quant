"""MACD trend strategy."""

from __future__ import annotations

from app.strategies.base import Bar, Signal, Strategy
from app.strategies.indicators import macd
from app.strategies.registry import register


@register
class MacdStrategy(Strategy):
    key = "macd"
    name = "MACD"
    description = "Buy when the MACD line crosses above its signal line; sell on the reverse cross."
    param_schema = {
        "type": "object",
        "properties": {
            "fast": {"type": "integer", "default": 12, "minimum": 2, "title": "Fast EMA"},
            "slow": {"type": "integer", "default": 26, "minimum": 3, "title": "Slow EMA"},
            "signal": {"type": "integer", "default": 9, "minimum": 2, "title": "Signal EMA"},
            "qty": {"type": "number", "default": 1, "minimum": 0, "title": "Order quantity"},
        },
        "required": ["fast", "slow", "signal", "qty"],
    }

    def generate_signals(self, bars_by_symbol: dict[str, list[Bar]]) -> list[Signal]:
        fast, slow, signal_n, qty = (
            self.params["fast"],
            self.params["slow"],
            self.params["signal"],
            self.params["qty"],
        )
        signals: list[Signal] = []
        for symbol, bars in bars_by_symbol.items():
            macd_line, signal_line = macd([b.close for b in bars], fast, slow, signal_n)
            if len(macd_line) < 2 or None in (
                macd_line[-1],
                macd_line[-2],
                signal_line[-1],
                signal_line[-2],
            ):
                continue
            crossed_up = macd_line[-2] <= signal_line[-2] and macd_line[-1] > signal_line[-1]
            crossed_down = macd_line[-2] >= signal_line[-2] and macd_line[-1] < signal_line[-1]
            if crossed_up:
                signals.append(Signal(symbol, "buy", qty, {"macd": round(macd_line[-1], 4)}))
            elif crossed_down:
                signals.append(Signal(symbol, "sell", qty, {"macd": round(macd_line[-1], 4)}))
        return signals
