from __future__ import annotations

from collections.abc import Iterator
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.deps import get_current_user_id
from app.api.v1.endpoints import market_data as market_data_endpoint
from app.db.base_all import Base
from app.db.session import get_db
from app.main import app
from app.models.market_data import MarketAsset, MarketBar, MarketDataCoverage, MarketDataIngestionJob


def test_market_data_ingestion_job_api(monkeypatch) -> None:
    Session = _session_factory()
    _install_overrides(Session)
    enqueued: list[tuple[str, str | None]] = []

    def fake_enqueue(job_id: str, *, kind: str | None = None) -> str:
        enqueued.append((job_id, kind))
        return f"rq-{job_id}"

    monkeypatch.setattr(
        market_data_endpoint,
        "enqueue_market_data_ingestion",
        fake_enqueue,
    )
    client = TestClient(app)

    try:
        with Session() as db:
            db.add(_asset("AAPL"))
            db.commit()

        resp = client.post(
            "/api/v1/market-data/ingestion-jobs",
            json={
                "kind": "backfill",
                "symbols": ["aapl"],
                "timeframe": "1Min",
                "start_ts": "2026-01-02T14:30:00Z",
                "end_ts": "2026-01-02T14:35:00Z",
            },
        )
        assert resp.status_code == 201
        payload = resp.json()
        assert payload["symbols"] == ["AAPL"]
        assert payload["status"] == "queued"
        assert payload["rq_job_id"].startswith("rq-")
        assert enqueued == [(payload["id"], "backfill")]

        latest = client.get("/api/v1/market-data/ingestion-jobs/latest")
        assert latest.status_code == 200
        assert latest.json()["id"] == payload["id"]

        listed = client.get("/api/v1/market-data/ingestion-jobs")
        assert listed.status_code == 200
        assert listed.json()[0]["id"] == payload["id"]

        detail = client.get(f"/api/v1/market-data/ingestion-jobs/{payload['id']}")
        assert detail.status_code == 200
        assert detail.json()["total_work_units"] == 1
    finally:
        _clear_overrides()


def test_market_data_pause_resume_api(monkeypatch) -> None:
    Session = _session_factory()
    _install_overrides(Session)
    monkeypatch.setattr(
        market_data_endpoint,
        "enqueue_market_data_ingestion",
        lambda job_id, *, kind=None: f"rq-resumed-{job_id}",
    )
    client = TestClient(app)

    try:
        with Session() as db:
            job = MarketDataIngestionJob(
                id="pause-me",
                kind="backfill",
                provider="alpaca",
                feed="sip",
                timeframe="1Day",
                adjustment="split",
                symbols=["AAPL"],
                start_ts=datetime(2026, 1, 1, tzinfo=timezone.utc),
                end_ts=datetime(2026, 1, 3, tzinfo=timezone.utc),
                status="running",
                total_symbols=1,
                total_work_units=2,
                progress_state={},
            )
            db.add(job)
            db.commit()

        paused = client.post("/api/v1/market-data/ingestion-jobs/pause-me/pause")
        assert paused.status_code == 200
        assert paused.json()["status"] == "pausing"
        assert paused.json()["pause_requested"] is True

        with Session() as db:
            job = db.get(MarketDataIngestionJob, "pause-me")
            assert job is not None
            job.status = "paused"
            db.commit()

        resumed = client.post("/api/v1/market-data/ingestion-jobs/pause-me/resume")
        assert resumed.status_code == 200
        assert resumed.json()["status"] == "queued"
        assert resumed.json()["pause_requested"] is False
        assert resumed.json()["rq_job_id"].startswith("rq-resumed-")
    finally:
        _clear_overrides()


def test_market_data_cancel_and_delete_api() -> None:
    Session = _session_factory()
    _install_overrides(Session)
    client = TestClient(app)

    try:
        start = datetime(2026, 1, 1, tzinfo=timezone.utc)
        with Session() as db:
            db.add(
                MarketDataIngestionJob(
                    id="cancel-me",
                    kind="backfill",
                    provider="alpaca",
                    feed="sip",
                    timeframe="1Day",
                    adjustment="split",
                    symbols=["AAPL"],
                    start_ts=start,
                    end_ts=start + timedelta(days=2),
                    status="running",
                    total_symbols=1,
                    total_work_units=2,
                    progress_state={},
                )
            )
            db.add(
                MarketDataIngestionJob(
                    id="delete-me",
                    kind="backfill",
                    provider="alpaca",
                    feed="sip",
                    timeframe="1Day",
                    adjustment="split",
                    symbols=["MSFT"],
                    start_ts=start,
                    end_ts=start + timedelta(days=2),
                    status="paused",
                    total_symbols=1,
                    total_work_units=2,
                    progress_state={},
                )
            )
            db.add(
                MarketBar(
                    provider="alpaca",
                    feed="sip",
                    timeframe="1Day",
                    adjustment="split",
                    symbol="MSFT",
                    ts=start,
                    open=1,
                    high=1,
                    low=1,
                    close=1,
                    volume=1,
                    currency="USD",
                )
            )
            db.commit()

        cancelled = client.post("/api/v1/market-data/ingestion-jobs/cancel-me/cancel")
        assert cancelled.status_code == 200
        assert cancelled.json()["status"] == "cancelling"
        assert cancelled.json()["ended_at"] is None

        delete_active = client.delete("/api/v1/market-data/ingestion-jobs/cancel-me")
        assert delete_active.status_code == 409

        with Session() as db:
            job = db.get(MarketDataIngestionJob, "cancel-me")
            assert job is not None
            job.status = "cancelled"
            job.ended_at = start + timedelta(days=1)
            db.commit()

        delete_cancelled = client.delete("/api/v1/market-data/ingestion-jobs/cancel-me")
        assert delete_cancelled.status_code == 204

        delete_paused = client.delete("/api/v1/market-data/ingestion-jobs/delete-me")
        assert delete_paused.status_code == 204

        with Session() as db:
            assert db.get(MarketDataIngestionJob, "cancel-me") is None
            assert db.get(MarketDataIngestionJob, "delete-me") is None
            assert db.query(MarketBar).filter(MarketBar.symbol == "MSFT").count() == 1
    finally:
        _clear_overrides()


def test_market_data_delete_rejects_active_job() -> None:
    Session = _session_factory()
    _install_overrides(Session)
    client = TestClient(app)

    try:
        start = datetime(2026, 1, 1, tzinfo=timezone.utc)
        with Session() as db:
            db.add(
                MarketDataIngestionJob(
                    id="running-job",
                    kind="backfill",
                    provider="alpaca",
                    feed="sip",
                    timeframe="1Day",
                    adjustment="split",
                    symbols=["AAPL"],
                    start_ts=start,
                    end_ts=start + timedelta(days=2),
                    status="running",
                    total_symbols=1,
                    total_work_units=2,
                    progress_state={},
                )
            )
            db.commit()

        response = client.delete("/api/v1/market-data/ingestion-jobs/running-job")
        assert response.status_code == 409
    finally:
        _clear_overrides()


def test_market_data_assets_refresh_and_coverage_api(monkeypatch) -> None:
    Session = _session_factory()
    _install_overrides(Session)
    monkeypatch.setattr(
        market_data_endpoint,
        "refresh_market_assets",
        lambda db: {"refreshed": 3},
    )
    client = TestClient(app)

    try:
        start = datetime(2026, 1, 2, 14, 30, tzinfo=timezone.utc)
        with Session() as db:
            db.add(
                MarketDataCoverage(
                    provider="alpaca",
                    feed="sip",
                    timeframe="1Min",
                    adjustment="split",
                    symbol="AAPL",
                    first_ts=start,
                    last_ts=start + timedelta(minutes=4),
                    row_count=5,
                    last_success_at=start,
                )
            )
            db.add(
                MarketBar(
                    provider="alpaca",
                    feed="sip",
                    timeframe="1Min",
                    adjustment="split",
                    symbol="AAPL",
                    ts=start,
                    open=1,
                    high=1,
                    low=1,
                    close=1,
                    volume=1,
                    currency="USD",
                )
            )
            db.commit()

        refresh = client.post("/api/v1/market-data/assets/refresh")
        assert refresh.status_code == 200
        assert refresh.json() == {"refreshed": 3}

        coverage = client.get("/api/v1/market-data/coverage?symbol=aapl&timeframe=1Min")
        assert coverage.status_code == 200
        assert coverage.json()[0]["symbol"] == "AAPL"
        assert coverage.json()[0]["row_count"] == 5

        statements: list[str] = []
        engine = Session.kw["bind"]

        @event.listens_for(engine, "before_cursor_execute")
        def capture_statement(conn, cursor, statement, parameters, context, executemany):  # noqa: ANN001
            statements.append(statement)

        summary = client.get("/api/v1/market-data/coverage/summary")
        assert summary.status_code == 200
        assert summary.json()["symbols"] == 1
        assert summary.json()["row_count"] == 5
        assert summary.json()["market_bar_rows"] == 5
        assert not any("market_bars" in statement for statement in statements)

        reconcile = client.post("/api/v1/market-data/coverage/reconcile?symbol=aapl&timeframe=1Min")
        assert reconcile.status_code == 200
        assert reconcile.json() == {"reconciled_symbols": 1, "row_count": 1}
    finally:
        _clear_overrides()


def test_market_assets_summary_api() -> None:
    Session = _session_factory()
    _install_overrides(Session)
    client = TestClient(app)

    try:
        with Session() as db:
            db.add(_asset("MSFT", name="Microsoft Corporation"))
            db.add(_asset("AAPL", name="Apple Inc."))
            db.commit()

        response = client.get("/api/v1/market/assets?symbols=aapl,missing,msft")
        assert response.status_code == 200
        assert response.json() == {
            "assets": [
                {
                    "symbol": "AAPL",
                    "name": "Apple Inc.",
                    "asset_class": "us_equity",
                    "exchange": "NASDAQ",
                },
                {
                    "symbol": "MSFT",
                    "name": "Microsoft Corporation",
                    "asset_class": "us_equity",
                    "exchange": "NASDAQ",
                },
            ]
        }
    finally:
        _clear_overrides()


def test_market_assets_search_api() -> None:
    Session = _session_factory()
    _install_overrides(Session)
    client = TestClient(app)

    try:
        with Session() as db:
            db.add(_asset("AAPL", name="Apple Inc."))
            db.add(_asset("APP", name="AppLovin Corporation"))
            db.add(_asset("MSFT", name="Microsoft Corporation"))
            db.add(_asset("NVDA", name="NVIDIA Corporation"))
            db.add(_asset("TSLA", name="Tesla, Inc."))
            db.add(_asset("AMZN", name="Amazon.com, Inc."))
            db.add(_asset("PAPL", name="Pineapple Holdings"))
            db.add(_asset("XOLD", name="Apple Inactive", status="inactive"))
            db.add(_asset("XNTR", name="Apple Non Tradable", tradable=False))
            db.commit()

        app_response = client.get("/api/v1/market/assets/search?q=app")
        assert app_response.status_code == 200
        app_assets = app_response.json()["assets"]
        assert [asset["symbol"] for asset in app_assets[:3]] == ["APP", "AAPL", "PAPL"]
        assert "XOLD" not in {asset["symbol"] for asset in app_assets}
        assert "XNTR" not in {asset["symbol"] for asset in app_assets}

        apple_response = client.get("/api/v1/market/assets/search?q=apple")
        assert apple_response.status_code == 200
        assert apple_response.json()["assets"][0]["symbol"] == "AAPL"

        limited_response = client.get("/api/v1/market/assets/search?q=a&limit=2")
        assert limited_response.status_code == 200
        assert len(limited_response.json()["assets"]) == 2
    finally:
        _clear_overrides()


def _session_factory():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine)


def _install_overrides(Session) -> None:  # noqa: ANN001
    def override_db() -> Iterator:
        db = Session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user_id] = lambda: 1


def _clear_overrides() -> None:
    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.pop(get_current_user_id, None)


def _asset(
    symbol: str,
    name: str | None = None,
    *,
    status: str = "active",
    tradable: bool = True,
) -> MarketAsset:
    return MarketAsset(
        symbol=symbol,
        asset_id=f"{symbol}-id",
        name=name or symbol,
        asset_class="us_equity",
        exchange="NASDAQ",
        status=status,
        tradable=tradable,
        marginable=True,
        shortable=True,
        easy_to_borrow=True,
        raw={},
    )
