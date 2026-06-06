from datetime import datetime, timezone
import threading

from rq.timeouts import JobTimeoutException

from app.models.backtest import BacktestJob, BacktestJobResult
from app.workers.jobs import run_batch_backtest as batch_job_module

from tests.batch_backtest_helpers import (
    fake_bars,
    patch_successful_backtest,
    seed_batch_job,
    worker_session_factory,
)


def test_batch_worker_timeout_aborts_job_without_symbol_result(monkeypatch) -> None:
    Session = worker_session_factory()

    monkeypatch.setattr(batch_job_module, "SessionLocal", Session)
    monkeypatch.setattr(batch_job_module.registry, "load_builtin_strategies", lambda: None)
    monkeypatch.setattr(
        batch_job_module,
        "get_cached_bars",
        lambda *args, **kwargs: (_ for _ in ()).throw(JobTimeoutException("job timed out")),
    )
    monkeypatch.setattr(batch_job_module.settings, "BACKTEST_BATCH_CONCURRENCY", 2)
    monkeypatch.setattr(batch_job_module.settings, "BACKTEST_SYMBOL_THROTTLE_SECONDS", 0)

    seed_batch_job(Session, "timeout-job", ["AAPL", "MSFT"])

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
    Session = worker_session_factory()
    seed_batch_job(Session, "parallel-job", ["AAPL", "MSFT", "NVDA", "IBM"])
    patch_successful_backtest(monkeypatch)
    monkeypatch.setattr(batch_job_module, "SessionLocal", Session)
    monkeypatch.setattr(batch_job_module.settings, "BACKTEST_BATCH_CONCURRENCY", 4)
    monkeypatch.setattr(batch_job_module.settings, "BACKTEST_SYMBOL_THROTTLE_SECONDS", 0)

    lock = threading.Lock()
    overlap_seen = threading.Event()
    active = 0
    max_active = 0

    def blocking_bars(*args, **kwargs):  # noqa: ANN002, ANN003, ANN201
        nonlocal active, max_active
        with lock:
            active += 1
            max_active = max(max_active, active)
            if max_active >= 2:
                overlap_seen.set()
        overlap_seen.wait(timeout=1)
        with lock:
            active -= 1
        return fake_bars()

    monkeypatch.setattr(batch_job_module, "get_cached_bars", blocking_bars)

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
    Session = worker_session_factory()
    seed_batch_job(Session, "cancel-job", ["AAPL", "MSFT", "NVDA", "IBM"])
    patch_successful_backtest(monkeypatch)
    monkeypatch.setattr(batch_job_module, "SessionLocal", Session)
    monkeypatch.setattr(batch_job_module.settings, "BACKTEST_BATCH_CONCURRENCY", 2)
    monkeypatch.setattr(batch_job_module.settings, "BACKTEST_SYMBOL_THROTTLE_SECONDS", 0)

    first_batch_started = threading.Event()
    release_bars = threading.Event()
    lock = threading.Lock()
    started_symbols: list[str] = []

    def slow_bars(symbol, *args, **kwargs):  # noqa: ANN002, ANN003, ANN201
        with lock:
            started_symbols.append(symbol)
            if len(started_symbols) == 2:
                first_batch_started.set()
        release_bars.wait(timeout=2)
        return fake_bars()

    monkeypatch.setattr(batch_job_module, "get_cached_bars", slow_bars)

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
