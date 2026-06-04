"""Pre-trade risk guard.

Every order — manual or strategy-generated — must pass `check()` before it is
sent to the broker. This is the safety layer for automated trading: a global
kill-switch plus per-order / per-position notional limits.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.brokers.base import BrokerClient, OrderRequest
from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


@dataclass
class RiskDecision:
    allowed: bool
    reason: str = ""


class RiskGuard:
    """Stateless checks driven by config thresholds.

    Daily-loss enforcement needs account state, so the broker is passed in to
    look up equity/positions when needed.
    """

    def __init__(self, broker: BrokerClient) -> None:
        self.broker = broker

    def check(self, request: OrderRequest, ref_price: float) -> RiskDecision:
        # 1. Global kill-switch.
        if not settings.TRADING_ENABLED:
            return RiskDecision(False, "Trading is disabled (TRADING_ENABLED=false)")

        notional = request.qty * ref_price

        # 2. Per-order notional cap.
        if notional > settings.MAX_ORDER_SIZE_USD:
            return RiskDecision(
                False,
                f"Order notional ${notional:.2f} exceeds MAX_ORDER_SIZE_USD "
                f"${settings.MAX_ORDER_SIZE_USD:.2f}",
            )

        # 3. Resulting position cap (only relevant when buying).
        if request.side == "buy":
            existing = next(
                (p for p in self.broker.get_positions() if p.symbol == request.symbol), None
            )
            existing_value = existing.market_value if existing else 0.0
            if existing_value + notional > settings.MAX_POSITION_SIZE_USD:
                return RiskDecision(
                    False,
                    f"Position in {request.symbol} would reach "
                    f"${existing_value + notional:.2f}, over MAX_POSITION_SIZE_USD "
                    f"${settings.MAX_POSITION_SIZE_USD:.2f}",
                )

        return RiskDecision(True)
