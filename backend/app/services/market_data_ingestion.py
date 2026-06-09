"""Market data asset refresh and historical bar ingestion."""

from __future__ import annotations

from datetime import datetime, timedelta
import re
from uuid import uuid4

from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.market_data import (
    MarketAsset,
    MarketDataIngestionJob,
)
from app.schemas.market_data import MarketDataIngestionJobCreate
from app.services.market_data_ingestion_store import (
    refresh_coverage,
    upsert_market_assets,
    upsert_market_bars,
)
from app.services.market_data_ingestion_units import (
    MarketDataWorkUnit,
    completed_symbols_for,
    count_work_units_for,
    initial_progress_state,
    iter_work_units,
)
from app.services.market_data_provider import (
    AlpacaMarketDataProvider,
    InvalidProviderSymbolError,
    ProviderBar,
)
from app.services.market_data_time import (
    UTC,
    as_utc,
    is_regular_session,
    normalize_symbols,
    parse_utc_date,
)


_DEFAULT_INGESTION_SYMBOL_RE = re.compile(r"^[A-Z]{1,5}([.-][A-Z])?$")
_NON_BAR_ASSET_RE = re.compile(
    r"\b(contra|contingent value|cvr|right|rights|warrant|escrow|subscription|cash)\b",
    re.IGNORECASE,
)


def refresh_market_assets(
    db: Session,
    provider: AlpacaMarketDataProvider | None = None,
) -> dict[str, int]:
    data_provider = provider or AlpacaMarketDataProvider()
    assets = data_provider.list_us_equity_assets()
    refreshed = upsert_market_assets(db, assets)
    db.commit()
    return {"refreshed": refreshed}


def create_ingestion_job(
    db: Session,
    payload: MarketDataIngestionJobCreate,
) -> MarketDataIngestionJob:
    provider = payload.provider or settings.MARKET_DATA_DEFAULT_PROVIDER
    feed = payload.feed or settings.MARKET_DATA_DEFAULT_FEED
    timeframe = payload.timeframe or settings.MARKET_DATA_DEFAULT_TIMEFRAME
    adjustment = payload.adjustment or settings.MARKET_DATA_DEFAULT_ADJUSTMENT
    start_ts = as_utc(payload.start_ts or _default_start(payload.kind))
    end_ts = as_utc(payload.end_ts or datetime.now(UTC))
    if start_ts >= end_ts:
        raise ValueError("start_ts must be earlier than end_ts.")

    symbols = normalize_symbols(payload.symbols) or _default_symbols(db, payload.kind)
    if not symbols:
        raise ValueError("Refresh assets before creating a market data ingestion job.")
    symbols_per_request = max(1, settings.MARKET_DATA_SYMBOLS_PER_REQUEST)
    total_work_units = count_work_units_for(
        symbols=symbols,
        timeframe=timeframe,
        start_ts=start_ts,
        end_ts=end_ts,
        symbols_per_request=symbols_per_request,
    )

    job = MarketDataIngestionJob(
        id=str(uuid4()),
        kind=payload.kind,
        provider=provider,
        feed=feed,
        timeframe=timeframe,
        adjustment=adjustment,
        symbols=symbols,
        start_ts=start_ts,
        end_ts=end_ts,
        status="queued",
        total_symbols=len(symbols),
        completed_symbols=0,
        total_work_units=total_work_units,
        completed_work_units=0,
        pause_requested=False,
        progress_state=initial_progress_state(symbols_per_request),
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def create_daily_sync_job(db: Session) -> MarketDataIngestionJob:
    existing = (
        db.query(MarketDataIngestionJob)
        .filter(
            MarketDataIngestionJob.kind == "daily_sync",
            MarketDataIngestionJob.status.in_(("queued", "running", "cancelling", "pausing", "paused")),
        )
        .order_by(MarketDataIngestionJob.created_at.desc())
        .first()
    )
    if existing is not None:
        return existing

    now = datetime.now(UTC)
    payload = MarketDataIngestionJobCreate(
        kind="daily_sync",
        start_ts=now - timedelta(days=7),
        end_ts=now,
    )
    return create_ingestion_job(db, payload)


def run_market_data_ingestion_job(
    job_id: str,
    provider: AlpacaMarketDataProvider | None = None,
) -> None:
    data_provider = provider or AlpacaMarketDataProvider()
    with SessionLocal() as db:
        job = db.get(MarketDataIngestionJob, job_id)
        if job is None:
            return
        if job.status == "cancelling":
            _mark_cancelled(db, job)
            return
        if job.status in {"cancelled", "completed", "paused"}:
            return
        if job.pause_requested:
            _mark_paused(db, job)
            return

        job.status = "running"
        job.error = None
        job.ended_at = None
        if job.started_at is None:
            job.started_at = datetime.now(UTC)
        if job.total_work_units <= 0:
            job.total_work_units = count_work_units_for(
                symbols=normalize_symbols(job.symbols),
                timeframe=job.timeframe,
                start_ts=job.start_ts,
                end_ts=job.end_ts,
                symbols_per_request=max(1, settings.MARKET_DATA_SYMBOLS_PER_REQUEST),
            )
        db.commit()

        try:
            for unit in iter_work_units(job):
                if unit.index < job.completed_work_units:
                    continue
                db.refresh(job)
                if job.status in {"cancelled", "cancelling"}:
                    _mark_cancelled(db, job)
                    return
                if job.pause_requested or job.status == "pausing":
                    _mark_paused(db, job)
                    return
                _ingest_work_unit(db, job, unit, data_provider)

            db.refresh(job)
            if job.status in {"cancelled", "cancelling"}:
                _mark_cancelled(db, job)
                return
            if job.pause_requested or job.status == "pausing":
                _mark_paused(db, job)
                return
            job.status = "completed"
            job.pause_requested = False
            job.completed_work_units = job.total_work_units
            job.completed_symbols = job.total_symbols
            job.current_symbol = None
            job.ended_at = datetime.now(UTC)
            db.commit()
        except Exception as exc:
            job.status = "failed"
            job.error = str(exc)
            job.current_symbol = None
            job.ended_at = datetime.now(UTC)
            db.commit()
            raise


def _ingest_work_unit(
    db: Session,
    job: MarketDataIngestionJob,
    unit: MarketDataWorkUnit,
    provider: AlpacaMarketDataProvider,
) -> None:
    symbols = _active_unit_symbols(job, unit)
    job.current_symbol = symbols[0] if symbols else unit.symbols[0]
    job.cursor = unit.cursor
    db.commit()

    bars = _get_bars_skipping_invalid_symbols(
        db,
        job,
        provider,
        symbols,
        timeframe=job.timeframe,
        start=unit.window_start,
        end=unit.window_end,
        feed=job.feed,
        adjustment=job.adjustment,
    )
    filtered_bars = [bar for bar in bars if _should_store_bar(job, bar)]
    job.requested_rows += len(bars)
    job.inserted_rows += upsert_market_bars(db, job, filtered_bars)
    refresh_coverage(db, job, filtered_bars)
    job.completed_work_units = unit.index + 1
    job.completed_symbols = completed_symbols_for(job)
    job.progress_state = {
        **(job.progress_state or {}),
        "last_completed_unit": unit.index,
        "last_completed_cursor": unit.cursor,
        "chunk_index": unit.chunk_index,
        "window_index": unit.window_index,
    }
    db.commit()


def _get_bars_skipping_invalid_symbols(
    db: Session,
    job: MarketDataIngestionJob,
    provider: AlpacaMarketDataProvider,
    symbols: list[str],
    *,
    timeframe: str,
    start: datetime,
    end: datetime,
    feed: str,
    adjustment: str,
) -> list[ProviderBar]:
    remaining = list(symbols)
    while remaining:
        try:
            return provider.get_bars(
                remaining,
                timeframe=timeframe,
                start=start,
                end=end,
                feed=feed,
                adjustment=adjustment,
            )
        except InvalidProviderSymbolError as exc:
            invalid_symbols = [symbol for symbol in exc.symbols if symbol in remaining]
            if not invalid_symbols:
                raise
            _record_skipped_symbols(job, invalid_symbols)
            db.commit()
            invalid_set = set(invalid_symbols)
            remaining = [symbol for symbol in remaining if symbol not in invalid_set]
    return []


def _active_unit_symbols(job: MarketDataIngestionJob, unit: MarketDataWorkUnit) -> list[str]:
    skipped_symbols = set(_skipped_symbols(job))
    return [symbol for symbol in unit.symbols if symbol not in skipped_symbols]


def _record_skipped_symbols(job: MarketDataIngestionJob, symbols: list[str]) -> None:
    progress_state = dict(job.progress_state or {})
    skipped_symbols = _skipped_symbols(job)
    seen = set(skipped_symbols)
    for symbol in symbols:
        if symbol not in seen:
            skipped_symbols.append(symbol)
            seen.add(symbol)
    progress_state["skipped_symbols"] = skipped_symbols
    progress_state["skipped_symbol_count"] = len(skipped_symbols)
    progress_state["last_skipped_symbols"] = symbols
    job.progress_state = progress_state


def _skipped_symbols(job: MarketDataIngestionJob) -> list[str]:
    value = (job.progress_state or {}).get("skipped_symbols")
    if not isinstance(value, list):
        return []
    return [str(symbol).upper() for symbol in value]


def _default_start(kind: str) -> datetime:
    if kind == "daily_sync":
        return datetime.now(UTC) - timedelta(days=7)
    return parse_utc_date(settings.MARKET_DATA_BACKFILL_START)


def _default_symbols(db: Session, kind: str) -> list[str]:
    query = db.query(MarketAsset)
    if kind == "daily_sync":
        active = (
            query.filter(MarketAsset.status == "active")
            .order_by(MarketAsset.symbol.asc())
            .all()
        )
        if active:
            return [asset.symbol for asset in active if _is_default_ingestion_asset(asset)]
    rows = query.order_by(MarketAsset.symbol.asc()).all()
    return [asset.symbol for asset in rows if _is_default_ingestion_asset(asset)]


def _is_default_ingestion_asset(asset: MarketAsset) -> bool:
    symbol = asset.symbol.upper()
    if not _DEFAULT_INGESTION_SYMBOL_RE.match(symbol):
        return False
    searchable = " ".join(
        [
            symbol,
            asset.name or "",
            str((asset.raw or {}).get("name", "")),
            str((asset.raw or {}).get("class", "")),
        ]
    )
    return _NON_BAR_ASSET_RE.search(searchable) is None


def _should_store_bar(job: MarketDataIngestionJob, bar: ProviderBar) -> bool:
    if job.timeframe != "1Min":
        return True
    return is_regular_session(bar.ts, settings.MARKET_TIMEZONE)


def _mark_paused(db: Session, job: MarketDataIngestionJob) -> None:
    job.status = "paused"
    job.pause_requested = True
    job.current_symbol = None
    job.ended_at = datetime.now(UTC)
    db.commit()


def _mark_cancelled(db: Session, job: MarketDataIngestionJob) -> None:
    job.status = "cancelled"
    job.pause_requested = False
    job.current_symbol = None
    if job.ended_at is None:
        job.ended_at = datetime.now(UTC)
    db.commit()
