"""Database write helpers for market-data ingestion."""

from __future__ import annotations

from dataclasses import dataclass
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


MAX_UPSERT_PARAMS = 30_000


@dataclass
class CoverageDelta:
    first_ts: datetime
    last_ts: datetime
    row_count: int


def upsert_market_assets(db: Session, assets: list[ProviderAsset]) -> int:
    rows = [_asset_values(asset) for asset in assets]
    return _upsert_rows(
        db,
        MarketAsset.__table__,
        rows,
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


def upsert_market_bars(
    db: Session,
    job: MarketDataIngestionJob,
    bars: list[ProviderBar],
) -> int:
    rows = [_bar_values(job, bar) for bar in bars]
    return _upsert_rows(
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


def refresh_coverage(
    db: Session,
    job: MarketDataIngestionJob,
    bars: list[ProviderBar],
) -> None:
    now = datetime.now(UTC)
    for symbol, delta in _coverage_delta_from_bars(bars).items():
        coverage = _load_coverage(db, job, symbol)
        if coverage is None:
            coverage = MarketDataCoverage(
                provider=job.provider,
                feed=job.feed,
                timeframe=job.timeframe,
                adjustment=job.adjustment,
                symbol=symbol,
                first_ts=delta.first_ts,
                last_ts=delta.last_ts,
                row_count=delta.row_count,
            )
            db.add(coverage)
        else:
            coverage.first_ts = _min_ts(coverage.first_ts, delta.first_ts)
            coverage.last_ts = _max_ts(coverage.last_ts, delta.last_ts)
            coverage.row_count = int(coverage.row_count or 0) + delta.row_count
        coverage.last_success_at = now
        coverage.last_error = None


def reconcile_coverage(
    db: Session,
    *,
    provider: str,
    feed: str,
    timeframe: str,
    adjustment: str,
    symbols: list[str] | None = None,
    limit: int = 50,
) -> dict[str, int]:
    target_symbols = _symbols_for_reconcile(
        db,
        provider=provider,
        feed=feed,
        timeframe=timeframe,
        adjustment=adjustment,
        symbols=symbols,
        limit=limit,
    )
    now = datetime.now(UTC)
    reconciled_symbols = 0
    total_rows = 0

    for symbol in target_symbols:
        first_ts, last_ts, row_count = _coverage_stats_from_db(
            db,
            provider=provider,
            feed=feed,
            timeframe=timeframe,
            adjustment=adjustment,
            symbol=symbol,
        )
        coverage = _load_coverage_by_key(
            db,
            provider=provider,
            feed=feed,
            timeframe=timeframe,
            adjustment=adjustment,
            symbol=symbol,
        )
        if coverage is None:
            coverage = MarketDataCoverage(
                provider=provider,
                feed=feed,
                timeframe=timeframe,
                adjustment=adjustment,
                symbol=symbol,
            )
            db.add(coverage)
        coverage.first_ts = first_ts
        coverage.last_ts = last_ts
        coverage.row_count = int(row_count)
        coverage.last_success_at = now
        coverage.last_error = None
        reconciled_symbols += 1
        total_rows += int(row_count)

    db.commit()
    return {"reconciled_symbols": reconciled_symbols, "row_count": total_rows}


def _coverage_delta_from_bars(bars: list[ProviderBar]) -> dict[str, CoverageDelta]:
    seen: set[tuple[str, datetime]] = set()
    stats: dict[str, CoverageDelta] = {}

    for bar in bars:
        symbol = bar.symbol.upper()
        ts = as_utc(bar.ts)
        key = (symbol, ts)
        if key in seen:
            continue
        seen.add(key)

        delta = stats.get(symbol)
        if delta is None:
            stats[symbol] = CoverageDelta(first_ts=ts, last_ts=ts, row_count=1)
        else:
            delta.first_ts = min(delta.first_ts, ts)
            delta.last_ts = max(delta.last_ts, ts)
            delta.row_count += 1
    return stats


def _coverage_stats_from_db(
    db: Session,
    *,
    provider: str,
    feed: str,
    timeframe: str,
    adjustment: str,
    symbol: str,
):
    return (
        db.query(
            func.min(MarketBar.ts),
            func.max(MarketBar.ts),
            func.count(MarketBar.ts),
        )
        .filter(
            MarketBar.provider == provider,
            MarketBar.feed == feed,
            MarketBar.timeframe == timeframe,
            MarketBar.adjustment == adjustment,
            MarketBar.symbol == symbol,
        )
        .one()
    )


def _load_coverage(
    db: Session,
    job: MarketDataIngestionJob,
    symbol: str,
) -> MarketDataCoverage | None:
    return _load_coverage_by_key(
        db,
        provider=job.provider,
        feed=job.feed,
        timeframe=job.timeframe,
        adjustment=job.adjustment,
        symbol=symbol,
    )


def _load_coverage_by_key(
    db: Session,
    *,
    provider: str,
    feed: str,
    timeframe: str,
    adjustment: str,
    symbol: str,
) -> MarketDataCoverage | None:
    return (
        db.query(MarketDataCoverage)
        .filter(
            MarketDataCoverage.provider == provider,
            MarketDataCoverage.feed == feed,
            MarketDataCoverage.timeframe == timeframe,
            MarketDataCoverage.adjustment == adjustment,
            MarketDataCoverage.symbol == symbol,
        )
        .one_or_none()
    )


def _symbols_for_reconcile(
    db: Session,
    *,
    provider: str,
    feed: str,
    timeframe: str,
    adjustment: str,
    symbols: list[str] | None,
    limit: int,
) -> list[str]:
    if symbols:
        return sorted({symbol.upper() for symbol in symbols if symbol.strip()})
    rows = (
        db.query(MarketDataCoverage.symbol)
        .filter(
            MarketDataCoverage.provider == provider,
            MarketDataCoverage.feed == feed,
            MarketDataCoverage.timeframe == timeframe,
            MarketDataCoverage.adjustment == adjustment,
        )
        .order_by(MarketDataCoverage.symbol.asc())
        .limit(limit)
        .all()
    )
    return [row[0] for row in rows]


def _min_ts(current: datetime | None, value: datetime) -> datetime:
    if current is None:
        return value
    return min(as_utc(current), value)


def _max_ts(current: datetime | None, value: datetime) -> datetime:
    if current is None:
        return value
    return max(as_utc(current), value)


def _upsert_rows(
    db: Session,
    table,
    rows: list[dict[str, Any]],
    *,
    conflict_keys: list[str],
    update_keys: list[str],
) -> int:
    if not rows:
        return 0

    rows = _dedupe_rows(rows, conflict_keys)

    dialect = db.bind.dialect.name if db.bind is not None else ""
    if dialect == "postgresql":
        from sqlalchemy.dialects.postgresql import insert
    elif dialect == "sqlite":
        from sqlalchemy.dialects.sqlite import insert
    else:
        raise RuntimeError(f"Unsupported market data upsert dialect: {dialect}")

    for batch in _batched_rows(rows):
        stmt = insert(table).values(batch)
        stmt = stmt.on_conflict_do_update(
            index_elements=conflict_keys,
            set_={key: getattr(stmt.excluded, key) for key in update_keys},
        )
        db.execute(stmt)
    return len(rows)


def _dedupe_rows(
    rows: list[dict[str, Any]],
    conflict_keys: list[str],
) -> list[dict[str, Any]]:
    deduped: dict[tuple[Any, ...], dict[str, Any]] = {}
    for row in rows:
        key = tuple(row[conflict_key] for conflict_key in conflict_keys)
        deduped[key] = row
    return list(deduped.values())


def _batched_rows(rows: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
    params_per_row = max(1, len(rows[0]))
    batch_size = max(1, MAX_UPSERT_PARAMS // params_per_row)
    return [rows[index : index + batch_size] for index in range(0, len(rows), batch_size)]


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
