"""Batch backtest helpers."""

from collections.abc import Iterator
from datetime import datetime, timedelta, timezone
import threading

from fastapi.testclient import TestClient
from rq.timeouts import JobTimeoutException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.deps import get_current_user_id
from app.brokers.base import Bar
from app.db.session import get_db
from app.db.base import Base
from app.main import app
from app.models.backtest import BacktestJob, BacktestJobResult
from app.models.user import User
from app.services.backtest_batch_service import build_batch_summary, parse_imported_symbols
from app.strategies.backtest import BacktestResult
from app.workers.jobs import run_batch_backtest as batch_job_module


def _worker_session_factory():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine)


def _seed_batch_job(Session, job_id: str, symbols: list[str]) -> None:
    with Session() as db:
        db.add(User(id=1, email="test@example.com", hashed_password="x"))
        db.add(
            BacktestJob(
                id=job_id,
                user_id=1,
                strategy_key="sma_cross",
                params={},
                timeframe="1Day",
                lookback_days=365,
                initial_capital=100_000,
                universes=[],
                symbols=symbols,
                total_symbols=len(symbols),
                status="queued",
                report={},
            )
        )
        db.commit()


def _fake_bars() -> list[Bar]:
    return [
        Bar(
            timestamp=f"2026-01-{day:02d}T00:00:00+00:00",
            open=100 + day,
            high=101 + day,
            low=99 + day,
            close=100 + day,
            volume=1000,
        )
        for day in range(1, 8)
    ]


def _fake_backtest_result(symbol: str) -> BacktestResult:
    return BacktestResult(
        symbol=symbol,
        strategy_key="sma_cross",
        initial_capital=100_000,
        position_size_pct=20,
        position_sizing={},
        final_equity=101_000,
        total_return_pct=1,
        buy_hold_return_pct=0.5,
        alpha_return_pct=0.5,
        num_trades=1,
        win_rate_pct=100,
        max_drawdown_pct=0,
        sharpe=1,
        equity_curve=[],
        trades=[],
    )


def _patch_successful_backtest(monkeypatch) -> None:
    monkeypatch.setattr(batch_job_module.registry, "load_builtin_strategies", lambda: None)
    monkeypatch.setattr(batch_job_module.registry, "create_strategy", lambda *args: object())
    monkeypatch.setattr(
        batch_job_module,
        "run_backtest",
        lambda strategy, symbol, bars, **kwargs: _fake_backtest_result(symbol),
    )


def test_parse_imported_symbols_handles_text_and_csv() -> None:
    symbols = parse_imported_symbols(
        ["aapl", "$MSFT"],
        "symbol\nNVDA,AMD\nTSLA,Tesla Inc.\nBRK.B\n",
    )

    assert symbols == ["AAPL", "MSFT", "NVDA", "AMD", "TSLA", "BRK.B"]


def test_build_batch_summary_ranks_and_counts() -> None:
    job = BacktestJob(
        id="job-1",
        user_id=1,
        strategy_key="sma_cross",
        params={},
        timeframe="1Day",
        lookback_days=365,
        initial_capital=100_000,
        universes=["sp500"],
        symbols=["AAPL", "MSFT", "XYZ"],
        total_symbols=3,
        completed_symbols=3,
        succeeded_symbols=2,
        failed_symbols=1,
        status="completed",
        report={},
    )
    results = [
        BacktestJobResult(
            job_id="job-1",
            symbol="AAPL",
            status="completed",
            final_equity=110_000,
            total_return_pct=10,
            buy_hold_return_pct=4,
            alpha_return_pct=6,
            num_trades=4,
            win_rate_pct=50,
            max_drawdown_pct=4,
            sharpe=1.2,
            equity_curve=[],
            trades=[],
        ),
        BacktestJobResult(
            job_id="job-1",
            symbol="MSFT",
            status="completed",
            final_equity=95_000,
            total_return_pct=-5,
            buy_hold_return_pct=-8,
            alpha_return_pct=3,
            num_trades=2,
            win_rate_pct=0,
            max_drawdown_pct=12,
            sharpe=-0.4,
            equity_curve=[],
            trades=[],
        ),
        BacktestJobResult(
            job_id="job-1",
            symbol="XYZ",
            status="failed",
            error="missing data",
            equity_curve=[],
            trades=[],
        ),
    ]

    summary = build_batch_summary(job, results)

    assert summary["average_return_pct"] == 2.5
    assert summary["average_buy_hold_return_pct"] == -2
    assert summary["average_alpha_return_pct"] == 4.5
    assert summary["median_return_pct"] == 2.5
    assert summary["total_trades"] == 6
    assert summary["best_return"][0]["symbol"] == "AAPL"
    assert summary["best_alpha"][0]["symbol"] == "AAPL"
    assert summary["worst_return"][0]["symbol"] == "MSFT"
    assert summary["failures"] == [{"symbol": "XYZ", "error": "missing data"}]


def test_backtest_job_can_commit_with_user_foreign_key() -> None:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)

    with Session() as db:
        db.add(User(id=1, email="test@example.com", hashed_password="x"))
        db.add(
            BacktestJob(
                id="job-1",
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
            )
        )
        db.commit()

        assert db.get(BacktestJob, "job-1") is not None


def test_batch_worker_timeout_aborts_job_without_symbol_result(monkeypatch) -> None:
    Session = _worker_session_factory()

    class TimeoutBroker:
        def get_bars(self, *args, **kwargs):  # noqa: ANN002, ANN003, ANN201
            raise JobTimeoutException("job timed out")

    monkeypatch.setattr(batch_job_module, "SessionLocal", Session)
    monkeypatch.setattr(batch_job_module.registry, "load_builtin_strategies", lambda: None)
    monkeypatch.setattr(batch_job_module, "get_broker", lambda name: TimeoutBroker())
    monkeypatch.setattr(batch_job_module.settings, "BACKTEST_BATCH_CONCURRENCY", 2)
    monkeypatch.setattr(batch_job_module.settings, "BACKTEST_SYMBOL_THROTTLE_SECONDS", 0)

    _seed_batch_job(Session, "timeout-job", ["AAPL", "MSFT"])

    batch_job_module.run_batch_backtest_job("timeout-job")

    with Session() as db:
        job = db.get(BacktestJob, "timeout-job")
        assert job is not None
        assert job.status == "failed"
        assert job.completed_symbols == 0
        assert job.current_symbol is None
        assert "job timed out" in (job.error or "")
        assert db.query(BacktestJobResult).count() == 0


def test_batch_worker_runs_symbols_concurrently(monkeypatch) -> None:
    Session = _worker_session_factory()
    _seed_batch_job(Session, "parallel-job", ["AAPL", "MSFT", "NVDA", "IBM"])
    _patch_successful_backtest(monkeypatch)
    monkeypatch.setattr(batch_job_module, "SessionLocal", Session)
    monkeypatch.setattr(batch_job_module.settings, "BACKTEST_BATCH_CONCURRENCY", 4)
    monkeypatch.setattr(batch_job_module.settings, "BACKTEST_SYMBOL_THROTTLE_SECONDS", 0)

    lock = threading.Lock()
    overlap_seen = threading.Event()
    active = 0
    max_active = 0

    class BlockingBroker:
        def get_bars(self, *args, **kwargs):  # noqa: ANN002, ANN003, ANN201
            nonlocal active, max_active
            with lock:
                active += 1
                max_active = max(max_active, active)
                if max_active >= 2:
                    overlap_seen.set()
            overlap_seen.wait(timeout=1)
            with lock:
                active -= 1
            return _fake_bars()

    monkeypatch.setattr(batch_job_module, "get_broker", lambda name: BlockingBroker())

    batch_job_module.run_batch_backtest_job("parallel-job")

    with Session() as db:
        job = db.get(BacktestJob, "parallel-job")
        assert job is not None
        assert max_active >= 2
        assert job.status == "completed"
        assert job.completed_symbols == 4
        assert job.succeeded_symbols == 4
        assert db.query(BacktestJobResult).count() == 4


def test_batch_worker_cancel_stops_dispatching_new_symbols(monkeypatch) -> None:
    Session = _worker_session_factory()
    _seed_batch_job(Session, "cancel-job", ["AAPL", "MSFT", "NVDA", "IBM"])
    _patch_successful_backtest(monkeypatch)
    monkeypatch.setattr(batch_job_module, "SessionLocal", Session)
    monkeypatch.setattr(batch_job_module.settings, "BACKTEST_BATCH_CONCURRENCY", 2)
    monkeypatch.setattr(batch_job_module.settings, "BACKTEST_SYMBOL_THROTTLE_SECONDS", 0)

    first_batch_started = threading.Event()
    release_bars = threading.Event()
    lock = threading.Lock()
    started_symbols: list[str] = []

    class SlowBroker:
        def get_bars(self, symbol, *args, **kwargs):  # noqa: ANN002, ANN003, ANN201
            with lock:
                started_symbols.append(symbol)
                if len(started_symbols) == 2:
                    first_batch_started.set()
            release_bars.wait(timeout=2)
            return _fake_bars()

    monkeypatch.setattr(batch_job_module, "get_broker", lambda name: SlowBroker())

    worker = threading.Thread(
        target=batch_job_module.run_batch_backtest_job,
        args=("cancel-job",),
    )
    worker.start()
    assert first_batch_started.wait(timeout=2)

    with Session() as db:
        job = db.get(BacktestJob, "cancel-job")
        assert job is not None
        job.status = "cancelled"
        job.current_symbol = None
        job.ended_at = datetime.now(timezone.utc)
        db.commit()

    release_bars.set()
    worker.join(timeout=5)

    assert not worker.is_alive()
    assert set(started_symbols) == {"AAPL", "MSFT"}

    with Session() as db:
        job = db.get(BacktestJob, "cancel-job")
        assert job is not None
        assert job.status == "cancelled"
        assert job.current_symbol is None
        assert job.completed_symbols == 2
        assert job.succeeded_symbols == 2
        assert db.query(BacktestJobResult).count() == 2


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
