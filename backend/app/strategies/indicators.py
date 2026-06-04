"""Technical indicators.

Each function takes a list of prices (oldest first) and returns a list of the
same length, with ``None`` during the warmup period where the indicator is not
yet defined. Strategies read the last one or two values to detect levels and
crossings.
"""

from __future__ import annotations

import math


def sma(values: list[float], n: int) -> list[float | None]:
    out: list[float | None] = [None] * len(values)
    for i in range(n - 1, len(values)):
        out[i] = sum(values[i - n + 1 : i + 1]) / n
    return out


def ema(values: list[float], n: int) -> list[float | None]:
    out: list[float | None] = [None] * len(values)
    if len(values) < n:
        return out
    k = 2 / (n + 1)
    prev = sum(values[:n]) / n  # seed with SMA of the first window
    out[n - 1] = prev
    for i in range(n, len(values)):
        prev = values[i] * k + prev * (1 - k)
        out[i] = prev
    return out


def rolling_std(values: list[float], n: int) -> list[float | None]:
    """Population standard deviation over a rolling window (Bollinger convention)."""
    out: list[float | None] = [None] * len(values)
    for i in range(n - 1, len(values)):
        window = values[i - n + 1 : i + 1]
        mean = sum(window) / n
        var = sum((x - mean) ** 2 for x in window) / n
        out[i] = math.sqrt(var)
    return out


def rsi(values: list[float], n: int) -> list[float | None]:
    """Wilder's Relative Strength Index."""
    out: list[float | None] = [None] * len(values)
    if len(values) < n + 1:
        return out

    gains = losses = 0.0
    for i in range(1, n + 1):
        change = values[i] - values[i - 1]
        gains += max(change, 0.0)
        losses += max(-change, 0.0)
    avg_gain, avg_loss = gains / n, losses / n

    def _rsi(ag: float, al: float) -> float:
        if al == 0:
            return 100.0
        return 100 - 100 / (1 + ag / al)

    out[n] = _rsi(avg_gain, avg_loss)
    for i in range(n + 1, len(values)):
        change = values[i] - values[i - 1]
        avg_gain = (avg_gain * (n - 1) + max(change, 0.0)) / n
        avg_loss = (avg_loss * (n - 1) + max(-change, 0.0)) / n
        out[i] = _rsi(avg_gain, avg_loss)
    return out


def roc(values: list[float], n: int) -> list[float | None]:
    """Rate of change (%) over n periods."""
    out: list[float | None] = [None] * len(values)
    for i in range(n, len(values)):
        if values[i - n] != 0:
            out[i] = (values[i] / values[i - n] - 1) * 100
    return out


def macd(
    values: list[float], fast: int, slow: int, signal: int
) -> tuple[list[float | None], list[float | None]]:
    """Return (macd_line, signal_line), aligned to ``values`` with None padding."""
    ema_fast, ema_slow = ema(values, fast), ema(values, slow)
    macd_line: list[float | None] = [
        ema_fast[i] - ema_slow[i]
        if ema_fast[i] is not None and ema_slow[i] is not None
        else None
        for i in range(len(values))
    ]

    first = next((i for i, v in enumerate(macd_line) if v is not None), None)
    signal_line: list[float | None] = [None] * len(values)
    if first is not None:
        defined = [v for v in macd_line[first:] if v is not None]
        sig = ema(defined, signal)
        for offset, v in enumerate(sig):
            signal_line[first + offset] = v
    return macd_line, signal_line
