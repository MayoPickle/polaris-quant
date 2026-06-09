"""Protected market-data cache management endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.models.market_data import MarketDataCoverage, MarketDataIngestionJob
from app.schemas.market_data import (
    MarketAssetRefreshRead,
    MarketDataCoverageReconcileRead,
    MarketDataCoverageRead,
    MarketDataCoverageSummaryRead,
    MarketDataIngestionJobCreate,
    MarketDataIngestionJobRead,
)
from app.services.market_data_control import (
    cancel_ingestion_job,
    delete_ingestion_job,
    fail_resume_ingestion_job,
    get_ingestion_job_or_404,
    market_data_coverage_summary,
    pause_ingestion_job,
    prepare_resume_ingestion_job,
    reconcile_market_data_coverage,
)
from app.services.market_data_ingestion import create_ingestion_job, refresh_market_assets
from app.workers.queue import enqueue_market_data_ingestion

router = APIRouter()


@router.post("/assets/refresh", response_model=MarketAssetRefreshRead)
def refresh_assets(db: Session = Depends(get_db)) -> MarketAssetRefreshRead:
    try:
        result = refresh_market_assets(db)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, f"Could not refresh Alpaca assets: {exc}") from exc
    return MarketAssetRefreshRead(**result)


@router.get("/ingestion-jobs", response_model=list[MarketDataIngestionJobRead])
def list_market_data_ingestion_jobs(
    kind: str | None = Query(default=None),
    status: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> list[MarketDataIngestionJob]:
    query = db.query(MarketDataIngestionJob)
    if kind:
        query = query.filter(MarketDataIngestionJob.kind == kind)
    if status:
        query = query.filter(MarketDataIngestionJob.status == status)
    return (
        query.order_by(MarketDataIngestionJob.created_at.desc(), MarketDataIngestionJob.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )


@router.post(
    "/ingestion-jobs",
    response_model=MarketDataIngestionJobRead,
    status_code=201,
)
def create_market_data_ingestion_job(
    payload: MarketDataIngestionJobCreate,
    db: Session = Depends(get_db),
) -> MarketDataIngestionJob:
    try:
        job = create_ingestion_job(db, payload)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc

    try:
        job.rq_job_id = enqueue_market_data_ingestion(job.id)
    except Exception as exc:  # noqa: BLE001
        job.status = "failed"
        job.error = f"Could not enqueue market-data ingestion: {exc}"
        db.commit()
        db.refresh(job)
        raise HTTPException(503, job.error) from exc

    db.commit()
    db.refresh(job)
    return job


@router.get(
    "/ingestion-jobs/latest",
    response_model=MarketDataIngestionJobRead | None,
)
def latest_market_data_ingestion_job(
    db: Session = Depends(get_db),
) -> MarketDataIngestionJob | None:
    return (
        db.query(MarketDataIngestionJob)
        .order_by(MarketDataIngestionJob.created_at.desc(), MarketDataIngestionJob.id.desc())
        .first()
    )


@router.get(
    "/ingestion-jobs/{job_id}",
    response_model=MarketDataIngestionJobRead,
)
def get_market_data_ingestion_job(
    job_id: str,
    db: Session = Depends(get_db),
) -> MarketDataIngestionJob:
    return get_ingestion_job_or_404(db, job_id)


@router.post(
    "/ingestion-jobs/{job_id}/pause",
    response_model=MarketDataIngestionJobRead,
)
def pause_market_data_ingestion_job(
    job_id: str,
    db: Session = Depends(get_db),
) -> MarketDataIngestionJob:
    job = get_ingestion_job_or_404(db, job_id)
    return pause_ingestion_job(db, job)


@router.post(
    "/ingestion-jobs/{job_id}/resume",
    response_model=MarketDataIngestionJobRead,
)
def resume_market_data_ingestion_job(
    job_id: str,
    db: Session = Depends(get_db),
) -> MarketDataIngestionJob:
    job = prepare_resume_ingestion_job(db, get_ingestion_job_or_404(db, job_id))
    try:
        job.rq_job_id = enqueue_market_data_ingestion(job.id)
    except Exception as exc:  # noqa: BLE001
        error = f"Could not enqueue market-data ingestion: {exc}"
        fail_resume_ingestion_job(db, job, error)
        raise HTTPException(503, error) from exc

    db.commit()
    db.refresh(job)
    return job


@router.post(
    "/ingestion-jobs/{job_id}/cancel",
    response_model=MarketDataIngestionJobRead,
)
def cancel_market_data_ingestion_job(
    job_id: str,
    db: Session = Depends(get_db),
) -> MarketDataIngestionJob:
    job = get_ingestion_job_or_404(db, job_id)
    return cancel_ingestion_job(db, job)


@router.delete(
    "/ingestion-jobs/{job_id}",
    response_class=Response,
    response_model=None,
    status_code=204,
)
def delete_market_data_ingestion_job(
    job_id: str,
    db: Session = Depends(get_db),
) -> Response:
    job = get_ingestion_job_or_404(db, job_id)
    delete_ingestion_job(db, job)
    return Response(status_code=204)


@router.get("/coverage/summary", response_model=MarketDataCoverageSummaryRead)
def market_data_global_coverage_summary(
    db: Session = Depends(get_db),
) -> MarketDataCoverageSummaryRead:
    return MarketDataCoverageSummaryRead(**market_data_coverage_summary(db))


@router.post("/coverage/reconcile", response_model=MarketDataCoverageReconcileRead)
def reconcile_market_data_global_coverage(
    symbol: str | None = Query(default=None, min_length=1, max_length=16),
    timeframe: str = Query(default=settings.MARKET_DATA_DEFAULT_TIMEFRAME),
    provider: str = Query(default=settings.MARKET_DATA_DEFAULT_PROVIDER),
    feed: str = Query(default=settings.MARKET_DATA_DEFAULT_FEED),
    adjustment: str = Query(default=settings.MARKET_DATA_DEFAULT_ADJUSTMENT),
    limit: int = Query(default=settings.MARKET_DATA_COVERAGE_RECONCILE_BATCH_SYMBOLS, ge=1, le=500),
    db: Session = Depends(get_db),
) -> MarketDataCoverageReconcileRead:
    return MarketDataCoverageReconcileRead(
        **reconcile_market_data_coverage(
            db,
            provider=provider,
            feed=feed,
            timeframe=timeframe,
            adjustment=adjustment,
            symbol=symbol.upper() if symbol else None,
            limit=limit,
        )
    )


@router.get("/coverage", response_model=list[MarketDataCoverageRead])
def market_data_coverage(
    symbol: str = Query(min_length=1, max_length=16),
    timeframe: str = Query(default=settings.MARKET_DATA_DEFAULT_TIMEFRAME),
    provider: str = Query(default=settings.MARKET_DATA_DEFAULT_PROVIDER),
    feed: str = Query(default=settings.MARKET_DATA_DEFAULT_FEED),
    adjustment: str = Query(default=settings.MARKET_DATA_DEFAULT_ADJUSTMENT),
    db: Session = Depends(get_db),
) -> list[MarketDataCoverage]:
    return (
        db.query(MarketDataCoverage)
        .filter(
            MarketDataCoverage.provider == provider,
            MarketDataCoverage.feed == feed,
            MarketDataCoverage.timeframe == timeframe,
            MarketDataCoverage.adjustment == adjustment,
            MarketDataCoverage.symbol == symbol.upper(),
        )
        .order_by(MarketDataCoverage.symbol.asc())
        .all()
    )
