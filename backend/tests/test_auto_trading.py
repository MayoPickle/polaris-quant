"""Automated strategy trading behavior."""

from __future__ import annotations

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.v1.endpoints.strategies import _validate_strategy_payload
from app.brokers.base import Account, Bar, OrderRequest, OrderResult, Position, Quote
from app.core.config import settings
from app.db.base import Base
from app.models.order import Order
from app.models.strategy import Signal as SignalModel
from app.models.strategy import StrategyInstance
from app.models.user import User
from app.services.position_sizing_service import decide_position_allocation
from app.strategies import registry
from app.strategies.base import Signal
from app.workers.jobs.run_strategy import _qty_for_signal, run_strategy_instance


class FakeBroker:
    def __init__(self) -> None:
        self.submitted: list[OrderRequest] = []
        self.positions: list[Position] = []
        self.account = Account(cash=100_000, equity=100_000, buying_power=100_000)
        self.bars = [
            Bar(timestamp="2026-01-01T10:00:00Z", open=10, high=10, low=10, close=10, volume=1),
            Bar(timestamp="2026-01-01T11:00:00Z", open=10, high=10, low=10, close=10, volume=1),
            Bar(timestamp="2026-01-01T12:00:00Z", open=10, high=10, low=10, close=10, volume=1),
            Bar(timestamp="2026-01-01T13:00:00Z", open=20, high=20, low=20, close=20, volume=1),
        ]

    def is_market_open(self) -> bool:
        return True

    def get_quote(self, symbol: str) -> Quote:
        return Quote(symbol=symbol, bid_price=20, ask_price=20, last_price=20)

    def get_bars(self, symbol: str, *, timeframe="1Hour", start=None, end=None):
        return self.bars

    def get_account(self) -> Account:
        return self.account

    def get_positions(self) -> list[Position]:
        return self.positions

    def submit_order(self, request: OrderRequest) -> OrderResult:
        self.submitted.append(request)
        return OrderResult(
            broker_order_id=f"order-{len(self.submitted)}",
            symbol=request.symbol,
            side=request.side,
            qty=request.qty,
            status="accepted",
        )

    def get_order(self, broker_order_id: str) -> OrderResult:
        raise NotImplementedError

    def cancel_order(self, broker_order_id: str) -> None:
        raise NotImplementedError


@pytest.fixture()
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    with Session() as db:
        db.add(User(id=1, email="test@example.com", hashed_password="x"))
        db.commit()
        yield db


def test_live_activation_requires_confirmation() -> None:
    registry.load_builtin_strategies()

    with pytest.raises(HTTPException) as exc:
        _validate_strategy_payload(
            "sma_cross",
            symbols=["AAPL"],
            schedule="55 10-15 * * mon-fri",
            is_active=True,
            live_confirmed=False,
            broker_env="live",
        )

    assert exc.value.status_code == 400


def test_position_sizing_uses_preset_without_openai_key(monkeypatch, db_session) -> None:
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "")
    monkeypatch.setattr(settings, "DEFAULT_POSITION_ALLOCATION_PCT", 1.0)
    instance = StrategyInstance(
        user_id=1,
        name="Auto",
        strategy_key="sma_cross",
        params={},
        symbols=["AAPL"],
        schedule="55 10-15 * * mon-fri",
        is_active=True,
    )

    decision = decide_position_allocation(
        instance=instance,
        signal=Signal("AAPL", "buy"),
        latest_bar=Bar("ts", 10, 10, 10, 10, 1),
        account=Account(cash=1000, equity=1000, buying_power=1000),
        positions=[],
    )

    assert decision.allocation_pct == 1.0
    assert decision.source == "preset"


def test_strategy_run_places_one_order_and_skips_duplicate(monkeypatch, db_session) -> None:
    registry.load_builtin_strategies()
    monkeypatch.setattr(settings, "TRADING_ENABLED", True)
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "")
    monkeypatch.setattr(settings, "DEFAULT_POSITION_ALLOCATION_PCT", 1.0)
    monkeypatch.setattr(settings, "MAX_ORDER_SIZE_USD", 2_000.0)
    monkeypatch.setattr(settings, "MAX_POSITION_SIZE_USD", 5_000.0)

    instance = StrategyInstance(
        user_id=1,
        name="Auto SMA",
        strategy_key="sma_cross",
        params={"fast": 2, "slow": 3, "qty": 1},
        symbols=["AAPL"],
        schedule="55 10-15 * * mon-fri",
        is_active=True,
    )
    db_session.add(instance)
    db_session.commit()
    db_session.refresh(instance)
    broker = FakeBroker()

    run_strategy_instance(db_session, instance.id, broker=broker)
    run_strategy_instance(db_session, instance.id, broker=broker)

    assert len(broker.submitted) == 1
    assert db_session.query(Order).count() == 1
    submitted_signal = (
        db_session.query(SignalModel)
        .filter(SignalModel.strategy_instance_id == instance.id)
        .order_by(SignalModel.id.asc())
        .first()
    )
    assert submitted_signal is not None
    assert submitted_signal.meta["status"] == "submitted"
    assert submitted_signal.meta["order_id"] == 1
    assert submitted_signal.meta["broker_order_id"] == "order-1"


def test_worker_skips_strategy_from_other_broker_environment(monkeypatch, db_session) -> None:
    registry.load_builtin_strategies()
    monkeypatch.setattr(settings, "WORKER_BROKER_ENV", "paper")

    instance = StrategyInstance(
        user_id=1,
        broker_env="live",
        name="Live SMA",
        strategy_key="sma_cross",
        params={"fast": 2, "slow": 3, "qty": 1},
        symbols=["AAPL"],
        schedule="55 10-15 * * mon-fri",
        is_active=True,
    )
    db_session.add(instance)
    db_session.commit()
    db_session.refresh(instance)
    broker = FakeBroker()

    run_strategy_instance(db_session, instance.id, broker=broker)

    assert broker.submitted == []
    assert db_session.query(Order).count() == 0
    assert db_session.query(SignalModel).count() == 0
    assert instance.last_run_at is None


def test_buy_signal_can_be_blocked_by_risk_limit(monkeypatch, db_session) -> None:
    registry.load_builtin_strategies()
    monkeypatch.setattr(settings, "TRADING_ENABLED", True)
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "")
    monkeypatch.setattr(settings, "DEFAULT_POSITION_ALLOCATION_PCT", 1.0)
    monkeypatch.setattr(settings, "MAX_ORDER_SIZE_USD", 500.0)

    instance = StrategyInstance(
        user_id=1,
        name="Auto SMA",
        strategy_key="sma_cross",
        params={"fast": 2, "slow": 3, "qty": 1},
        symbols=["AAPL"],
        schedule="55 10-15 * * mon-fri",
        is_active=True,
    )
    db_session.add(instance)
    db_session.commit()
    db_session.refresh(instance)
    broker = FakeBroker()

    run_strategy_instance(db_session, instance.id, broker=broker)

    assert broker.submitted == []
    assert db_session.query(Order).count() == 0
    rejected_signal = db_session.query(SignalModel).one()
    assert rejected_signal.meta["status"] == "rejected"
    assert "MAX_ORDER_SIZE_USD" in rejected_signal.meta["reason"]


def test_strategy_run_records_no_signal_decision(monkeypatch, db_session) -> None:
    registry.load_builtin_strategies()
    monkeypatch.setattr(settings, "TRADING_ENABLED", True)
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "")

    instance = StrategyInstance(
        user_id=1,
        name="Auto SMA",
        strategy_key="sma_cross",
        params={"fast": 2, "slow": 3, "qty": 1},
        symbols=["AAPL"],
        schedule="55 10-15 * * mon-fri",
        is_active=True,
    )
    db_session.add(instance)
    db_session.commit()
    db_session.refresh(instance)
    broker = FakeBroker()
    broker.bars = [
        Bar(timestamp="2026-01-01T10:00:00Z", open=10, high=10, low=10, close=10, volume=1),
        Bar(timestamp="2026-01-01T11:00:00Z", open=10, high=10, low=10, close=10, volume=1),
        Bar(timestamp="2026-01-01T12:00:00Z", open=10, high=10, low=10, close=10, volume=1),
        Bar(timestamp="2026-01-01T13:00:00Z", open=10, high=10, low=10, close=10, volume=1),
    ]

    run_strategy_instance(db_session, instance.id, broker=broker)

    assert broker.submitted == []
    audit = db_session.query(SignalModel).one()
    assert audit.side == "hold"
    assert audit.meta["status"] == "no_signal"


def test_sell_qty_never_exceeds_existing_long_position() -> None:
    qty = _qty_for_signal(
        Signal("AAPL", "sell"),
        Bar("ts", 20, 20, 20, 20, 1),
        account_equity=100_000,
        positions=[
            Position(
                symbol="AAPL",
                qty=3,
                avg_entry_price=10,
                market_value=60,
                unrealized_pl=30,
            )
        ],
        allocation_pct=10,
    )

    assert qty == 3
