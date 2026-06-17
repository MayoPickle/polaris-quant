from __future__ import annotations

from types import SimpleNamespace

from app.workers import scheduler as scheduler_module


def test_daily_market_data_sync_refreshes_assets_before_enqueue(monkeypatch) -> None:
    calls: list[object] = []
    db = _FakeDb(calls)
    job = SimpleNamespace(id="daily-sync", kind="daily_sync", rq_job_id=None)

    monkeypatch.setattr(scheduler_module, "SessionLocal", lambda: db)
    monkeypatch.setattr(
        scheduler_module,
        "refresh_market_assets",
        lambda current_db: calls.append(("refresh", current_db)) or {"refreshed": 42},
    )
    monkeypatch.setattr(
        scheduler_module,
        "create_daily_sync_job",
        lambda current_db: calls.append(("create", current_db)) or job,
    )
    monkeypatch.setattr(
        scheduler_module,
        "enqueue_market_data_ingestion",
        lambda job_id, *, kind: calls.append(("enqueue", job_id, kind)) or "rq-daily-sync",
    )

    scheduler_module._enqueue_daily_market_data_sync()

    assert calls == [
        ("refresh", db),
        ("create", db),
        ("enqueue", "daily-sync", "daily_sync"),
        "commit",
        "close",
    ]
    assert job.rq_job_id == "rq-daily-sync"


def test_daily_market_data_sync_continues_when_asset_refresh_fails(monkeypatch) -> None:
    calls: list[object] = []
    db = _FakeDb(calls)
    job = SimpleNamespace(id="daily-sync", kind="daily_sync", rq_job_id=None)

    def fail_refresh(current_db) -> None:  # noqa: ANN001
        calls.append(("refresh", current_db))
        raise RuntimeError("assets unavailable")

    monkeypatch.setattr(scheduler_module, "SessionLocal", lambda: db)
    monkeypatch.setattr(scheduler_module, "refresh_market_assets", fail_refresh)
    monkeypatch.setattr(
        scheduler_module,
        "create_daily_sync_job",
        lambda current_db: calls.append(("create", current_db)) or job,
    )
    monkeypatch.setattr(
        scheduler_module,
        "enqueue_market_data_ingestion",
        lambda job_id, *, kind: calls.append(("enqueue", job_id, kind)) or "rq-daily-sync",
    )

    scheduler_module._enqueue_daily_market_data_sync()

    assert calls == [
        ("refresh", db),
        ("create", db),
        ("enqueue", "daily-sync", "daily_sync"),
        "commit",
        "close",
    ]
    assert job.rq_job_id == "rq-daily-sync"


class _FakeDb:
    def __init__(self, calls: list[object]) -> None:
        self._calls = calls

    def commit(self) -> None:
        self._calls.append("commit")

    def close(self) -> None:
        self._calls.append("close")
