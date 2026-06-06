"""Aggregate v1 router."""

from fastapi import APIRouter, Depends

from app.api.deps import get_current_user_id
from app.api.v1.endpoints import (
    account,
    auth,
    health,
    market,
    market_data,
    orders,
    positions,
    strategies,
)

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(
    strategies.router,
    prefix="/strategies",
    tags=["strategies"],
    dependencies=[Depends(get_current_user_id)],
)
api_router.include_router(
    orders.router,
    prefix="/orders",
    tags=["orders"],
    dependencies=[Depends(get_current_user_id)],
)
api_router.include_router(
    positions.router,
    prefix="/positions",
    tags=["positions"],
    dependencies=[Depends(get_current_user_id)],
)
api_router.include_router(
    account.router,
    prefix="/account",
    tags=["account"],
    dependencies=[Depends(get_current_user_id)],
)
api_router.include_router(
    market.router,
    prefix="/market",
    tags=["market"],
    dependencies=[Depends(get_current_user_id)],
)
api_router.include_router(
    market_data.router,
    prefix="/market-data",
    tags=["market-data"],
    dependencies=[Depends(get_current_user_id)],
)
