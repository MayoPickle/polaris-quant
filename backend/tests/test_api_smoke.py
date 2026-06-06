from fastapi.testclient import TestClient

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


def test_market_bars_rejects_invalid_inputs() -> None:
    broker = FakeMarketBroker()
    with auth_override(), broker_override(broker):
        invalid_symbol = client.get("/api/v1/market/bars?symbols=AAPL,$BAD")
        invalid_lookback = client.get("/api/v1/market/bars?symbols=AAPL&lookback_days=366")

    assert invalid_symbol.status_code == 422
    assert invalid_lookback.status_code == 422
    assert broker.calls == []

