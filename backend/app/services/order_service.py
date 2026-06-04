"""Order placement: risk check -> broker submit -> persist.

This is the single chokepoint for sending orders. Both the manual REST endpoint
and the strategy worker call `place_order`, so the risk guard is never bypassed.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.brokers.base import BrokerClient, OrderRequest
from app.core.logging import get_logger
from app.models.order import Order
from app.risk.guard import RiskGuard

logger = get_logger(__name__)


class OrderRejected(Exception):
    """Raised when the risk guard blocks an order."""


def place_order(
    db: Session,
    broker: BrokerClient,
    *,
    user_id: int,
    request: OrderRequest,
    strategy_instance_id: int | None = None,
) -> Order:
    # Reference price for notional-based risk checks.
    quote = broker.get_quote(request.symbol)
    ref_price = quote.ask_price if request.side == "buy" else quote.bid_price
    ref_price = ref_price or quote.last_price

    decision = RiskGuard(broker).check(request, ref_price)
    if not decision.allowed:
        logger.warning("Order rejected by risk guard: %s", decision.reason)
        raise OrderRejected(decision.reason)

    result = broker.submit_order(request)

    order = Order(
        user_id=user_id,
        strategy_instance_id=strategy_instance_id,
        broker_order_id=result.broker_order_id,
        symbol=result.symbol,
        side=result.side,
        order_type=request.order_type,
        qty=result.qty,
        limit_price=request.limit_price,
        status=result.status,
        filled_qty=result.filled_qty,
        filled_avg_price=result.filled_avg_price,
        raw=result.raw,
    )
    db.add(order)
    db.commit()
    db.refresh(order)
    logger.info("Order placed: %s %s x%s -> %s", request.side, request.symbol, request.qty, order.status)
    return order
