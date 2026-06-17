"""Manual order placement + order history."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import BrokerEnv, get_broker_client, get_current_user_id, get_request_broker_env
from app.brokers.base import BrokerClient, OrderRequest
from app.db.session import get_db
from app.models.order import Order
from app.schemas.order import OrderCreate, OrderRead
from app.services.order_service import (
    OrderCancelFailed,
    OrderCancelRejected,
    OrderRejected,
    OrderSubmitFailed,
    cancel_order as cancel_order_service,
    place_order,
)

router = APIRouter()


@router.get("", response_model=list[OrderRead])
def list_orders(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
    broker_env: BrokerEnv = Depends(get_request_broker_env),
) -> list[Order]:
    return (
        db.query(Order)
        .filter(Order.user_id == user_id, Order.broker_env == broker_env)
        .order_by(Order.created_at.desc())
        .all()
    )


@router.post("", response_model=OrderRead, status_code=201)
def create_order(
    payload: OrderCreate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
    broker_env: BrokerEnv = Depends(get_request_broker_env),
    broker: BrokerClient = Depends(get_broker_client),
) -> Order:
    request = OrderRequest(
        symbol=payload.symbol,
        side=payload.side,
        qty=payload.qty,
        order_type=payload.order_type,
        limit_price=payload.limit_price,
        stop_price=payload.stop_price,
        extended_hours=payload.extended_hours,
    )
    try:
        return place_order(db, broker, user_id=user_id, broker_env=broker_env, request=request)
    except OrderRejected as exc:
        # 422: well-formed request, but risk rules blocked it.
        raise HTTPException(422, str(exc))
    except OrderSubmitFailed as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Broker submit failed: {exc}")


@router.post("/{order_id}/cancel", response_model=OrderRead)
def cancel_order(
    order_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
    broker_env: BrokerEnv = Depends(get_request_broker_env),
    broker: BrokerClient = Depends(get_broker_client),
) -> Order:
    order = (
        db.query(Order)
        .filter(Order.id == order_id, Order.user_id == user_id, Order.broker_env == broker_env)
        .one_or_none()
    )
    if order is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found.")

    try:
        return cancel_order_service(db, broker, order=order)
    except OrderCancelRejected as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc))
    except OrderCancelFailed as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Broker cancel failed: {exc}")
