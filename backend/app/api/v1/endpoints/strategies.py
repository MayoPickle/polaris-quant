"""Aggregate strategy endpoints."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.v1.endpoints import (
    strategy_backtests,
    strategy_batch_backtests,
    strategy_catalog,
    strategy_instances,
)
from app.api.v1.endpoints.strategy_instances import _validate_strategy_payload

router = APIRouter()
router.include_router(strategy_catalog.router)
router.routes.extend(strategy_instances.router.routes)
router.include_router(strategy_backtests.router)
router.include_router(strategy_batch_backtests.router)

__all__ = ["_validate_strategy_payload", "router"]
