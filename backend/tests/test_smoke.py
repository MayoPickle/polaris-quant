"""Smoke tests that don't touch the broker network."""

from collections.abc import Iterator
from contextlib import contextmanager

from fastapi.testclient import TestClient

from app.api.deps import get_broker_client
from app.brokers.base import Account, Bar, OrderRequest, OrderResult, Position, Quote
from app.main import app
from app.strategies import registry

client = TestClient(app)


class FakeMarketBroker:
    def __init__(self) -> None:
        self.calls: list[dict] = []

    def is_market_open(self) -> bool:
        return True

    def get_quote(self, symbol: str) -> Quote:
        return Quote(symbol=symbol, bid_price=100, ask_price=101, last_price=100.5)

    def get_bars(self, symbol: str, *, timeframe="1Day", start=None, end=None) -> list[Bar]:
        self.calls.append({"symbol": symbol, "timeframe": timeframe, "start": start, "end": end})
        base = 100 if symbol == "AAPL" else 200
        return [
            Bar(
                timestamp="2026-01-01T00:00:00+00:00",
                open=base,
                high=base + 2,
                low=base - 1,
                close=base + 1,
                volume=1_000,
            ),
            Bar(
                timestamp="2026-01-02T00:00:00+00:00",
                open=base + 1,
                high=base + 3,
                low=base,
                close=base + 2,
                volume=1_500,
            ),
        ]

    def get_account(self) -> Account:
        return Account(cash=100_000, equity=100_000, buying_power=100_000)

    def get_positions(self) -> list[Position]:
        return []

    def submit_order(self, request: OrderRequest) -> OrderResult:
        raise NotImplementedError

    def get_order(self, broker_order_id: str) -> OrderResult:
        raise NotImplementedError

    def cancel_order(self, broker_order_id: str) -> None:
        raise NotImplementedError


@contextmanager
def broker_override(broker: FakeMarketBroker) -> Iterator[None]:
    app.dependency_overrides[get_broker_client] = lambda: broker
    try:
        yield
    finally:
        app.dependency_overrides.pop(get_broker_client, None)


def test_health() -> None:
    resp = client.get("/api/v1/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_available_strategies_includes_sma_cross() -> None:
    resp = client.get("/api/v1/strategies/available")
    assert resp.status_code == 200
    keys = {s["key"] for s in resp.json()}
    assert "sma_cross" in keys


def test_market_bars_returns_normalized_series() -> None:
    broker = FakeMarketBroker()
    with broker_override(broker):
        resp = client.get(
            "/api/v1/market/bars?symbols=aapl, MSFT, aapl&timeframe=1Day&lookback_days=90"
        )

    assert resp.status_code == 200
    payload = resp.json()
    assert payload["timeframe"] == "1Day"
    assert payload["lookback_days"] == 90
    assert [item["symbol"] for item in payload["series"]] == ["AAPL", "MSFT"]
    assert [call["symbol"] for call in broker.calls] == ["AAPL", "MSFT"]
    assert all(call["timeframe"] == "1Day" for call in broker.calls)
    assert all(call["start"] is not None and call["end"] is not None for call in broker.calls)
    assert payload["series"][0]["bars"][0]["timestamp"] < payload["series"][0]["bars"][1]["timestamp"]
    assert payload["series"][0]["bars"][0]["close"] == 101


def test_market_bars_rejects_invalid_inputs() -> None:
    broker = FakeMarketBroker()
    with broker_override(broker):
        invalid_symbol = client.get("/api/v1/market/bars?symbols=AAPL,$BAD")
        invalid_lookback = client.get("/api/v1/market/bars?symbols=AAPL&lookback_days=366")

    assert invalid_symbol.status_code == 422
    assert invalid_lookback.status_code == 422
    assert broker.calls == []


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
