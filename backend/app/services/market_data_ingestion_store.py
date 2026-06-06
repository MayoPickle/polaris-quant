"""Database write helpers for market-data ingestion."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.market_data import (
    MarketAsset,
    MarketBar,
    MarketDataCoverage,
    MarketDataIngestionJob,
)
from app.services.market_data_provider import ProviderAsset, ProviderBar
from app.services.market_data_time import UTC, as_utc


def upsert_market_assets(db: Session, assets: list[ProviderAsset]) -> int:
    _upsert_rows(
        db,
        MarketAsset.__table__,
        [_asset_values(asset) for asset in assets],
        conflict_keys=["symbol"],
        update_keys=[
            "asset_id",
            "name",
            "asset_class",
            "exchange",
            "status",
            "tradable",
            "marginable",
            "shortable",
            "easy_to_borrow",
            "raw",
            "updated_at",
        ],
    )
    return len(assets)


def upsert_market_bars(
    db: Session,
    job: MarketDataIngestionJob,
    bars: list[ProviderBar],
) -> int:
    rows = [_bar_values(job, bar) for bar in bars]
    _upsert_rows(
        db,
        MarketBar.__table__,
        rows,
        conflict_keys=["provider", "feed", "timeframe", "adjustment", "symbol", "ts"],
        update_keys=[
            "open",
            "high",
            "low",
            "close",
            "volume",
            "trade_count",
            "vwap",
            "currency",
            "ingested_at",
        ],
    )
    return len(rows)


def refresh_coverage(
    db: Session,
    job: MarketDataIngestionJob,
    symbols: list[str],
) -> None:
    now = datetime.now(UTC)
    for symbol in symbols:
        first_ts, last_ts, row_count = _coverage_stats(db, job, symbol)
        if row_count == 0:
            continue

        coverage = _load_coverage(db, job, symbol)
        if coverage is None:
            coverage = MarketDataCoverage(
                provider=job.provider,
                feed=job.feed,
                timeframe=job.timeframe,
                adjustment=job.adjustment,
                symbol=symbol,
            )
            db.add(coverage)
        coverage.first_ts = first_ts
        coverage.last_ts = last_ts
        coverage.row_count = int(row_count)
        coverage.last_success_at = now
        coverage.last_error = None


def _coverage_stats(
    db: Session,
    job: MarketDataIngestionJob,
    symbol: str,
):
    return (
        db.query(
            func.min(MarketBar.ts),
            func.max(MarketBar.ts),
            func.count(MarketBar.ts),
        )
        .filter(
            MarketBar.provider == job.provider,
            MarketBar.feed == job.feed,
            MarketBar.timeframe == job.timeframe,
            MarketBar.adjustment == job.adjustment,
            MarketBar.symbol == symbol,
        )
        .one()
    )


def _load_coverage(
    db: Session,
    job: MarketDataIngestionJob,
    symbol: str,
) -> MarketDataCoverage | None:
    return (
        db.query(MarketDataCoverage)
        .filter(
            MarketDataCoverage.provider == job.provider,
            MarketDataCoverage.feed == job.feed,
            MarketDataCoverage.timeframe == job.timeframe,
            MarketDataCoverage.adjustment == job.adjustment,
            MarketDataCoverage.symbol == symbol,
        )
        .one_or_none()
    )


def _upsert_rows(
    db: Session,
    table,
    rows: list[dict[str, Any]],
    *,
    conflict_keys: list[str],
    update_keys: list[str],
) -> None:
    if not rows:
        return

    dialect = db.bind.dialect.name if db.bind is not None else ""
    if dialect == "postgresql":
        from sqlalchemy.dialects.postgresql import insert
    elif dialect == "sqlite":
        from sqlalchemy.dialects.sqlite import insert
    else:
        raise RuntimeError(f"Unsupported market data upsert dialect: {dialect}")

    stmt = insert(table).values(rows)
    stmt = stmt.on_conflict_do_update(
        index_elements=conflict_keys,
        set_={key: getattr(stmt.excluded, key) for key in update_keys},
    )
    db.execute(stmt)


def _asset_values(asset: ProviderAsset) -> dict[str, Any]:
    now = datetime.now(UTC)
    return {
        "symbol": asset.symbol,
        "asset_id": asset.asset_id,
        "name": asset.name,
        "asset_class": asset.asset_class,
        "exchange": asset.exchange,
        "status": asset.status,
        "tradable": asset.tradable,
        "marginable": asset.marginable,
        "shortable": asset.shortable,
        "easy_to_borrow": asset.easy_to_borrow,
        "raw": asset.raw,
        "created_at": now,
        "updated_at": now,
    }


def _bar_values(job: MarketDataIngestionJob, bar: ProviderBar) -> dict[str, Any]:
    return {
        "provider": job.provider,
        "feed": job.feed,
        "timeframe": job.timeframe,
        "adjustment": job.adjustment,
        "symbol": bar.symbol,
        "ts": as_utc(bar.ts),
        "open": bar.open,
        "high": bar.high,
        "low": bar.low,
        "close": bar.close,
        "volume": bar.volume,
        "trade_count": bar.trade_count,
        "vwap": bar.vwap,
        "currency": "USD",
        "ingested_at": datetime.now(UTC),
    }
