"""Position sizing models for backtests.

The strategy layer emits buy/sell intent; this module turns buy intent into a
whole-share order quantity under a configurable sizing model.
"""

from __future__ import annotations

import math
from typing import Any

from app.brokers.base import Bar

POSITION_SIZING_METHODS = {
    "fixed_target",
    "fixed_risk",
    "atr_risk",
    "pyramiding",
    "equal_weight",
    "volatility_target",
}

DEFAULT_POSITION_SIZING: dict[str, Any] = {
    "method": "fixed_target",
    "target_pct": 20.0,
    "risk_amount": 1_000.0,
    "stop_loss_pct": 5.0,
    "atr_period": 14,
    "atr_multiple": 2.0,
    "tranche_pct": 10.0,
    "max_position_pct": 40.0,
    "universe_size": 10,
    "target_volatility_pct": 12.0,
    "volatility_lookback": 20,
}

_PERIODS_PER_YEAR = {"1Day": 252, "1Hour": 252 * 7, "1Min": 252 * 390}


def normalize_position_sizing(
    config: dict[str, Any] | None = None,
    *,
    fallback_position_size_pct: float | None = None,
    universe_size: int | None = None,
) -> dict[str, Any]:
    data = dict(DEFAULT_POSITION_SIZING)
    if fallback_position_size_pct is not None:
        data["target_pct"] = fallback_position_size_pct
        data["max_position_pct"] = max(data["max_position_pct"], fallback_position_size_pct)

    if config:
        for key, value in config.items():
            if value is not None and key in data:
                data[key] = value

    if universe_size is not None and data["method"] == "equal_weight":
        data["universe_size"] = universe_size

    _validate_position_sizing(data)
    return data


def position_sizing_summary_pct(config: dict[str, Any]) -> float:
    method = config["method"]
    if method == "fixed_target":
        return float(config["target_pct"])
    if method == "equal_weight":
        return min(100.0 / int(config["universe_size"]), float(config["max_position_pct"]))
    return float(config["max_position_pct"])


def calculate_buy_quantity(
    *,
    config: dict[str, Any],
    bars: list[Bar],
    cash: float,
    shares: int,
    close: float,
    timeframe: str,
    benchmark: bool = False,
) -> int:
    if close <= 0 or cash <= 0:
        return 0

    method = config["method"]
    if shares > 0 and method != "pyramiding":
        return 0

    equity = cash + shares * close
    current_notional = shares * close
    if equity <= 0:
        return 0

    target_notional = _target_notional(
        config=config,
        bars=bars,
        equity=equity,
        current_notional=current_notional,
        close=close,
        timeframe=timeframe,
        benchmark=benchmark,
    )
    order_notional = min(cash, max(0.0, target_notional - current_notional))
    return int(order_notional // close)


def _target_notional(
    *,
    config: dict[str, Any],
    bars: list[Bar],
    equity: float,
    current_notional: float,
    close: float,
    timeframe: str,
    benchmark: bool,
) -> float:
    method = config["method"]
    max_notional = equity * float(config["max_position_pct"]) / 100

    if method == "fixed_target":
        return equity * float(config["target_pct"]) / 100

    if method == "fixed_risk":
        risk_per_share = close * float(config["stop_loss_pct"]) / 100
        return min(_risk_budget_notional(config, close, risk_per_share), max_notional)

    if method == "atr_risk":
        atr = _average_true_range(bars, int(config["atr_period"]))
        risk_per_share = atr * float(config["atr_multiple"])
        if risk_per_share <= 0:
            risk_per_share = close * float(config["stop_loss_pct"]) / 100
        return min(_risk_budget_notional(config, close, risk_per_share), max_notional)

    if method == "pyramiding":
        if benchmark:
            return max_notional
        next_notional = current_notional + equity * float(config["tranche_pct"]) / 100
        return min(next_notional, max_notional)

    if method == "equal_weight":
        target_pct = min(100.0 / int(config["universe_size"]), float(config["max_position_pct"]))
        return equity * target_pct / 100

    if method == "volatility_target":
        realized_vol_pct = _realized_volatility_pct(
            bars,
            int(config["volatility_lookback"]),
            timeframe,
        )
        target_pct = float(config["target_pct"])
        if realized_vol_pct > 0:
            target_pct = float(config["target_volatility_pct"]) / realized_vol_pct * 100
        return equity * min(target_pct, float(config["max_position_pct"])) / 100

    raise ValueError(f"Unknown position sizing method: {method!r}")


def _risk_budget_notional(config: dict[str, Any], close: float, risk_per_share: float) -> float:
    if risk_per_share <= 0:
        return 0.0
    return float(config["risk_amount"]) / risk_per_share * close


def _average_true_range(bars: list[Bar], period: int) -> float:
    if len(bars) < 2:
        return 0.0
    window = bars[-(period + 1) :]
    ranges: list[float] = []
    for prev, current in zip(window, window[1:], strict=False):
        ranges.append(
            max(
                current.high - current.low,
                abs(current.high - prev.close),
                abs(current.low - prev.close),
            )
        )
    return sum(ranges) / len(ranges) if ranges else 0.0


def _realized_volatility_pct(bars: list[Bar], lookback: int, timeframe: str) -> float:
    window = bars[-(lookback + 1) :]
    returns = [
        window[i].close / window[i - 1].close - 1
        for i in range(1, len(window))
        if window[i - 1].close > 0
    ]
    if len(returns) < 2:
        return 0.0
    mean = sum(returns) / len(returns)
    var = sum((r - mean) ** 2 for r in returns) / (len(returns) - 1)
    return math.sqrt(var) * math.sqrt(_PERIODS_PER_YEAR.get(timeframe, 252)) * 100


def _validate_position_sizing(config: dict[str, Any]) -> None:
    method = config.get("method")
    if method not in POSITION_SIZING_METHODS:
        raise ValueError(f"Unknown position sizing method: {method!r}")

    _validate_range(config, "target_pct", 0, 100)
    _validate_range(config, "risk_amount", 0, None)
    _validate_range(config, "stop_loss_pct", 0, 100)
    _validate_range(config, "atr_period", 1, 252, integer=True)
    _validate_range(config, "atr_multiple", 0, 20)
    _validate_range(config, "tranche_pct", 0, 100)
    _validate_range(config, "max_position_pct", 0, 100)
    _validate_range(config, "universe_size", 0, 1000, integer=True)
    _validate_range(config, "target_volatility_pct", 0, 200)
    _validate_range(config, "volatility_lookback", 1, 252, integer=True)

    if (
        config["method"] == "pyramiding"
        and float(config["tranche_pct"]) > float(config["max_position_pct"])
    ):
        raise ValueError("tranche_pct must be less than or equal to max_position_pct.")


def _validate_range(
    config: dict[str, Any],
    key: str,
    lower: float,
    upper: float | None,
    *,
    integer: bool = False,
) -> None:
    value = config[key]
    if integer and int(value) != value:
        raise ValueError(f"{key} must be an integer.")
    numeric = float(value)
    if numeric <= lower:
        raise ValueError(f"{key} must be greater than {lower}.")
    if upper is not None and numeric > upper:
        raise ValueError(f"{key} must be less than or equal to {upper}.")
