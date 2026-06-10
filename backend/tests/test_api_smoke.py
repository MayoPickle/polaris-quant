from datetime import date, timedelta

from fastapi.testclient import TestClient

from app.brokers.base import MarketSnapshot
from app.main import app

from tests.smoke_helpers import FakeMarketBroker, auth_override, broker_override

client = TestClient(app)


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
    assert zh_strategies["sma_cross"]["param_schema"]["properties"]["fast"]["title"] == "快线周期"

    assert fallback_resp.status_code == 200
    fallback_strategies = {s["key"]: s for s in fallback_resp.json()}
    assert fallback_strategies["sma_cross"]["name"] == "SMA Crossover"
    assert fallback_strategies["sma_cross"]["param_schema"]["properties"]["fast"]["title"] == "Fast window"


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


def test_market_bars_auto_selects_minute_for_one_day_date_range() -> None:
    broker = FakeMarketBroker()
    day = date.today() - timedelta(days=1)
    with auth_override(), broker_override(broker):
        resp = client.get(
            "/api/v1/market/bars"
            f"?symbols=AAPL&start_date={day.isoformat()}&end_date={day.isoformat()}"
        )

    assert resp.status_code == 200
    payload = resp.json()
    assert payload["timeframe"] == "1Min"
    assert payload["lookback_days"] == 1
    assert payload["start_date"] == day.isoformat()
    assert payload["end_date"] == day.isoformat()
    assert broker.calls[0]["timeframe"] == "1Min"


def test_market_bars_auto_selects_hourly_for_one_week_date_range() -> None:
    broker = FakeMarketBroker()
    end = date.today() - timedelta(days=1)
    start = end - timedelta(days=6)
    with auth_override(), broker_override(broker):
        resp = client.get(
            "/api/v1/market/bars"
            f"?symbols=AAPL&start_date={start.isoformat()}&end_date={end.isoformat()}"
        )

    assert resp.status_code == 200
    payload = resp.json()
    assert payload["timeframe"] == "1Hour"
    assert payload["lookback_days"] == 7
    assert payload["start_date"] == start.isoformat()
    assert payload["end_date"] == end.isoformat()
    assert broker.calls[0]["timeframe"] == "1Hour"


def test_market_bars_auto_selects_daily_for_long_date_range() -> None:
    broker = FakeMarketBroker()
    end = date.today() - timedelta(days=1)
    start = end - timedelta(days=365 * 5)
    with auth_override(), broker_override(broker):
        resp = client.get(
            "/api/v1/market/bars"
            f"?symbols=AAPL&start_date={start.isoformat()}&end_date={end.isoformat()}"
        )

    assert resp.status_code == 200
    payload = resp.json()
    assert payload["timeframe"] == "1Day"
    assert payload["lookback_days"] == (end - start).days + 1
    assert broker.calls[0]["timeframe"] == "1Day"


def test_market_bars_rejects_invalid_inputs() -> None:
    broker = FakeMarketBroker()
    end = date.today() - timedelta(days=1)
    start = end - timedelta(days=1)
    with auth_override(), broker_override(broker):
        invalid_symbol = client.get("/api/v1/market/bars?symbols=AAPL,$BAD")
        invalid_lookback = client.get("/api/v1/market/bars?symbols=AAPL&lookback_days=366")
        invalid_date_order = client.get(
            "/api/v1/market/bars"
            f"?symbols=AAPL&start_date={end.isoformat()}&end_date={start.isoformat()}"
        )

    assert invalid_symbol.status_code == 422
    assert invalid_lookback.status_code == 422
    assert invalid_date_order.status_code == 422
    assert broker.calls == []


def test_market_snapshots_returns_normalized_latest_trade_data() -> None:
    broker = FakeMarketBroker()
    with auth_override(), broker_override(broker):
        resp = client.get("/api/v1/market/snapshots?symbols=aapl, MSFT, aapl")

    assert resp.status_code == 200
    payload = resp.json()
    assert [item["symbol"] for item in payload["snapshots"]] == ["AAPL", "MSFT"]
    assert broker.snapshot_calls == [["AAPL", "MSFT"]]

    aapl = payload["snapshots"][0]
    assert aapl["latest_trade_price"] == 102.25
    assert aapl["latest_trade_price"] != aapl["midpoint_price"]
    assert aapl["bid_price"] == 102.1
    assert aapl["ask_price"] == 102.5
    assert round(aapl["spread"], 2) == 0.4
    assert aapl["previous_close"] == 101.0


def test_market_snapshots_drops_invalid_quote_microstructure() -> None:
    class InvalidQuoteBroker(FakeMarketBroker):
        def get_market_snapshots(self, symbols):  # noqa: ANN001, ANN201
            self.snapshot_calls.append(symbols)
            return [
                MarketSnapshot(
                    symbol="AAPL",
                    latest_trade_price=300.72,
                    latest_trade_size=0,
                    bid_price=287.08,
                    ask_price=0,
                    spread=-287.08,
                    midpoint_price=143.54,
                    day_high=290,
                    day_low=310,
                    day_volume=-1,
                    previous_close=307.59,
                ),
                MarketSnapshot(
                    symbol="MSFT",
                    latest_trade_price=410.2,
                    bid_price=410.3,
                    ask_price=410.1,
                    spread=-0.2,
                    midpoint_price=410.2,
                ),
            ]

    broker = InvalidQuoteBroker()
    with auth_override(), broker_override(broker):
        resp = client.get("/api/v1/market/snapshots?symbols=AAPL,MSFT")

    assert resp.status_code == 200
    snapshots = resp.json()["snapshots"]
    assert snapshots[0]["latest_trade_price"] == 300.72
    assert snapshots[0]["bid_price"] == 287.08
    assert snapshots[0]["ask_price"] is None
    assert snapshots[0]["spread"] is None
    assert snapshots[0]["midpoint_price"] is None
    assert snapshots[0]["latest_trade_size"] is None
    assert snapshots[0]["day_high"] is None
    assert snapshots[0]["day_low"] is None
    assert snapshots[0]["day_volume"] is None
    assert snapshots[1]["bid_price"] is None
    assert snapshots[1]["ask_price"] is None
    assert snapshots[1]["spread"] is None
    assert snapshots[1]["midpoint_price"] is None


def test_market_snapshots_rejects_invalid_inputs() -> None:
    broker = FakeMarketBroker()
    too_many_symbols = ",".join(f"S{i:02d}" for i in range(21))
    with auth_override(), broker_override(broker):
        invalid_symbol = client.get("/api/v1/market/snapshots?symbols=AAPL,$BAD")
        oversized = client.get(f"/api/v1/market/snapshots?symbols={too_many_symbols}")

    assert invalid_symbol.status_code == 422
    assert oversized.status_code == 422
    assert broker.snapshot_calls == []


def test_market_snapshots_reports_broker_errors() -> None:
    class FailingSnapshotBroker(FakeMarketBroker):
        def get_market_snapshots(self, symbols):  # noqa: ANN001, ANN201
            raise RuntimeError("boom")

    with auth_override(), broker_override(FailingSnapshotBroker()):
        resp = client.get("/api/v1/market/snapshots?symbols=AAPL")

    assert resp.status_code == 502
    assert "Could not fetch market snapshots" in resp.json()["detail"]
