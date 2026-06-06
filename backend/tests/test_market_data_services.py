from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base_all import Base
from app.models.market_data import MarketBar, MarketDataCoverage, MarketDataIngestionJob
from app.schemas.market_data import MarketDataIngestionJobCreate
from app.services import market_data_ingestion as ingestion_module
from app.services.market_data_cache import MarketDataCacheService, MarketDataMissingError
from app.services.market_data_ingestion import (
    create_ingestion_job,
    refresh_market_assets,
    run_market_data_ingestion_job,
)
from app.services.market_data_provider import ProviderAsset, ProviderBar
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
