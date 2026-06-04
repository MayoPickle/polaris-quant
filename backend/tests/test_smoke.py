"""Smoke tests that don't touch the broker network."""

from fastapi.testclient import TestClient

from app.main import app
from app.strategies import registry

client = TestClient(app)


def test_health() -> None:
    resp = client.get("/api/v1/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_available_strategies_includes_sma_cross() -> None:
    resp = client.get("/api/v1/strategies/available")
    assert resp.status_code == 200
    keys = {s["key"] for s in resp.json()}
    assert "sma_cross" in keys


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
    # Equity should never go negative in a long-only, all-cash sim.
    assert all(p["equity"] > 0 for p in result.equity_curve)


def test_all_registered_strategies_backtest_cleanly() -> None:
    import random

    from app.brokers.base import Bar
    from app.strategies.backtest import run_backtest

    expected = {"sma_cross", "rsi", "bollinger", "macd", "momentum", "sma_stop"}
    keys = {cls.key for cls in registry.list_strategies()}
    assert expected <= keys

    # Synthetic noisy random-walk so every indicator has enough data.
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
