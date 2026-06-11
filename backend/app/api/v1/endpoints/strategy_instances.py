"""User strategy instance endpoints."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy.orm import Session

from app.api.deps import BrokerEnv, get_current_user_id, get_request_broker_env
from app.core.config import settings
from app.db.session import get_db
from app.models.strategy import Signal as SignalModel
from app.models.strategy import StrategyInstance
from app.schemas.strategy import (
    StrategyInstanceCreate,
    StrategyInstanceRead,
    StrategyInstanceUpdate,
    StrategySignalRead,
)
from app.strategies import registry

router = APIRouter()


@router.get("", response_model=list[StrategyInstanceRead])
def list_instances(
    include_archived: bool = False,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
    broker_env: BrokerEnv = Depends(get_request_broker_env),
) -> list[StrategyInstance]:
    query = db.query(StrategyInstance).filter(
        StrategyInstance.user_id == user_id,
        StrategyInstance.broker_env == broker_env,
    )
    if not include_archived:
        query = query.filter(StrategyInstance.archived_at.is_(None))
    return query.order_by(StrategyInstance.created_at.desc(), StrategyInstance.id.desc()).all()


@router.post("", response_model=StrategyInstanceRead, status_code=201)
def create_instance(
    payload: StrategyInstanceCreate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
    broker_env: BrokerEnv = Depends(get_request_broker_env),
) -> StrategyInstance:
    _validate_strategy_payload(
        payload.strategy_key,
        symbols=payload.symbols,
        schedule=payload.schedule,
        is_active=payload.is_active,
        live_confirmed=payload.live_confirmed,
        broker_env=broker_env,
    )

    data = payload.model_dump(exclude={"live_confirmed"})
    if data["is_active"] and not data["schedule"]:
        data["schedule"] = settings.DEFAULT_STRATEGY_SCHEDULE
    data["symbols"] = _normalize_symbols(data["symbols"])

    instance = StrategyInstance(user_id=user_id, broker_env=broker_env, **data)
    db.add(instance)
    db.commit()
    db.refresh(instance)
    return instance


@router.get("/signals", response_model=list[StrategySignalRead])
def list_signals(
    strategy_instance_id: int | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
    broker_env: BrokerEnv = Depends(get_request_broker_env),
) -> list[StrategySignalRead]:
    query = (
        db.query(SignalModel, StrategyInstance)
        .join(StrategyInstance, SignalModel.strategy_instance_id == StrategyInstance.id)
        .filter(StrategyInstance.user_id == user_id, StrategyInstance.broker_env == broker_env)
    )
    if strategy_instance_id is not None:
        query = query.filter(SignalModel.strategy_instance_id == strategy_instance_id)

    rows = (
        query.order_by(SignalModel.created_at.desc(), SignalModel.id.desc())
        .limit(limit)
        .all()
    )
    return [_signal_read(signal, instance) for signal, instance in rows]


@router.patch("/{instance_id}", response_model=StrategyInstanceRead)
def update_instance(
    instance_id: int,
    payload: StrategyInstanceUpdate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
    broker_env: BrokerEnv = Depends(get_request_broker_env),
) -> StrategyInstance:
    instance = _get_instance(db, user_id, broker_env, instance_id)
    if instance.archived_at is not None:
        raise HTTPException(409, "Archived strategy cannot be modified.")
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
        broker_env=broker_env,
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


@router.delete("/{instance_id}", response_model=StrategyInstanceRead)
def archive_instance(
    instance_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
    broker_env: BrokerEnv = Depends(get_request_broker_env),
) -> StrategyInstance:
    instance = _get_instance(db, user_id, broker_env, instance_id)
    if instance.is_active:
        raise HTTPException(409, "Active strategies must be paused before archiving.")
    if instance.archived_at is None:
        instance.archived_at = datetime.now(timezone.utc)
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
    broker_env: BrokerEnv,
) -> None:
    try:
        registry.get_strategy_class(strategy_key)
    except KeyError:
        raise HTTPException(400, f"Unknown strategy: {strategy_key!r}") from None

    if not is_active:
        return
    if broker_env == "live" and not live_confirmed:
        raise HTTPException(400, "Type LIVE to confirm live automated trading.")
    if not _normalize_symbols(symbols):
        raise HTTPException(422, "Active strategies require at least one symbol.")
    try:
        CronTrigger.from_crontab(schedule or settings.DEFAULT_STRATEGY_SCHEDULE)
    except ValueError as exc:
        raise HTTPException(422, f"Invalid cron schedule: {exc}") from exc


def _normalize_symbols(symbols: list[str]) -> list[str]:
    return sorted({s.strip().upper() for s in symbols if s.strip()})


def _get_instance(
    db: Session,
    user_id: int,
    broker_env: BrokerEnv,
    instance_id: int,
) -> StrategyInstance:
    instance = (
        db.query(StrategyInstance)
        .filter(
            StrategyInstance.id == instance_id,
            StrategyInstance.user_id == user_id,
            StrategyInstance.broker_env == broker_env,
        )
        .one_or_none()
    )
    if instance is None:
        raise HTTPException(404, "Strategy instance not found.")
    return instance


def _signal_read(signal: SignalModel, instance: StrategyInstance) -> StrategySignalRead:
    meta = signal.meta or {}
    return StrategySignalRead(
        id=signal.id,
        strategy_instance_id=signal.strategy_instance_id,
        strategy_name=instance.name,
        strategy_key=instance.strategy_key,
        symbol=signal.symbol,
        side=signal.side,
        qty=signal.qty,
        status=str(meta.get("status") or "unknown"),
        reason=_optional_str(meta.get("reason")),
        allocation_pct=_optional_float(meta.get("allocation_pct")),
        allocation_source=_optional_str(meta.get("allocation_source")),
        allocation_rationale=_optional_str(meta.get("allocation_rationale")),
        bar_timestamp=_optional_str(meta.get("bar_timestamp")),
        order_id=_optional_int(meta.get("order_id")),
        broker_order_id=_optional_str(meta.get("broker_order_id")),
        created_at=signal.created_at,
    )


def _optional_str(value: object) -> str | None:
    if value is None:
        return None
    return str(value)


def _optional_float(value: object) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _optional_int(value: object) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None
