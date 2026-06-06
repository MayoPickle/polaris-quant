"""User strategy instance endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy.orm import Session

from app.api.deps import get_current_user_id
from app.core.config import settings
from app.db.session import get_db
from app.models.strategy import StrategyInstance
from app.schemas.strategy import (
    StrategyInstanceCreate,
    StrategyInstanceRead,
    StrategyInstanceUpdate,
)
from app.strategies import registry

router = APIRouter()


@router.get("", response_model=list[StrategyInstanceRead])
def list_instances(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> list[StrategyInstance]:
    return db.query(StrategyInstance).filter(StrategyInstance.user_id == user_id).all()


@router.post("", response_model=StrategyInstanceRead, status_code=201)
def create_instance(
    payload: StrategyInstanceCreate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> StrategyInstance:
    _validate_strategy_payload(
        payload.strategy_key,
        symbols=payload.symbols,
        schedule=payload.schedule,
        is_active=payload.is_active,
        live_confirmed=payload.live_confirmed,
    )

    data = payload.model_dump(exclude={"live_confirmed"})
    if data["is_active"] and not data["schedule"]:
        data["schedule"] = settings.DEFAULT_STRATEGY_SCHEDULE
    data["symbols"] = _normalize_symbols(data["symbols"])

    instance = StrategyInstance(user_id=user_id, **data)
    db.add(instance)
    db.commit()
    db.refresh(instance)
    return instance


@router.patch("/{instance_id}", response_model=StrategyInstanceRead)
def update_instance(
    instance_id: int,
    payload: StrategyInstanceUpdate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> StrategyInstance:
    instance = _get_instance(db, user_id, instance_id)
    next_strategy_key = instance.strategy_key
    next_symbols = payload.symbols if payload.symbols is not None else instance.symbols
    next_schedule = payload.schedule if payload.schedule is not None else instance.schedule
    next_is_active = payload.is_active if payload.is_active is not None else instance.is_active

    _validate_strategy_payload(
        next_strategy_key,
        symbols=next_symbols,
        schedule=next_schedule,
        is_active=next_is_active,
        live_confirmed=payload.live_confirmed,
    )

    if payload.name is not None:
        instance.name = payload.name
    if payload.params is not None:
        instance.params = payload.params
    if payload.symbols is not None:
        instance.symbols = _normalize_symbols(payload.symbols)
    if payload.schedule is not None:
        instance.schedule = payload.schedule
    if payload.is_active is not None:
        instance.is_active = payload.is_active
        if payload.is_active and not instance.schedule:
            instance.schedule = settings.DEFAULT_STRATEGY_SCHEDULE
        if payload.is_active:
            instance.last_error = None

    db.commit()
    db.refresh(instance)
    return instance


def _validate_strategy_payload(
    strategy_key: str,
    *,
    symbols: list[str],
    schedule: str,
    is_active: bool,
    live_confirmed: bool,
) -> None:
    try:
        registry.get_strategy_class(strategy_key)
    except KeyError:
        raise HTTPException(400, f"Unknown strategy: {strategy_key!r}") from None

    if not is_active:
        return
    if settings.ALPACA_ENV == "live" and not live_confirmed:
        raise HTTPException(400, "Type LIVE to confirm live automated trading.")
    if not _normalize_symbols(symbols):
        raise HTTPException(422, "Active strategies require at least one symbol.")
    try:
        CronTrigger.from_crontab(schedule or settings.DEFAULT_STRATEGY_SCHEDULE)
    except ValueError as exc:
        raise HTTPException(422, f"Invalid cron schedule: {exc}") from exc


def _normalize_symbols(symbols: list[str]) -> list[str]:
    return sorted({s.strip().upper() for s in symbols if s.strip()})


def _get_instance(db: Session, user_id: int, instance_id: int) -> StrategyInstance:
    instance = (
        db.query(StrategyInstance)
        .filter(StrategyInstance.id == instance_id, StrategyInstance.user_id == user_id)
        .one_or_none()
    )
    if instance is None:
        raise HTTPException(404, "Strategy instance not found.")
    return instance

