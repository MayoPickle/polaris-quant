"""Smoke tests that don't touch the broker network."""

from collections.abc import Iterator
from contextlib import contextmanager

import pytest
from fastapi.testclient import TestClient

from app.api.deps import get_broker_client, get_current_user_id
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


@contextmanager
def auth_override(user_id: int = 1) -> Iterator[None]:
    app.dependency_overrides[get_current_user_id] = lambda: user_id
    try:
        yield
    finally:
        app.dependency_overrides.pop(get_current_user_id, None)


def test_health() -> None:
    resp = client.get("/api/v1/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_available_strategies_includes_sma_cross() -> None:
    with auth_override():
        resp = client.get("/api/v1/strategies/available")
    assert resp.status_code == 200
    keys = {s["key"] for s in resp.json()}
    assert "sma_cross" in keys


def test_available_strategies_localizes_display_metadata() -> None:
    with auth_override():
        zh_resp = client.get(
            "/api/v1/strategies/available",
            headers={"Accept-Language": "zh-CN,zh;q=0.9"},
        )
        fallback_resp = client.get(
            "/api/v1/strategies/available",
            headers={"Accept-Language": "fr-FR"},
        )
    assert zh_resp.status_code == 200
    zh_strategies = {s["key"]: s for s in zh_resp.json()}
    assert zh_strategies["sma_cross"]["name"] == "SMA 均线交叉"
    assert zh_strategies["sma_cross"]["description"] == "快 SMA 上穿慢 SMA 时买入；反向交叉时卖出。"
    assert (
        zh_strategies["sma_cross"]["param_schema"]["properties"]["fast"]["title"]
        == "快线周期"
    )

    assert fallback_resp.status_code == 200
    fallback_strategies = {s["key"]: s for s in fallback_resp.json()}
    assert fallback_strategies["sma_cross"]["name"] == "SMA Crossover"
    assert (
        fallback_strategies["sma_cross"]["param_schema"]["properties"]["fast"]["title"]
        == "Fast window"
    )


def test_backtest_universes_localize_display_metadata() -> None:
    with auth_override():
        zh_resp = client.get(
            "/api/v1/strategies/backtest/universes",
            headers={"Accept-Language": "zh-CN"},
        )
        en_resp = client.get(
            "/api/v1/strategies/backtest/universes",
            headers={"Accept-Language": "en-US"},
        )
    assert zh_resp.status_code == 200
    zh_universes = {u["key"]: u for u in zh_resp.json()}
    assert zh_universes["sp500"]["name"] == "S&P 500"
    assert zh_universes["sp500"]["description"] == "来自公开 CSV 数据集的当前 S&P 500 成分股。"
    assert zh_universes["dow30"]["description"] == "道琼斯工业平均指数成分股。"

    assert en_resp.status_code == 200
    en_universes = {u["key"]: u for u in en_resp.json()}
    assert en_universes["sp500"]["description"] == (
        "Current S&P 500 constituents from a public CSV dataset."
    )


def test_market_bars_returns_normalized_series() -> None:
    broker = FakeMarketBroker()
    with auth_override(), broker_override(broker):
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
    with auth_override(), broker_override(broker):
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
    assert result.position_size_pct == 20.0
    assert result.buy_hold_return_pct == 20.0
    assert result.alpha_return_pct == round(result.total_return_pct - 20.0, 2)
    # Equity should never go negative in a long-only fixed-allocation sim.
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

    result = run_backtest(
        AlwaysBuy(),
        "AAPL",
        bars,
        initial_capital=100_000,
        position_size_pct=20,
    )

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

    result = run_backtest(
        AlwaysBuy(),
        "AAPL",
        bars,
        initial_capital=100_000,
        position_size_pct=20,
    )

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
