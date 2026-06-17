"""Order placement: risk check -> broker submit -> persist.

This is the single chokepoint for sending orders. Both the manual REST endpoint
and the strategy worker call `place_order`, so the risk guard is never bypassed.
"""

from __future__ import annotations

from dataclasses import replace
from datetime import datetime, timezone
import re
from uuid import uuid4

from sqlalchemy.orm import Session

from app.brokers.base import BrokerClient, OrderRequest
from app.core.logging import get_logger
from app.models.order import Order
from app.risk.guard import RiskGuard

logger = get_logger(__name__)


class OrderRejected(Exception):
    """Raised when the risk guard blocks an order."""


class OrderSubmitFailed(Exception):
    """Raised when the broker rejects or fails an order submission."""


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
_SYMBOL_RE = re.compile(r"^[A-Z][A-Z0-9.-]{0,14}$")


def place_order(
    db: Session,
    broker: BrokerClient,
    *,
    user_id: int,
    broker_env: str,
    request: OrderRequest,
    strategy_instance_id: int | None = None,
) -> Order:
    request = replace(
        request,
        symbol=normalize_order_symbol(request.symbol),
        client_order_id=request.client_order_id or _generate_client_order_id(broker_env),
    )
    ref_price = _reference_price(broker, request)

    decision = RiskGuard(broker).check(request, ref_price)
    if not decision.allowed:
        logger.warning("Order rejected by risk guard: %s", decision.reason)
        raise OrderRejected(decision.reason)

    order = _create_pending_order(
        db,
        user_id=user_id,
        broker_env=broker_env,
        request=request,
        strategy_instance_id=strategy_instance_id,
    )

    try:
        result = broker.submit_order(request)
    except Exception as exc:  # noqa: BLE001 - broker SDKs raise provider-specific errors.
        _mark_order_rejected(db, order, str(exc))
        logger.warning("Order submit failed for %s: %s", request.client_order_id, exc)
        raise OrderSubmitFailed(str(exc)) from exc

    order.broker_order_id = result.broker_order_id
    order.symbol = request.symbol
    order.side = result.side
    order.qty = result.qty
    order.status = normalize_order_status(result.status)
    order.filled_qty = result.filled_qty
    order.filled_avg_price = result.filled_avg_price
    order.raw = {
        **(order.raw or {}),
        **(result.raw or {}),
        "broker_status": result.status,
    }
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


def normalize_order_symbol(symbol: str) -> str:
    normalized = symbol.strip().upper()
    if not _SYMBOL_RE.fullmatch(normalized):
        raise OrderRejected(f"Invalid symbol: {symbol!r}")
    return normalized


def _generate_client_order_id(broker_env: str) -> str:
    return f"pq-{broker_env}-{uuid4().hex}"


def _reference_price(broker: BrokerClient, request: OrderRequest) -> float:
    if request.order_type == "limit":
        if request.limit_price is None:
            raise OrderRejected("Limit orders require a limit price greater than zero.")
        return request.limit_price
    if request.order_type == "stop":
        if request.stop_price is None:
            raise OrderRejected("Stop orders require a stop price greater than zero.")
        return request.stop_price
    if request.order_type == "stop_limit":
        if request.stop_price is None:
            raise OrderRejected("Stop-limit orders require a stop price greater than zero.")
        if request.limit_price is None:
            raise OrderRejected("Stop-limit orders require a limit price greater than zero.")
        return request.limit_price

    quote = broker.get_quote(request.symbol)
    ref_price = quote.ask_price if request.side == "buy" else quote.bid_price
    return ref_price or quote.last_price


def _create_pending_order(
    db: Session,
    *,
    user_id: int,
    broker_env: str,
    request: OrderRequest,
    strategy_instance_id: int | None,
) -> Order:
    order = Order(
        user_id=user_id,
        strategy_instance_id=strategy_instance_id,
        broker_order_id=None,
        client_order_id=request.client_order_id,
        broker_env=broker_env,
        symbol=request.symbol,
        side=request.side,
        order_type=request.order_type,
        qty=request.qty,
        limit_price=request.limit_price,
        stop_price=request.stop_price,
        status="new",
        filled_qty=0,
        filled_avg_price=None,
        raw={
            "client_order_id": request.client_order_id,
            "extended_hours": request.extended_hours,
        },
    )
    db.add(order)
    db.commit()
    db.refresh(order)
    return order


def _mark_order_rejected(db: Session, order: Order, reason: str) -> None:
    order.status = "rejected"
    order.raw = {
        **(order.raw or {}),
        "submit_error": reason,
        "submit_failed_at": datetime.now(timezone.utc).isoformat(),
    }
    db.commit()
    db.refresh(order)
