from __future__ import annotations

from app.workers import queue


def test_market_data_queue_routes_long_jobs_to_backfill_queue(monkeypatch) -> None:
    monkeypatch.setattr(queue.settings, "MARKET_DATA_QUEUE_NAME", "market_data")
    monkeypatch.setattr(queue.settings, "MARKET_DATA_BACKFILL_QUEUE_NAME", "market_data_backfill")
    monkeypatch.setattr(queue.settings, "MARKET_DATA_JOB_TIMEOUT_SECONDS", 86_400)
    monkeypatch.setattr(queue.settings, "MARKET_DATA_BACKFILL_JOB_TIMEOUT_SECONDS", 2_592_000)

    assert queue.market_data_queue_name_for_kind("daily_sync") == "market_data"
    assert queue.market_data_job_timeout_for_kind("daily_sync") == 86_400

    assert queue.market_data_queue_name_for_kind("backfill") == "market_data_backfill"
    assert queue.market_data_job_timeout_for_kind("backfill") == 2_592_000

    assert queue.market_data_queue_name_for_kind("repair") == "market_data_backfill"
    assert queue.market_data_job_timeout_for_kind("repair") == 2_592_000
