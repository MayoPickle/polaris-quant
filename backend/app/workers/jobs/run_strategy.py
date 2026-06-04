"""Job: run one active strategy instance and act on its signals.

Flow: load instance -> fetch recent bars -> strategy.generate_signals ->
for each signal, place_order (which enforces risk). Market-data fetching is
left as a TODO so the skeleton stays broker-light; wire it to the Alpaca data
client next.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.brokers.base import OrderRequest
from app.brokers.factory import get_broker
from app.core.logging import get_logger
from app.models.strategy import StrategyInstance
from app.services.order_service import OrderRejected, place_order
from app.strategies import registry
from app.strategies.base import Bar

logger = get_logger(__name__)


def fetch_recent_bars(symbols: list[str]) -> dict[str, list[Bar]]:
    # TODO: pull historical bars from the Alpaca data client.
    return {symbol: [] for symbol in symbols}


def run_strategy_instance(db: Session, instance_id: int) -> None:
    instance = db.get(StrategyInstance, instance_id)
    if instance is None or not instance.is_active:
        logger.info("Strategy %s missing or inactive; skipping", instance_id)
        return

    broker = get_broker("alpaca")
    if not broker.is_market_open():
        logger.info("Market closed; skipping strategy %s", instance_id)
        return

    strategy = registry.create_strategy(instance.strategy_key, instance.params)
    bars = fetch_recent_bars(instance.symbols)
    signals = strategy.generate_signals(bars)

    for sig in signals:
        if sig.side == "hold" or sig.qty <= 0:
            continue
        request = OrderRequest(symbol=sig.symbol, side=sig.side, qty=sig.qty)
        try:
            place_order(
                db, broker, user_id=instance.user_id, request=request,
                strategy_instance_id=instance.id,
            )
        except OrderRejected as exc:
            logger.warning("Signal for %s blocked by risk guard: %s", sig.symbol, exc)
