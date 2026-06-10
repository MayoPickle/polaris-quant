"""Order placement: risk check -> broker submit -> persist.

This is the single chokepoint for sending orders. Both the manual REST endpoint
and the strategy worker call `place_order`, so the risk guard is never bypassed.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.brokers.base import BrokerClient, OrderRequest
from app.core.logging import get_logger
from app.models.order import Order
from app.risk.guard import RiskGuard

logger = get_logger(__name__)


class OrderRejected(Exception):
    """Raised when the risk guard blocks an order."""


class OrderCancelRejected(Exception):
    """Raised when an order is not eligible for cancellation."""


class OrderCancelFailed(Exception):
    """Raised when the broker rejects or fails a cancellation request."""


CANCELABLE_ORDER_STATUSES = {"new", "accepted", "partially_filled"}
LOCAL_ORDER_STATUSES = {
    "new",
    "accepted",
    "filled",
    "partially_filled",
    "canceled",
    "rejected",
}
BROKER_STATUS_ALIASES = {
    "pending_new": "new",
    "accepted_for_bidding": "accepted",
    "pending_cancel": "accepted",
    "pending_replace": "accepted",
    "replaced": "accepted",
    "stopped": "accepted",
    "suspended": "accepted",
    "done_for_day": "accepted",
    "calculated": "filled",
    "expired": "canceled",
    "cancelled": "canceled",
}


def place_order(
    db: Session,
    broker: BrokerClient,
    *,
    user_id: int,
    request: OrderRequest,
    strategy_instance_id: int | None = None,
) -> Order:
    # Reference price for notional-based risk checks.
    if request.order_type == "limit" and request.limit_price:
        ref_price = request.limit_price
    else:
        quote = broker.get_quote(request.symbol)
        ref_price = quote.ask_price if request.side == "buy" else quote.bid_price
        ref_price = ref_price or quote.last_price

    decision = RiskGuard(broker).check(request, ref_price)
    if not decision.allowed:
        logger.warning("Order rejected by risk guard: %s", decision.reason)
        raise OrderRejected(decision.reason)

    result = broker.submit_order(request)

    status = normalize_order_status(result.status)
    raw = {**(result.raw or {}), "broker_status": result.status}

    order = Order(
        user_id=user_id,
        strategy_instance_id=strategy_instance_id,
        broker_order_id=result.broker_order_id,
        symbol=result.symbol,
        side=result.side,
        order_type=request.order_type,
        qty=result.qty,
        limit_price=request.limit_price,
        status=status,
        filled_qty=result.filled_qty,
        filled_avg_price=result.filled_avg_price,
        raw=raw,
    )
    db.add(order)
    db.commit()
    db.refresh(order)
    logger.info("Order placed: %s %s x%s -> %s", request.side, request.symbol, request.qty, order.status)
    return order


def cancel_order(db: Session, broker: BrokerClient, *, order: Order) -> Order:
    if not order.broker_order_id:
        raise OrderCancelRejected("Order has no broker id and cannot be canceled.")
    if order.status not in CANCELABLE_ORDER_STATUSES:
        raise OrderCancelRejected(f"Order status {order.status!r} cannot be canceled.")

    try:
        broker.cancel_order(order.broker_order_id)
    except Exception as exc:  # noqa: BLE001 - broker SDKs raise provider-specific errors.
        logger.warning("Order cancel failed for %s: %s", order.broker_order_id, exc)
        raise OrderCancelFailed(str(exc)) from exc

    previous_status = order.status
    order.status = "canceled"
    order.raw = {
        **(order.raw or {}),
        "cancel_requested_at": datetime.now(timezone.utc).isoformat(),
        "cancel_previous_status": previous_status,
    }
    db.commit()
    db.refresh(order)
    logger.info("Order canceled: %s %s x%s", order.side, order.symbol, order.qty)
    return order


def normalize_order_status(status: str) -> str:
    normalized = status.strip().lower()
    if normalized in LOCAL_ORDER_STATUSES:
        return normalized
    return BROKER_STATUS_ALIASES.get(normalized, "accepted")
