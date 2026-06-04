"""SMA crossover with a stop-loss exit.

Stop-loss needs to know the entry price, which a stateless strategy doesn't
carry. Rather than hold mutable state (which would desync if a signal isn't
filled), this replays its own entry/exit rules over the visible window each call
and emits a signal only if the *latest* bar triggers an action. Pure and
backtest-safe.
"""

from __future__ import annotations

from app.strategies.base import Bar, Signal, Strategy
from app.strategies.indicators import sma
from app.strategies.registry import register


@register
class SmaStopStrategy(Strategy):
    key = "sma_stop"
    name = "SMA Crossover + Stop-Loss"
    description = "SMA crossover entries, with a stop-loss exit if price drops a set percent below entry."
    param_schema = {
        "type": "object",
        "properties": {
            "fast": {"type": "integer", "default": 10, "minimum": 2, "title": "Fast window"},
            "slow": {"type": "integer", "default": 30, "minimum": 3, "title": "Slow window"},
            "stop_pct": {"type": "number", "default": 5, "minimum": 0.1, "title": "Stop-loss %"},
            "qty": {"type": "number", "default": 1, "minimum": 0, "title": "Order quantity"},
        },
        "required": ["fast", "slow", "stop_pct", "qty"],
    }

    def generate_signals(self, bars_by_symbol: dict[str, list[Bar]]) -> list[Signal]:
        fast, slow, stop_pct, qty = (
            self.params["fast"],
            self.params["slow"],
            self.params["stop_pct"],
            self.params["qty"],
        )
        signals: list[Signal] = []
        for symbol, bars in bars_by_symbol.items():
            action = self._replay(
                [b.close for b in bars], fast=fast, slow=slow, stop_pct=stop_pct
            )
            if action == "buy":
                signals.append(Signal(symbol, "buy", qty))
            elif action == "sell":
                signals.append(Signal(symbol, "sell", qty))
        return signals

    @staticmethod
    def _replay(closes: list[float], *, fast: int, slow: int, stop_pct: float) -> str | None:
        """Walk the window; return the action ('buy'/'sell'/None) on the final bar."""
        f = sma(closes, fast)
        s = sma(closes, slow)
        last = len(closes) - 1
        holding = False
        entry = 0.0
        action: str | None = None

        for i in range(1, len(closes)):
            if None in (f[i], f[i - 1], s[i], s[i - 1]):
                continue
            price = closes[i]
            if not holding:
                if f[i - 1] <= s[i - 1] and f[i] > s[i]:  # golden cross
                    holding, entry = True, price
                    if i == last:
                        action = "buy"
            else:
                cross_down = f[i - 1] >= s[i - 1] and f[i] < s[i]
                stop_hit = price <= entry * (1 - stop_pct / 100)
                if cross_down or stop_hit:
                    holding, entry = False, 0.0
                    if i == last:
                        action = "sell"
        return action
