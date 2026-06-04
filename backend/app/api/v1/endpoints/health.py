"""Liveness / readiness."""

from fastapi import APIRouter

from app.core.config import settings

router = APIRouter()


@router.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "app": settings.APP_NAME,
        "env": settings.ENV,
        "broker_env": settings.ALPACA_ENV,
        "trading_enabled": settings.TRADING_ENABLED,
    }
