from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base_all import Base
from app.models.market_data import MarketAsset, MarketBar, MarketDataCoverage, MarketDataIngestionJob
from app.schemas.market_data import MarketDataIngestionJobCreate
from app.services import market_data_ingestion as ingestion_module
from app.services.market_data_cache import MarketDataCacheService, MarketDataMissingError
from app.services.market_data_ingestion import (
    create_ingestion_job,
    refresh_market_assets,
    run_market_data_ingestion_job,
)
from app.services.market_data_ingestion_store import reconcile_coverage
from app.services.market_data_provider import InvalidProviderSymbolError, ProviderAsset, ProviderBar
from app.services.market_data_time import as_utc


def test_market_data_ingestion_writes_bars_and_coverage(monkeypatch) -> None:
    Session = _session_factory()
    provider = FakeProvider()

    monkeypatch.setattr(ingestion_module, "SessionLocal", Session)
    monkeypatch.setattr(ingestion_module.settings, "MARKET_DATA_SYMBOLS_PER_REQUEST", 20)

    start = datetime(2026, 1, 2, 14, 30, tzinfo=timezone.utc)
    end = start + timedelta(minutes=7)
    with Session() as db:
        assert refresh_market_assets(db, provider) == {"refreshed": 2}
        job = create_ingestion_job(
            db,
            MarketDataIngestionJobCreate(
                symbols=["aapl", "msft"],
                timeframe="1Min",
                start_ts=start,
                end_ts=end,
            ),
        )

    run_market_data_ingestion_job(job.id, provider)

    with Session() as db:
        assert db.query(MarketBar).count() == 14
        coverages = {
            row.symbol: row
            for row in db.query(MarketDataCoverage).order_by(MarketDataCoverage.symbol).all()
        }
        assert set(coverages) == {"AAPL", "MSFT"}
        assert coverages["AAPL"].row_count == 7
        assert as_utc(coverages["AAPL"].first_ts) == start
        assert as_utc(coverages["AAPL"].last_ts) == end - timedelta(minutes=1)

        bars = MarketDataCacheService(db).require_bars(
            "aapl",
            timeframe="1Min",
            start=start,
            end=end,
        )
        assert [bar.timestamp for bar in bars] == sorted(bar.timestamp for bar in bars)
        assert len(bars) == 7
        assert bars[0].close == 100


def test_market_data_coverage_reconcile_corrects_incremental_overcount(monkeypatch) -> None:
    Session = _session_factory()
    provider = FakeProvider()

    monkeypatch.setattr(ingestion_module, "SessionLocal", Session)
    monkeypatch.setattr(ingestion_module.settings, "MARKET_DATA_SYMBOLS_PER_REQUEST", 20)

    start = datetime(2026, 1, 2, 14, 30, tzinfo=timezone.utc)
    end = start + timedelta(minutes=7)
    with Session() as db:
        first_job = create_ingestion_job(
            db,
            MarketDataIngestionJobCreate(
                symbols=["AAPL"],
                timeframe="1Min",
                start_ts=start,
                end_ts=end,
            ),
        )
        first_job_id = first_job.id
        second_job = create_ingestion_job(
            db,
            MarketDataIngestionJobCreate(
                symbols=["AAPL"],
                timeframe="1Min",
                start_ts=start,
                end_ts=end,
            ),
        )
        second_job_id = second_job.id

    run_market_data_ingestion_job(first_job_id, provider)
    run_market_data_ingestion_job(second_job_id, provider)

    with Session() as db:
        coverage = db.query(MarketDataCoverage).filter(MarketDataCoverage.symbol == "AAPL").one()
        assert coverage.row_count == 14
        assert db.query(MarketBar).filter(MarketBar.symbol == "AAPL").count() == 7

        result = reconcile_coverage(
            db,
            provider="alpaca",
            feed="sip",
            timeframe="1Min",
            adjustment="split",
            symbols=["AAPL"],
        )
        assert result == {"reconciled_symbols": 1, "row_count": 7}
        db.refresh(coverage)
        assert coverage.row_count == 7
        assert as_utc(coverage.first_ts) == start
        assert as_utc(coverage.last_ts) == end - timedelta(minutes=1)


def test_market_data_cache_reports_missing_data() -> None:
    Session = _session_factory()
    start = datetime(2026, 1, 2, 14, 30, tzinfo=timezone.utc)
    end = start + timedelta(minutes=7)

    with Session() as db, pytest.raises(MarketDataMissingError, match="run ingestion first"):
        MarketDataCacheService(db).require_bars(
            "AAPL",
            timeframe="1Min",
            start=start,
            end=end,
        )


def test_market_data_cache_accepts_daily_bar_timestamp_for_intraday_end() -> None:
    Session = _session_factory()
    day_start = datetime(2026, 6, 8, 4, tzinfo=timezone.utc)
    start = datetime(2025, 6, 8, 20, tzinfo=timezone.utc)
    end = datetime(2026, 6, 8, 20, tzinfo=timezone.utc)

    with Session() as db:
        db.add(
            MarketDataCoverage(
                provider="alpaca",
                feed="sip",
                timeframe="1Day",
                adjustment="split",
                symbol="AAPL",
                first_ts=datetime(2025, 6, 9, 4),
                last_ts=day_start.replace(tzinfo=None),
                row_count=2,
            )
        )
        for index, ts in enumerate(
            [
                datetime(2025, 6, 9, 4, tzinfo=timezone.utc),
                datetime(2025, 9, 2, 4, tzinfo=timezone.utc),
                datetime(2025, 12, 1, 5, tzinfo=timezone.utc),
                datetime(2026, 3, 2, 5, tzinfo=timezone.utc),
                day_start,
            ],
            start=100,
        ):
            db.add(
                MarketBar(
                    provider="alpaca",
                    feed="sip",
                    timeframe="1Day",
                    adjustment="split",
                    symbol="AAPL",
                    ts=ts.replace(tzinfo=None),
                    open=index,
                    high=index + 1,
                    low=index - 1,
                    close=index,
                    volume=1_000,
                    currency="USD",
                )
            )
        db.commit()

        bars = MarketDataCacheService(db).require_bars(
            "AAPL",
            timeframe="1Day",
            start=start,
            end=end,
        )

    assert [bar.close for bar in bars] == [100, 101, 102, 103, 104]


def test_market_data_asset_refresh_batches_large_asset_lists() -> None:
    Session = _session_factory()
    provider = BulkAssetProvider(count=5_100)

    with Session() as db:
        assert refresh_market_assets(db, provider) == {"refreshed": 5_100}
        assert db.query(MarketAsset).count() == 5_100

    provider.status = "inactive"
    with Session() as db:
        assert refresh_market_assets(db, provider) == {"refreshed": 5_100}
        assert db.query(MarketAsset).filter(MarketAsset.status == "inactive").count() == 5_100


def test_market_data_asset_refresh_dedupes_duplicate_symbols() -> None:
    Session = _session_factory()
    provider = DuplicateAssetProvider()

    with Session() as db:
        assert refresh_market_assets(db, provider) == {"refreshed": 2}
        assert db.query(MarketAsset).count() == 2
        aapl = db.get(MarketAsset, "AAPL")
        assert aapl is not None
        assert aapl.status == "inactive"


def test_market_data_ingestion_pauses_and_resumes(monkeypatch) -> None:
    Session = _session_factory()
    provider = PausingProvider(Session)

    monkeypatch.setattr(ingestion_module, "SessionLocal", Session)
    monkeypatch.setattr(ingestion_module.settings, "MARKET_DATA_SYMBOLS_PER_REQUEST", 20)

    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    end = start + timedelta(days=3)
    with Session() as db:
        job = create_ingestion_job(
            db,
            MarketDataIngestionJobCreate(
                symbols=["AAPL", "MSFT"],
                timeframe="1Day",
                start_ts=start,
                end_ts=end,
            ),
        )
        provider.job_id = job.id
        assert job.total_work_units == 3

    run_market_data_ingestion_job(job.id, provider)

    with Session() as db:
        paused = db.get(MarketDataIngestionJob, job.id)
        assert paused is not None
        assert paused.status == "paused"
        assert paused.completed_work_units == 1
        assert paused.pause_requested is True
        assert db.query(MarketBar).count() == 2
        paused.status = "queued"
        paused.pause_requested = False
        paused.ended_at = None
        db.commit()

    provider.pause_after_first_call = False
    run_market_data_ingestion_job(job.id, provider)

    with Session() as db:
        completed = db.get(MarketDataIngestionJob, job.id)
        assert completed is not None
        assert completed.status == "completed"
        assert completed.completed_work_units == 3
        assert completed.completed_symbols == 2
        assert completed.requested_rows == 6
        assert db.query(MarketBar).count() == 6

    calls_after_completion = provider.calls
    run_market_data_ingestion_job(job.id, provider)

    with Session() as db:
        completed = db.get(MarketDataIngestionJob, job.id)
        assert completed is not None
        assert completed.status == "completed"
        assert completed.requested_rows == 6
        assert provider.calls == calls_after_completion
        assert db.query(MarketBar).count() == 6


def test_market_data_ingestion_stops_after_cancel(monkeypatch) -> None:
    Session = _session_factory()
    provider = CancelingProvider(Session)

    monkeypatch.setattr(ingestion_module, "SessionLocal", Session)
    monkeypatch.setattr(ingestion_module.settings, "MARKET_DATA_SYMBOLS_PER_REQUEST", 20)

    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    end = start + timedelta(days=3)
    with Session() as db:
        job = create_ingestion_job(
            db,
            MarketDataIngestionJobCreate(
                symbols=["AAPL", "MSFT"],
                timeframe="1Day",
                start_ts=start,
                end_ts=end,
            ),
        )
        provider.job_id = job.id
        assert job.total_work_units == 3

    run_market_data_ingestion_job(job.id, provider)

    with Session() as db:
        cancelled = db.get(MarketDataIngestionJob, job.id)
        assert cancelled is not None
        assert cancelled.status == "cancelled"
        assert cancelled.completed_work_units == 1
        assert cancelled.completed_symbols == 0
        assert cancelled.ended_at is not None
        assert provider.calls == 1
        assert db.query(MarketBar).count() == 2


def test_market_data_ingestion_marks_cancelling_job_cancelled(monkeypatch) -> None:
    class CountingProvider:
        def __init__(self) -> None:
            self.calls = 0

        def get_bars(self, symbols, *, timeframe, start, end, feed, adjustment):  # noqa: ANN001
            self.calls += 1
            return []

    Session = _session_factory()
    provider = CountingProvider()

    monkeypatch.setattr(ingestion_module, "SessionLocal", Session)

    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    end = start + timedelta(days=2)
    with Session() as db:
        job = create_ingestion_job(
            db,
            MarketDataIngestionJobCreate(
                symbols=["AAPL"],
                timeframe="1Day",
                start_ts=start,
                end_ts=end,
            ),
        )
        job_id = job.id
        job.status = "cancelling"
        db.commit()

    run_market_data_ingestion_job(job_id, provider)

    with Session() as db:
        cancelled = db.get(MarketDataIngestionJob, job_id)
        assert cancelled is not None
        assert cancelled.status == "cancelled"
        assert cancelled.completed_work_units == 0
        assert cancelled.ended_at is not None
        assert provider.calls == 0


def test_market_data_ingestion_skips_invalid_provider_symbols(monkeypatch) -> None:
    Session = _session_factory()
    provider = InvalidSymbolProvider()

    monkeypatch.setattr(ingestion_module, "SessionLocal", Session)
    monkeypatch.setattr(ingestion_module.settings, "MARKET_DATA_SYMBOLS_PER_REQUEST", 20)

    start = datetime(2026, 1, 2, 14, 30, tzinfo=timezone.utc)
    end = start + timedelta(minutes=7)
    with Session() as db:
        job = create_ingestion_job(
            db,
            MarketDataIngestionJobCreate(
                symbols=["AAPL", "0029900E0", "MSFT"],
                timeframe="1Min",
                start_ts=start,
                end_ts=end,
            ),
        )

    run_market_data_ingestion_job(job.id, provider)

    with Session() as db:
        completed = db.get(MarketDataIngestionJob, job.id)
        assert completed is not None
        assert completed.status == "completed"
        assert completed.error is None
        assert completed.progress_state["skipped_symbols"] == ["0029900E0"]
        assert db.query(MarketBar).count() == 2
        assert provider.calls == [["AAPL", "0029900E0", "MSFT"], ["AAPL", "MSFT"]]


def _session_factory():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine)


class FakeProvider:
    def list_us_equity_assets(self) -> list[ProviderAsset]:
        return [
            _asset("AAPL", "active"),
            _asset("MSFT", "inactive"),
        ]

    def get_bars(self, symbols, *, timeframe, start, end, feed, adjustment):  # noqa: ANN001
        bars: list[ProviderBar] = []
        for symbol in symbols:
            bars.append(_bar(symbol, start - timedelta(hours=1), 99))
            for offset in range(7):
                bars.append(_bar(symbol, start + timedelta(minutes=offset), 100 + offset))
        return bars


class BulkAssetProvider:
    def __init__(self, count: int) -> None:
        self.count = count
        self.status = "active"

    def list_us_equity_assets(self) -> list[ProviderAsset]:
        return [_asset(f"T{index:04d}", self.status) for index in range(self.count)]


class DuplicateAssetProvider:
    def list_us_equity_assets(self) -> list[ProviderAsset]:
        return [
            _asset("AAPL", "active"),
            _asset("MSFT", "active"),
            _asset("AAPL", "inactive"),
        ]


class PausingProvider:
    def __init__(self, Session) -> None:  # noqa: ANN001
        self.Session = Session
        self.job_id: str | None = None
        self.calls = 0
        self.pause_after_first_call = True

    def get_bars(self, symbols, *, timeframe, start, end, feed, adjustment):  # noqa: ANN001
        self.calls += 1
        if self.calls == 1 and self.pause_after_first_call:
            with self.Session() as db:
                job = db.get(MarketDataIngestionJob, self.job_id)
                assert job is not None
                job.pause_requested = True
                job.status = "pausing"
                db.commit()
        return [_bar(symbol, start, 100 + self.calls) for symbol in symbols]


class CancelingProvider:
    def __init__(self, Session) -> None:  # noqa: ANN001
        self.Session = Session
        self.job_id: str | None = None
        self.calls = 0

    def get_bars(self, symbols, *, timeframe, start, end, feed, adjustment):  # noqa: ANN001
        self.calls += 1
        if self.calls == 1:
            with self.Session() as db:
                job = db.get(MarketDataIngestionJob, self.job_id)
                assert job is not None
                job.status = "cancelling"
                job.pause_requested = False
                db.commit()
        return [_bar(symbol, start, 100 + self.calls) for symbol in symbols]


class InvalidSymbolProvider:
    def __init__(self) -> None:
        self.calls: list[list[str]] = []

    def get_bars(self, symbols, *, timeframe, start, end, feed, adjustment):  # noqa: ANN001
        self.calls.append(list(symbols))
        if "0029900E0" in symbols:
            raise InvalidProviderSymbolError(
                ["0029900E0"],
                '{"message":"invalid symbol: 0029900E0"}',
            )
        return [_bar(symbol, start, 100) for symbol in symbols]


def _asset(symbol: str, status: str) -> ProviderAsset:
    return ProviderAsset(
        symbol=symbol,
        asset_id=f"{symbol}-id",
        name=symbol,
        asset_class="us_equity",
        exchange="NASDAQ",
        status=status,
        tradable=True,
        marginable=True,
        shortable=True,
        easy_to_borrow=True,
        raw={"symbol": symbol},
    )


def _bar(symbol: str, ts: datetime, close: float) -> ProviderBar:
    return ProviderBar(
        symbol=symbol,
        ts=ts,
        open=close,
        high=close + 1,
        low=close - 1,
        close=close,
        volume=1_000,
        trade_count=10,
        vwap=close,
    )
