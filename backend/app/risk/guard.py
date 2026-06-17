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
        if ref_price <= 0:
            return RiskDecision(False, "Reference price must be greater than zero.")

        notional = request.qty * ref_price

        # 2. Per-order notional cap.
        if notional > settings.MAX_ORDER_SIZE_USD:
            return RiskDecision(
                False,
                f"Order notional ${notional:.2f} exceeds MAX_ORDER_SIZE_USD "
                f"${settings.MAX_ORDER_SIZE_USD:.2f}",
            )

        positions = self.broker.get_positions()
        symbol = request.symbol.upper()

        # 3. Manual trading is long-only: sell orders can only reduce a long position.
        if request.side == "sell":
            existing = next((p for p in positions if p.symbol.upper() == symbol), None)
            existing_qty = existing.qty if existing else 0.0
            if existing_qty <= 0:
                return RiskDecision(False, f"No long position in {request.symbol} to sell.")
            if request.qty - existing_qty > 1e-9:
                return RiskDecision(
                    False,
                    f"Sell quantity {request.qty:g} exceeds long position "
                    f"{existing_qty:g} in {request.symbol}.",
                )

        # 4. Resulting position cap (only relevant when buying).
        if request.side == "buy":
            existing = next((p for p in positions if p.symbol.upper() == symbol), None)
            existing_value = max(existing.market_value, 0.0) if existing else 0.0
            if existing_value + notional > settings.MAX_POSITION_SIZE_USD:
                return RiskDecision(
                    False,
                    f"Position in {request.symbol} would reach "
                    f"${existing_value + notional:.2f}, over MAX_POSITION_SIZE_USD "
                    f"${settings.MAX_POSITION_SIZE_USD:.2f}",
                )

        return RiskDecision(True)
