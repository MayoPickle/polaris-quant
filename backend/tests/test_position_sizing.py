"""Position sizing model behavior."""

from app.brokers.base import Bar
from app.strategies.backtest import run_backtest
from app.strategies.base import Signal, Strategy


class AlwaysBuy(Strategy):
    key = "always_buy"

    def generate_signals(self, bars_by_symbol):  # noqa: ANN001, ANN201
        symbol = next(iter(bars_by_symbol))
        return [Signal(symbol=symbol, side="buy")]


class BuyAfterBars(Strategy):
    key = "buy_after_bars"

    def __init__(self, count: int) -> None:
        super().__init__()
        self.count = count

    def generate_signals(self, bars_by_symbol):  # noqa: ANN001, ANN201
        symbol, bars = next(iter(bars_by_symbol.items()))
        return [Signal(symbol=symbol, side="buy")] if len(bars) >= self.count else []


def flat_bars(count: int, close: float = 100) -> list[Bar]:
    return [
        Bar(
            timestamp=f"2026-01-{i + 1:02d}T00:00:00",
            open=close,
            high=close,
            low=close,
            close=close,
            volume=1000,
        )
        for i in range(count)
    ]


def test_fixed_target_ignores_repeated_buy_signals() -> None:
    result = run_backtest(
        AlwaysBuy(),
        "AAPL",
        flat_bars(3),
        initial_capital=100_000,
        position_sizing={"method": "fixed_target", "target_pct": 20},
    )

    assert result.trades[0]["qty"] == 200
    assert result.position_sizing["method"] == "fixed_target"


def test_fixed_risk_uses_risk_amount_and_stop_distance() -> None:
    result = run_backtest(
        AlwaysBuy(),
        "AAPL",
        flat_bars(3),
        initial_capital=100_000,
        position_sizing={
            "method": "fixed_risk",
            "risk_amount": 1_000,
            "stop_loss_pct": 5,
            "max_position_pct": 100,
        },
    )

    assert result.trades[0]["qty"] == 200
    assert result.position_sizing["method"] == "fixed_risk"


def test_atr_risk_uses_atr_multiple_as_risk_per_share() -> None:
    bars = [
        Bar(timestamp="2026-01-01T00:00:00", open=100, high=100, low=100, close=100, volume=1000),
        Bar(timestamp="2026-01-02T00:00:00", open=100, high=105, low=100, close=100, volume=1000),
        Bar(timestamp="2026-01-03T00:00:00", open=100, high=105, low=100, close=100, volume=1000),
    ]

    result = run_backtest(
        BuyAfterBars(3),
        "AAPL",
        bars,
        initial_capital=100_000,
        position_sizing={
            "method": "atr_risk",
            "risk_amount": 1_000,
            "atr_period": 14,
            "atr_multiple": 2,
            "max_position_pct": 100,
        },
    )

    assert result.trades[0]["qty"] == 100
    assert result.position_sizing["method"] == "atr_risk"


def test_pyramiding_adds_on_repeated_buy_signals_until_cap() -> None:
    result = run_backtest(
        AlwaysBuy(),
        "AAPL",
        flat_bars(5),
        initial_capital=100_000,
        position_sizing={
            "method": "pyramiding",
            "tranche_pct": 10,
            "max_position_pct": 30,
        },
    )

    assert result.trades[0]["qty"] == 300
    assert result.position_sizing["method"] == "pyramiding"
    assert result.position_size_pct == 30


def test_equal_weight_uses_inverse_universe_size() -> None:
    result = run_backtest(
        AlwaysBuy(),
        "AAPL",
        flat_bars(3),
        initial_capital=100_000,
        position_sizing={
            "method": "equal_weight",
            "universe_size": 5,
            "max_position_pct": 100,
        },
    )

    assert result.trades[0]["qty"] == 200
    assert result.position_sizing["method"] == "equal_weight"


def test_volatility_target_reduces_notional_when_realized_volatility_is_high() -> None:
    closes = [100, 110, 100, 110, 100]
    bars = [
        Bar(timestamp=f"2026-01-{i + 1:02d}T00:00:00", open=c, high=c, low=c, close=c, volume=1000)
        for i, c in enumerate(closes)
    ]

    result = run_backtest(
        BuyAfterBars(5),
        "AAPL",
        bars,
        initial_capital=100_000,
        position_sizing={
            "method": "volatility_target",
            "target_pct": 20,
            "target_volatility_pct": 10,
            "volatility_lookback": 4,
            "max_position_pct": 100,
        },
    )

    assert 0 < result.trades[0]["qty"] < 200
    assert result.position_sizing["method"] == "volatility_target"
