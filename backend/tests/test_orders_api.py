"""Order history API behavior."""

from __future__ import annotations

from collections.abc import Iterator
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.deps import get_broker_client, get_current_user_id
from app.brokers.base import Account, Bar, MarketSnapshot, OrderRequest, OrderResult, Position, Quote
from app.core.config import settings
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.order import Order
from app.models.strategy import StrategyInstance
from app.models.user import User


@pytest.fixture()
def orders_client() -> Iterator[tuple[TestClient, sessionmaker]]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)

    def override_db() -> Iterator:
        db = Session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user_id] = lambda: 1
    client = TestClient(app)
    try:
        yield client, Session
    finally:
        app.dependency_overrides.pop(get_broker_client, None)
        app.dependency_overrides.pop(get_current_user_id, None)
        app.dependency_overrides.pop(get_db, None)


class RecordingBroker:
    def __init__(self) -> None:
        self.submitted: list[OrderRequest] = []
        self.cancelled: list[str] = []
        self.cancel_error: Exception | None = None
        self.next_status = "accepted"

    def is_market_open(self) -> bool:
        return True

    def get_quote(self, symbol: str) -> Quote:
        return Quote(symbol=symbol, bid_price=100, ask_price=101, last_price=100.5)

    def get_bars(self, symbol: str, *, timeframe="1Day", start=None, end=None) -> list[Bar]:
        return []

    def get_market_snapshots(self, symbols: list[str]) -> list[MarketSnapshot]:
        return []

    def get_account(self) -> Account:
        return Account(cash=100_000, equity=100_000, buying_power=100_000)

    def get_positions(self) -> list[Position]:
        return []

    def submit_order(self, request: OrderRequest) -> OrderResult:
        self.submitted.append(request)
        return OrderResult(
            broker_order_id=f"manual-{len(self.submitted)}",
            symbol=request.symbol,
            side=request.side,
            qty=request.qty,
            status=self.next_status,
            raw={"extended_hours": request.extended_hours},
        )

    def get_order(self, broker_order_id: str) -> OrderResult:
        raise NotImplementedError

    def cancel_order(self, broker_order_id: str) -> None:
        if self.cancel_error is not None:
            raise self.cancel_error
        self.cancelled.append(broker_order_id)


def test_list_orders_includes_history_source_fields(orders_client) -> None:
    client, Session = orders_client
    with Session() as db:
        db.add(User(id=1, email="trader@example.com", hashed_password="x"))
        db.flush()
        strategy = StrategyInstance(
            user_id=1,
            name="Auto SMA",
            strategy_key="sma_cross",
            params={},
            symbols=["MSFT"],
            schedule="55 10-15 * * mon-fri",
            is_active=True,
        )
        db.add(strategy)
        db.flush()
        strategy_id = strategy.id
        db.add_all(
            [
                Order(
                    user_id=1,
                    broker_order_id="manual-1",
                    created_at=datetime(2026, 1, 1, 14, 30, tzinfo=timezone.utc),
                    symbol="AAPL",
                    side="buy",
                    order_type="limit",
                    qty=2,
                    limit_price=125.5,
                    status="accepted",
                    filled_qty=0,
                    raw={"extended_hours": True},
                ),
                Order(
                    user_id=1,
                    strategy_instance_id=strategy_id,
                    broker_order_id="auto-1",
                    created_at=datetime(2026, 1, 2, 15, 45, tzinfo=timezone.utc),
                    symbol="MSFT",
                    side="sell",
                    order_type="market",
                    qty=1,
                    status="filled",
                    filled_qty=1,
                    filled_avg_price=300.25,
                    raw={},
                ),
            ]
        )
        db.commit()

    resp = client.get("/api/v1/orders")

    assert resp.status_code == 200
    payload = resp.json()
    assert [order["broker_order_id"] for order in payload] == ["auto-1", "manual-1"]
    assert payload[0]["source"] == "automated"
    assert payload[0]["strategy_instance_id"] == strategy_id
    assert payload[0]["created_at"].startswith("2026-01-02T15:45:00")
    assert payload[0]["limit_price"] is None
    assert payload[0]["extended_hours"] is False
    assert payload[1]["source"] == "manual"
    assert payload[1]["strategy_instance_id"] is None
    assert payload[1]["created_at"].startswith("2026-01-01T14:30:00")
    assert payload[1]["limit_price"] == 125.5
    assert payload[1]["extended_hours"] is True


def test_create_order_passes_extended_hours_to_broker(
    orders_client,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client, Session = orders_client
    with Session() as db:
        db.add(User(id=1, email="trader@example.com", hashed_password="x"))
        db.commit()

    monkeypatch.setattr(settings, "TRADING_ENABLED", True)
    monkeypatch.setattr(settings, "MAX_ORDER_SIZE_USD", 20_000.0)
    monkeypatch.setattr(settings, "MAX_POSITION_SIZE_USD", 20_000.0)
    broker = RecordingBroker()
    app.dependency_overrides[get_broker_client] = lambda: broker

    resp = client.post(
        "/api/v1/orders",
        json={
            "symbol": "AAPL",
            "side": "buy",
            "qty": 2,
            "order_type": "limit",
            "limit_price": 125.5,
            "extended_hours": True,
        },
    )

    assert resp.status_code == 201
    assert len(broker.submitted) == 1
    assert broker.submitted[0].extended_hours is True
    assert broker.submitted[0].limit_price == 125.5
    assert resp.json()["extended_hours"] is True


def test_create_order_normalizes_broker_pending_new_status(
    orders_client,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client, Session = orders_client
    with Session() as db:
        db.add(User(id=1, email="trader@example.com", hashed_password="x"))
        db.commit()

    monkeypatch.setattr(settings, "TRADING_ENABLED", True)
    monkeypatch.setattr(settings, "MAX_ORDER_SIZE_USD", 20_000.0)
    monkeypatch.setattr(settings, "MAX_POSITION_SIZE_USD", 20_000.0)
    broker = RecordingBroker()
    broker.next_status = "pending_new"
    app.dependency_overrides[get_broker_client] = lambda: broker

    resp = client.post(
        "/api/v1/orders",
        json={"symbol": "AAPL", "side": "buy", "qty": 2, "order_type": "market"},
    )

    assert resp.status_code == 201
    assert resp.json()["status"] == "new"
    with Session() as db:
        order = db.query(Order).one()
        assert order.status == "new"
        assert order.raw["broker_status"] == "pending_new"


def test_extended_hours_market_order_is_rejected(orders_client) -> None:
    client, Session = orders_client
    with Session() as db:
        db.add(User(id=1, email="trader@example.com", hashed_password="x"))
        db.commit()

    resp = client.post(
        "/api/v1/orders",
        json={
            "symbol": "AAPL",
            "side": "buy",
            "qty": 1,
            "order_type": "market",
            "extended_hours": True,
        },
    )

    assert resp.status_code == 422
    assert "Extended-hours orders must be limit orders" in resp.text


def test_cancel_order_calls_broker_and_updates_local_status(orders_client) -> None:
    client, Session = orders_client
    with Session() as db:
        db.add(User(id=1, email="trader@example.com", hashed_password="x"))
        db.flush()
        order = Order(
            user_id=1,
            broker_order_id="broker-123",
            symbol="AAPL",
            side="buy",
            order_type="limit",
            qty=2,
            limit_price=125.5,
            status="accepted",
            filled_qty=0,
            raw={"extended_hours": True},
        )
        db.add(order)
        db.commit()
        order_id = order.id

    broker = RecordingBroker()
    app.dependency_overrides[get_broker_client] = lambda: broker

    resp = client.post(f"/api/v1/orders/{order_id}/cancel")

    assert resp.status_code == 200
    assert broker.cancelled == ["broker-123"]
    payload = resp.json()
    assert payload["status"] == "canceled"
    assert payload["extended_hours"] is True
    with Session() as db:
        cancelled = db.get(Order, order_id)
        assert cancelled is not None
        assert cancelled.status == "canceled"
        assert cancelled.raw["cancel_previous_status"] == "accepted"
        assert cancelled.raw["cancel_requested_at"]


def test_cancel_filled_order_is_rejected_without_broker_call(orders_client) -> None:
    client, Session = orders_client
    with Session() as db:
        db.add(User(id=1, email="trader@example.com", hashed_password="x"))
        db.flush()
        order = Order(
            user_id=1,
            broker_order_id="broker-456",
            symbol="AAPL",
            side="buy",
            order_type="market",
            qty=1,
            status="filled",
            filled_qty=1,
            filled_avg_price=125.5,
            raw={},
        )
        db.add(order)
        db.commit()
        order_id = order.id

    broker = RecordingBroker()
    app.dependency_overrides[get_broker_client] = lambda: broker

    resp = client.post(f"/api/v1/orders/{order_id}/cancel")

    assert resp.status_code == 409
    assert "cannot be canceled" in resp.text
    assert broker.cancelled == []


def test_cancel_order_reports_broker_failure(orders_client) -> None:
    client, Session = orders_client
    with Session() as db:
        db.add(User(id=1, email="trader@example.com", hashed_password="x"))
        db.flush()
        order = Order(
            user_id=1,
            broker_order_id="broker-789",
            symbol="AAPL",
            side="buy",
            order_type="limit",
            qty=1,
            limit_price=125.5,
            status="accepted",
            filled_qty=0,
            raw={},
        )
        db.add(order)
        db.commit()
        order_id = order.id

    broker = RecordingBroker()
    broker.cancel_error = RuntimeError("already filled")
    app.dependency_overrides[get_broker_client] = lambda: broker

    resp = client.post(f"/api/v1/orders/{order_id}/cancel")

    assert resp.status_code == 502
    assert "already filled" in resp.text
