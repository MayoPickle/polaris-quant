import random

import pytest

from app.strategies import registry


def test_sma_cross_generates_buy_on_upward_cross() -> None:
    from app.strategies.base import Bar

    strat = registry.create_strategy("sma_cross", {"fast": 2, "slow": 3, "qty": 1})
    # Flat, then a jump on the final bar so the fast SMA crosses up exactly there.
    closes = [10, 10, 10, 10, 10, 10, 20]
    bars = [Bar(timestamp=str(i), open=c, high=c, low=c, close=c, volume=1) for i, c in enumerate(closes)]
    signals = strat.generate_signals({"AAPL": bars})
    assert any(s.side == "buy" and s.symbol == "AAPL" for s in signals)


def test_backtest_runs_and_reports_metrics() -> None:
    from app.brokers.base import Bar
    from app.strategies.backtest import run_backtest

    strat = registry.create_strategy("sma_cross", {"fast": 2, "slow": 3, "qty": 1})
    # Down then sustained up-trend: should trigger at least one round-trip trade.
    closes = [20, 18, 16, 15, 15, 16, 18, 21, 25, 30, 28, 32, 36, 40]
    bars = [
        Bar(timestamp=f"2026-01-{i + 1:02d}T00:00:00", open=c, high=c, low=c, close=c, volume=1000)
        for i, c in enumerate(closes)
    ]
    result = run_backtest(strat, "AAPL", bars, initial_capital=10_000)

    assert result.symbol == "AAPL"
    assert len(result.equity_curve) == len(bars)
    assert result.num_trades >= 1
    assert result.position_size_pct == 20.0
    assert result.buy_hold_return_pct == 20.0
    assert result.alpha_return_pct == round(result.total_return_pct - 20.0, 2)
    assert all(p["equity"] > 0 for p in result.equity_curve)


def test_backtest_uses_target_position_size_for_new_positions() -> None:
    from app.brokers.base import Bar
    from app.strategies.backtest import run_backtest
    from app.strategies.base import Signal, Strategy

    class AlwaysBuy(Strategy):
        key = "always_buy"

        def generate_signals(self, bars_by_symbol):  # noqa: ANN001, ANN201
            symbol = next(iter(bars_by_symbol))
            return [Signal(symbol=symbol, side="buy")]

    bars = [
        Bar(timestamp="2026-01-01T00:00:00", open=100, high=100, low=100, close=100, volume=1000),
        Bar(timestamp="2026-01-02T00:00:00", open=100, high=100, low=100, close=100, volume=1000),
        Bar(timestamp="2026-01-03T00:00:00", open=90, high=90, low=90, close=90, volume=1000),
    ]

    result = run_backtest(AlwaysBuy(), "AAPL", bars, initial_capital=100_000, position_size_pct=20)

    assert result.position_size_pct == 20
    assert result.trades[0]["qty"] == 200
    assert result.final_equity == 98_000
    assert result.total_return_pct == -2.0
    assert result.max_drawdown_pct == 2.0


def test_backtest_buy_hold_benchmark_uses_same_position_size() -> None:
    from app.brokers.base import Bar
    from app.strategies.backtest import run_backtest
    from app.strategies.base import Signal, Strategy

    class AlwaysBuy(Strategy):
        key = "always_buy"

        def generate_signals(self, bars_by_symbol):  # noqa: ANN001, ANN201
            symbol = next(iter(bars_by_symbol))
            return [Signal(symbol=symbol, side="buy")]

    bars = [
        Bar(timestamp="2026-01-01T00:00:00", open=100, high=100, low=100, close=100, volume=1000),
        Bar(timestamp="2026-01-02T00:00:00", open=200, high=200, low=200, close=200, volume=1000),
    ]

    result = run_backtest(AlwaysBuy(), "AAPL", bars, initial_capital=100_000, position_size_pct=20)

    assert result.final_equity == 120_000
    assert result.total_return_pct == 20.0
    assert result.buy_hold_return_pct == 20.0
    assert result.alpha_return_pct == 0.0


def test_backtest_rejects_invalid_position_size() -> None:
    from app.brokers.base import Bar
    from app.strategies.backtest import run_backtest

    strat = registry.create_strategy("sma_cross", {"fast": 2, "slow": 3, "qty": 1})
    bars = [
        Bar(timestamp=f"2026-01-{i + 1:02d}T00:00:00", open=100, high=100, low=100, close=100, volume=1000)
        for i in range(5)
    ]

    with pytest.raises(ValueError, match="target_pct"):
        run_backtest(strat, "AAPL", bars, position_size_pct=0)


def test_all_registered_strategies_backtest_cleanly() -> None:
    from app.brokers.base import Bar
    from app.strategies.backtest import run_backtest

    expected = {"sma_cross", "rsi", "bollinger", "macd", "momentum", "sma_stop"}
    keys = {cls.key for cls in registry.list_strategies()}
    assert expected <= keys

    random.seed(7)
    price = 100.0
    closes = []
    for _ in range(120):
        price = max(1.0, price * (1 + random.uniform(-0.03, 0.03)))
        closes.append(price)
    bars = [
        Bar(timestamp=f"2026-01-{i % 28 + 1:02d}T00:00:00", open=c, high=c, low=c, close=c, volume=1000)
        for i, c in enumerate(closes)
    ]

    for key in expected:
        strat = registry.create_strategy(key)
        result = run_backtest(strat, "AAPL", bars, initial_capital=10_000)
        assert len(result.equity_curve) == len(bars)
        assert all(p["equity"] > 0 for p in result.equity_curve), key

