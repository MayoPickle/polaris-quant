"""Alpaca order request mapping."""

from __future__ import annotations

from types import SimpleNamespace

from app.brokers.alpaca.client import AlpacaClient
from app.brokers.base import OrderRequest


class CapturingTradingClient:
    def __init__(self) -> None:
        self.submitted_order = None

    def submit_order(self, order_data):  # noqa: ANN001
        self.submitted_order = order_data
        return SimpleNamespace(
            id="broker-1",
            symbol=order_data.symbol,
            side=order_data.side,
            qty=order_data.qty,
            status="accepted",
            filled_qty=0,
            filled_avg_price=None,
            extended_hours=getattr(order_data, "extended_hours", False),
            client_order_id=getattr(order_data, "client_order_id", None),
            limit_price=getattr(order_data, "limit_price", None),
            stop_price=getattr(order_data, "stop_price", None),
        )


def test_alpaca_stop_order_uses_stop_request() -> None:
    client, trading = _client_with_capturing_trading()

    client.submit_order(
        OrderRequest(
            symbol="AAPL",
            side="buy",
            qty=1,
            order_type="stop",
            stop_price=128.5,
            client_order_id="cid-stop",
        )
    )

    assert trading.submitted_order.__class__.__name__ == "StopOrderRequest"
    assert trading.submitted_order.stop_price == 128.5
    assert trading.submitted_order.client_order_id == "cid-stop"


def test_alpaca_stop_limit_order_uses_stop_limit_request() -> None:
    client, trading = _client_with_capturing_trading()

    client.submit_order(
        OrderRequest(
            symbol="AAPL",
            side="buy",
            qty=1,
            order_type="stop_limit",
            stop_price=128.5,
            limit_price=130,
            client_order_id="cid-stop-limit",
        )
    )

    assert trading.submitted_order.__class__.__name__ == "StopLimitOrderRequest"
    assert trading.submitted_order.stop_price == 128.5
    assert trading.submitted_order.limit_price == 130
    assert trading.submitted_order.client_order_id == "cid-stop-limit"


def _client_with_capturing_trading() -> tuple[AlpacaClient, CapturingTradingClient]:
    client = object.__new__(AlpacaClient)
    trading = CapturingTradingClient()
    client._trading = trading
    return client, trading
