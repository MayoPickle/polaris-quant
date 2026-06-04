"""Manual order placement + order history."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_broker_client, get_current_user_id
from app.brokers.base import BrokerClient, OrderRequest
from app.db.session import get_db
from app.models.order import Order
from app.schemas.order import OrderCreate, OrderRead
from app.services.order_service import OrderRejected, place_order

router = APIRouter()


@router.get("", response_model=list[OrderRead])
def list_orders(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> list[Order]:
    return (
        db.query(Order)
        .filter(Order.user_id == user_id)
        .order_by(Order.created_at.desc())
        .all()
    )


@router.post("", response_model=OrderRead, status_code=201)
def create_order(
    payload: OrderCreate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
    broker: BrokerClient = Depends(get_broker_client),
) -> Order:
    request = OrderRequest(
        symbol=payload.symbol,
        side=payload.side,
        qty=payload.qty,
        order_type=payload.order_type,
        limit_price=payload.limit_price,
    )
    try:
        return place_order(db, broker, user_id=user_id, request=request)
    except OrderRejected as exc:
        # 422: well-formed request, but risk rules blocked it.
        raise HTTPException(422, str(exc))
