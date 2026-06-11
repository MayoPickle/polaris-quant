"""Orders submitted to the broker (and their local mirror)."""

from __future__ import annotations

from sqlalchemy import JSON, Enum, Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import TimestampMixin


class Order(Base, TimestampMixin):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    strategy_instance_id: Mapped[int | None] = mapped_column(
        ForeignKey("strategy_instances.id"), nullable=True, index=True
    )

    # Broker-assigned id (None until the broker accepts the order).
    broker_order_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    broker_env: Mapped[str] = mapped_column(String(16), default="paper", index=True)

    symbol: Mapped[str] = mapped_column(String(16), index=True)
    side: Mapped[str] = mapped_column(Enum("buy", "sell", name="order_side"))
    order_type: Mapped[str] = mapped_column(
        Enum("market", "limit", "stop", "stop_limit", name="order_type"), default="market"
    )
    qty: Mapped[float] = mapped_column(Float)
    limit_price: Mapped[float | None] = mapped_column(Float, nullable=True)

    status: Mapped[str] = mapped_column(
        Enum(
            "new",
            "accepted",
            "filled",
            "partially_filled",
            "canceled",
            "rejected",
            name="order_status",
        ),
        default="new",
        index=True,
    )
    filled_qty: Mapped[float] = mapped_column(Float, default=0.0)
    filled_avg_price: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Raw broker payload for auditing / reconciliation.
    raw: Mapped[dict] = mapped_column(JSON, default=dict)
