"""Aggregate v1 router."""

from fastapi import APIRouter

from app.api.v1.endpoints import account, health, market, orders, positions, strategies

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(strategies.router, prefix="/strategies", tags=["strategies"])
api_router.include_router(orders.router, prefix="/orders", tags=["orders"])
api_router.include_router(positions.router, prefix="/positions", tags=["positions"])
api_router.include_router(account.router, prefix="/account", tags=["account"])
api_router.include_router(market.router, prefix="/market", tags=["market"])
