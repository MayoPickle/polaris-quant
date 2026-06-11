"""Paper/live broker environment isolation."""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.deps import get_broker_client, get_current_user_id
from app.brokers.base import Account, Bar, MarketSnapshot, OrderRequest, OrderResult, Position, Quote
from app.core.config import Settings, settings
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.order import Order
from app.models.user import User


@pytest.fixture()
def isolated_client() -> Iterator[tuple[TestClient, sessionmaker]]:
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
            broker_order_id=f"broker-{len(self.submitted)}",
            symbol=request.symbol,
            side=request.side,
            qty=request.qty,
            status="accepted",
            raw={},
        )

    def get_order(self, broker_order_id: str) -> OrderResult:
        raise NotImplementedError

    def cancel_order(self, broker_order_id: str) -> None:
        raise NotImplementedError


def test_health_uses_request_broker_environment(
    isolated_client,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client, _ = isolated_client
    monkeypatch.setattr(settings, "ALPACA_ENV", "paper")

    default_resp = client.get("/api/v1/health")
    live_resp = client.get("/api/v1/health", headers={"X-Polaris-Broker-Env": "live"})
    invalid_resp = client.get("/api/v1/health", headers={"X-Polaris-Broker-Env": "sandbox"})

    assert default_resp.status_code == 200
    assert default_resp.json()["broker_env"] == "paper"
    assert live_resp.status_code == 200
    assert live_resp.json()["broker_env"] == "live"
    assert invalid_resp.status_code == 422


def test_legacy_alpaca_credentials_only_fallback_to_configured_environment() -> None:
    paper_settings = Settings(
        ALPACA_ENV="paper",
        ALPACA_API_KEY="legacy-paper-key",
        ALPACA_API_SECRET="legacy-paper-secret",
    )
    live_settings = Settings(
        ALPACA_ENV="live",
        ALPACA_API_KEY="legacy-live-key",
        ALPACA_API_SECRET="legacy-live-secret",
    )

    assert paper_settings.alpaca_api_key_for_env(paper=True) == "legacy-paper-key"
    assert paper_settings.alpaca_api_secret_for_env(paper=True) == "legacy-paper-secret"
    assert paper_settings.alpaca_api_key_for_env(paper=False) == ""
    assert paper_settings.alpaca_api_secret_for_env(paper=False) == ""
    assert live_settings.alpaca_api_key_for_env(paper=False) == "legacy-live-key"
    assert live_settings.alpaca_api_secret_for_env(paper=False) == "legacy-live-secret"
    assert live_settings.alpaca_api_key_for_env(paper=True) == ""
    assert live_settings.alpaca_api_secret_for_env(paper=True) == ""


def test_orders_are_created_and_listed_by_broker_environment(
    isolated_client,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client, Session = isolated_client
    monkeypatch.setattr(settings, "TRADING_ENABLED", True)
    monkeypatch.setattr(settings, "MAX_ORDER_SIZE_USD", 20_000.0)
    monkeypatch.setattr(settings, "MAX_POSITION_SIZE_USD", 20_000.0)
    with Session() as db:
        db.add(User(id=1, email="trader@example.com", hashed_password="x"))
        db.add(
            Order(
                user_id=1,
                broker_env="paper",
                broker_order_id="paper-1",
                symbol="AAPL",
                side="buy",
                order_type="market",
                qty=1,
                status="accepted",
                filled_qty=0,
                raw={},
            )
        )
        db.commit()

    broker = RecordingBroker()
    app.dependency_overrides[get_broker_client] = lambda: broker
    live_headers = {"X-Polaris-Broker-Env": "live"}

    create_resp = client.post(
        "/api/v1/orders",
        json={"symbol": "MSFT", "side": "buy", "qty": 2, "order_type": "market"},
        headers=live_headers,
    )
    live_list = client.get("/api/v1/orders", headers=live_headers)
    paper_list = client.get("/api/v1/orders")

    assert create_resp.status_code == 201
    assert create_resp.json()["broker_env"] == "live"
    assert [row["symbol"] for row in live_list.json()] == ["MSFT"]
    assert [row["symbol"] for row in paper_list.json()] == ["AAPL"]
    with Session() as db:
        assert db.query(Order).filter(Order.broker_env == "live").one().symbol == "MSFT"


def test_strategy_instances_are_isolated_by_broker_environment(isolated_client) -> None:
    client, Session = isolated_client
    with Session() as db:
        db.add(User(id=1, email="trader@example.com", hashed_password="x"))
        db.commit()

    live_headers = {"X-Polaris-Broker-Env": "live"}
    payload = {
        "name": "Live SMA",
        "strategy_key": "sma_cross",
        "params": {},
        "symbols": ["AAPL"],
        "schedule": "55 10-15 * * mon-fri",
        "is_active": True,
    }

    rejected = client.post("/api/v1/strategies", json=payload, headers=live_headers)
    created = client.post(
        "/api/v1/strategies",
        json={**payload, "live_confirmed": True},
        headers=live_headers,
    )
    live_list = client.get("/api/v1/strategies", headers=live_headers)
    paper_list = client.get("/api/v1/strategies")

    assert rejected.status_code == 400
    assert created.status_code == 201
    assert created.json()["broker_env"] == "live"
    assert [row["name"] for row in live_list.json()] == ["Live SMA"]
    assert paper_list.json() == []
