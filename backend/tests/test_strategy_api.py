"""Strategy instance API behavior."""

from __future__ import annotations

from collections.abc import Iterator
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.deps import get_current_user_id
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.strategy import Signal as SignalModel
from app.models.strategy import StrategyInstance
from app.models.user import User
from app.strategies import registry


@pytest.fixture()
def strategy_client() -> Iterator[tuple[TestClient, sessionmaker]]:
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

    registry.load_builtin_strategies()
    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user_id] = lambda: 1
    client = TestClient(app)
    try:
        yield client, Session
    finally:
        app.dependency_overrides.pop(get_current_user_id, None)
        app.dependency_overrides.pop(get_db, None)


def test_strategy_list_hides_archived_by_default(strategy_client) -> None:
    client, Session = strategy_client
    with Session() as db:
        db.add(User(id=1, email="trader@example.com", hashed_password="x"))
        db.add_all(
            [
                StrategyInstance(
                    user_id=1,
                    name="Active SMA",
                    strategy_key="sma_cross",
                    params={},
                    symbols=["AAPL"],
                    schedule="55 10-15 * * mon-fri",
                    is_active=True,
                ),
                StrategyInstance(
                    user_id=1,
                    name="Archived SMA",
                    strategy_key="sma_cross",
                    params={},
                    symbols=["MSFT"],
                    schedule="55 10-15 * * mon-fri",
                    is_active=False,
                    archived_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
                ),
            ]
        )
        db.commit()

    default_resp = client.get("/api/v1/strategies")
    all_resp = client.get("/api/v1/strategies?include_archived=true")

    assert default_resp.status_code == 200
    assert [row["name"] for row in default_resp.json()] == ["Active SMA"]
    assert default_resp.json()[0]["next_run_at"] is not None
    assert all_resp.status_code == 200
    assert {row["name"] for row in all_resp.json()} == {"Active SMA", "Archived SMA"}


def test_strategy_archive_requires_inactive_instance(strategy_client) -> None:
    client, Session = strategy_client
    with Session() as db:
        db.add(User(id=1, email="trader@example.com", hashed_password="x"))
        active = StrategyInstance(
            user_id=1,
            name="Active SMA",
            strategy_key="sma_cross",
            params={},
            symbols=["AAPL"],
            schedule="55 10-15 * * mon-fri",
            is_active=True,
        )
        paused = StrategyInstance(
            user_id=1,
            name="Paused SMA",
            strategy_key="sma_cross",
            params={},
            symbols=["AAPL"],
            schedule="55 10-15 * * mon-fri",
            is_active=False,
        )
        db.add_all([active, paused])
        db.commit()
        active_id = active.id
        paused_id = paused.id

    active_resp = client.delete(f"/api/v1/strategies/{active_id}")
    paused_resp = client.delete(f"/api/v1/strategies/{paused_id}")
    list_resp = client.get("/api/v1/strategies")

    assert active_resp.status_code == 409
    assert paused_resp.status_code == 200
    assert paused_resp.json()["archived_at"] is not None
    assert [row["id"] for row in list_resp.json()] == [active_id]


def test_signal_endpoint_returns_owned_recent_decisions(strategy_client) -> None:
    client, Session = strategy_client
    with Session() as db:
        db.add_all(
            [
                User(id=1, email="trader@example.com", hashed_password="x"),
                User(id=2, email="other@example.com", hashed_password="x"),
            ]
        )
        owned = StrategyInstance(
            user_id=1,
            name="Owned SMA",
            strategy_key="sma_cross",
            params={},
            symbols=["AAPL"],
            schedule="55 10-15 * * mon-fri",
            is_active=True,
        )
        other = StrategyInstance(
            user_id=2,
            name="Other SMA",
            strategy_key="sma_cross",
            params={},
            symbols=["MSFT"],
            schedule="55 10-15 * * mon-fri",
            is_active=True,
        )
        db.add_all([owned, other])
        db.flush()
        owned_id = owned.id
        db.add_all(
            [
                SignalModel(
                    strategy_instance_id=owned.id,
                    symbol="AAPL",
                    side="buy",
                    qty=1,
                    meta={
                        "status": "submitted",
                        "allocation_pct": 1.0,
                        "allocation_source": "preset",
                        "order_id": 42,
                        "broker_order_id": "broker-42",
                        "bar_timestamp": "2026-01-01T15:00:00Z",
                    },
                    created_at=datetime(2026, 1, 2, tzinfo=timezone.utc),
                ),
                SignalModel(
                    strategy_instance_id=other.id,
                    symbol="MSFT",
                    side="sell",
                    qty=2,
                    meta={"status": "submitted"},
                    created_at=datetime(2026, 1, 3, tzinfo=timezone.utc),
                ),
            ]
        )
        db.commit()

    resp = client.get(f"/api/v1/strategies/signals?strategy_instance_id={owned_id}&limit=10")

    assert resp.status_code == 200
    assert len(resp.json()) == 1
    payload = resp.json()[0]
    assert payload["strategy_name"] == "Owned SMA"
    assert payload["status"] == "submitted"
    assert payload["allocation_pct"] == 1.0
    assert payload["order_id"] == 42
    assert payload["broker_order_id"] == "broker-42"
