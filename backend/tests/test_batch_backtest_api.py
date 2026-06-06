from collections.abc import Iterator
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.deps import get_current_user_id
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.backtest import BacktestJob
from app.models.user import User


def test_latest_batch_backtest_returns_current_users_newest_job() -> None:
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
        empty_resp = client.get("/api/v1/strategies/backtest/batch/latest")
        assert empty_resp.status_code == 200
        assert empty_resp.json() is None

        now = datetime.now(timezone.utc)
        with Session() as db:
            db.add_all(
                [
                    User(id=1, email="one@example.com", hashed_password="x"),
                    User(id=2, email="two@example.com", hashed_password="x"),
                    BacktestJob(
                        id="older-user-1",
                        user_id=1,
                        strategy_key="sma_cross",
                        params={},
                        timeframe="1Day",
                        lookback_days=365,
                        initial_capital=100_000,
                        universes=[],
                        symbols=["AAPL"],
                        total_symbols=1,
                        status="queued",
                        report={},
                        created_at=now - timedelta(minutes=10),
                    ),
                    BacktestJob(
                        id="newer-user-1",
                        user_id=1,
                        strategy_key="sma_cross",
                        params={},
                        timeframe="1Day",
                        lookback_days=365,
                        initial_capital=100_000,
                        universes=[],
                        symbols=["MSFT", "NVDA"],
                        total_symbols=2,
                        completed_symbols=1,
                        status="running",
                        current_symbol="NVDA",
                        report={},
                        created_at=now,
                    ),
                    BacktestJob(
                        id="newest-other-user",
                        user_id=2,
                        strategy_key="sma_cross",
                        params={},
                        timeframe="1Day",
                        lookback_days=365,
                        initial_capital=100_000,
                        universes=[],
                        symbols=["TSLA"],
                        total_symbols=1,
                        status="running",
                        report={},
                        created_at=now + timedelta(minutes=10),
                    ),
                ]
            )
            db.commit()

        resp = client.get("/api/v1/strategies/backtest/batch/latest")
        assert resp.status_code == 200
        payload = resp.json()
        assert payload["id"] == "newer-user-1"
        assert payload["status"] == "running"
        assert payload["completed_symbols"] == 1
        assert payload["current_symbol"] == "NVDA"
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user_id, None)

