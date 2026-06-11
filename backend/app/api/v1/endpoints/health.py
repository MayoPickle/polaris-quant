"""Liveness / readiness."""

from fastapi import APIRouter, Depends

from app.api.deps import BrokerEnv, get_request_broker_env
from app.core.config import settings

router = APIRouter()


@router.get("/health")
def health(broker_env: BrokerEnv = Depends(get_request_broker_env)) -> dict:
    return {
        "status": "ok",
        "app": settings.APP_NAME,
        "env": settings.ENV,
        "broker_env": broker_env,
        "trading_enabled": settings.TRADING_ENABLED,
        "openai_sizing_enabled": bool(settings.OPENAI_API_KEY),
        "position_model": settings.POSITION_MODEL,
        "default_position_allocation_pct": settings.DEFAULT_POSITION_ALLOCATION_PCT,
    }
