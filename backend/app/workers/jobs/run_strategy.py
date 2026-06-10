"""Job: run one active strategy instance and act on its signals.

Flow: load instance -> fetch recent bars -> strategy.generate_signals ->
position sizing -> place_order (which enforces risk).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.brokers.base import BrokerClient, OrderRequest, Position
from app.brokers.factory import get_broker
from app.core.config import settings
from app.core.logging import get_logger
from app.models.strategy import Signal as SignalModel
from app.models.strategy import StrategyInstance
from app.services.order_service import OrderRejected, place_order
from app.services.position_sizing_service import decide_position_allocation
from app.strategies import registry
from app.strategies.base import Bar, Signal

logger = get_logger(__name__)


def fetch_recent_bars(
    broker: BrokerClient,
    symbols: list[str],
    *,
    timeframe: str = settings.STRATEGY_TIMEFRAME,
) -> dict[str, list[Bar]]:
    end = datetime.now(timezone.utc) - timedelta(minutes=settings.STRATEGY_DATA_DELAY_MINUTES)
    start = end - timedelta(days=settings.STRATEGY_LOOKBACK_DAYS)
    bars_by_symbol: dict[str, list[Bar]] = {}
    for symbol in symbols:
        try:
            bars_by_symbol[symbol] = broker.get_bars(
                symbol,
                timeframe=timeframe,
                start=start,
                end=end,
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("Could not fetch bars for %s: %s", symbol, exc)
            bars_by_symbol[symbol] = []
    return bars_by_symbol


def run_strategy_instance(db: Session, instance_id: int, broker: BrokerClient | None = None) -> None:
    instance = db.get(StrategyInstance, instance_id)
    if instance is None or not instance.is_active:
        logger.info("Strategy %s missing or inactive; skipping", instance_id)
        return

    broker = broker or get_broker("alpaca")
    instance.last_run_at = datetime.now(timezone.utc)
    instance.last_error = None
    db.commit()

    if not broker.is_market_open():
        for symbol in instance.symbols:
            _record_signal_audit(
                db,
                instance=instance,
                symbol=symbol,
                side="hold",
                status="skipped",
                reason="market_closed",
            )
        logger.info("Market closed; skipping strategy %s", instance_id)
        return

    try:
        strategy = registry.create_strategy(instance.strategy_key, instance.params)
        bars = fetch_recent_bars(broker, instance.symbols)
        signals = strategy.generate_signals(bars)
        account = broker.get_account()
        positions = broker.get_positions()
    except Exception as exc:  # noqa: BLE001
        instance.last_error = str(exc)
        db.commit()
        logger.exception("Strategy %s failed before signal execution", instance_id)
        return

    if not signals:
        for symbol in instance.symbols:
            _record_signal_audit(
                db,
                instance=instance,
                symbol=symbol,
                side="hold",
                status="no_signal",
                reason="strategy returned no actionable signal",
            )
        return

    for sig in signals:
        if sig.side == "hold":
            _record_signal_audit(
                db,
                instance=instance,
                symbol=sig.symbol,
                side="hold",
                qty=sig.qty,
                status="no_signal",
                reason="strategy returned hold",
                strategy_meta=sig.meta,
            )
            continue
        symbol_bars = bars.get(sig.symbol, [])
        if not symbol_bars:
            _record_signal_audit(
                db,
                instance=instance,
                symbol=sig.symbol,
                side=sig.side,
                qty=sig.qty,
                status="skipped",
                reason="no market bars available",
                strategy_meta=sig.meta,
            )
            continue
        latest_bar = symbol_bars[-1]
        signal_key = f"{instance.id}:{sig.symbol}:{sig.side}:{latest_bar.timestamp}"
        if _already_processed(db, instance.id, sig.symbol, sig.side, signal_key):
            _record_signal_audit(
                db,
                instance=instance,
                symbol=sig.symbol,
                side=sig.side,
                qty=sig.qty,
                status="skipped",
                reason="duplicate signal",
                strategy_meta=sig.meta,
                signal_key=signal_key,
                bar_timestamp=latest_bar.timestamp,
            )
            logger.info("Duplicate signal skipped: %s", signal_key)
            continue

        decision = decide_position_allocation(
            instance=instance,
            signal=sig,
            latest_bar=latest_bar,
            account=account,
            positions=positions,
        )
        qty = _qty_for_signal(sig, latest_bar, account.equity, positions, decision.allocation_pct)
        audit = SignalModel(
            strategy_instance_id=instance.id,
            symbol=sig.symbol,
            side=sig.side,
            qty=qty,
            meta={
                "signal_key": signal_key,
                "bar_timestamp": latest_bar.timestamp,
                "strategy_meta": sig.meta,
                "allocation_pct": decision.allocation_pct,
                "allocation_source": decision.source,
                "allocation_rationale": decision.rationale,
                "status": "pending",
            },
        )
        db.add(audit)
        db.commit()
        db.refresh(audit)

        if qty <= 0:
            audit.meta = {**audit.meta, "status": "skipped", "reason": "no long position to sell"}
            db.commit()
            continue

        request = OrderRequest(symbol=sig.symbol, side=sig.side, qty=qty)
        try:
            order = place_order(
                db, broker, user_id=instance.user_id, request=request,
                strategy_instance_id=instance.id,
            )
            audit.meta = {
                **audit.meta,
                "status": "submitted",
                "order_id": order.id,
                "broker_order_id": order.broker_order_id,
            }
            db.commit()
        except OrderRejected as exc:
            audit.meta = {**audit.meta, "status": "rejected", "reason": str(exc)}
            db.commit()
            logger.warning("Signal for %s blocked by risk guard: %s", sig.symbol, exc)


def _already_processed(
    db: Session,
    strategy_instance_id: int,
    symbol: str,
    side: str,
    signal_key: str,
) -> bool:
    rows = (
        db.query(SignalModel)
        .filter(
            SignalModel.strategy_instance_id == strategy_instance_id,
            SignalModel.symbol == symbol,
            SignalModel.side == side,
        )
        .order_by(SignalModel.created_at.desc())
        .limit(50)
        .all()
    )
    return any((row.meta or {}).get("signal_key") == signal_key for row in rows)


def _record_signal_audit(
    db: Session,
    *,
    instance: StrategyInstance,
    symbol: str,
    side: str,
    status: str,
    reason: str,
    qty: float = 0.0,
    strategy_meta: dict | None = None,
    signal_key: str | None = None,
    bar_timestamp: str | None = None,
) -> SignalModel:
    meta = {
        "status": status,
        "reason": reason,
        "strategy_meta": strategy_meta or {},
    }
    if signal_key:
        meta["signal_key"] = signal_key
    if bar_timestamp:
        meta["bar_timestamp"] = bar_timestamp
    audit = SignalModel(
        strategy_instance_id=instance.id,
        symbol=symbol,
        side=side,
        qty=qty,
        meta=meta,
    )
    db.add(audit)
    db.commit()
    db.refresh(audit)
    return audit


def _qty_for_signal(
    signal: Signal,
    latest_bar: Bar,
    account_equity: float,
    positions: list[Position],
    allocation_pct: float,
) -> float:
    ref_price = latest_bar.close
    if ref_price <= 0:
        return 0.0
    notional = account_equity * allocation_pct / 100
    qty = notional / ref_price
    if signal.side == "sell":
        existing = next((p for p in positions if p.symbol == signal.symbol), None)
        if existing is None or existing.qty <= 0:
            return 0.0
        qty = min(qty, existing.qty)
    return round(qty, 6)
