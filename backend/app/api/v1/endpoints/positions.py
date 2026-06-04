"""Live positions from the broker."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.deps import get_broker_client
from app.brokers.base import BrokerClient
from app.schemas.order import PositionRead

router = APIRouter()


@router.get("", response_model=list[PositionRead])
def list_positions(broker: BrokerClient = Depends(get_broker_client)) -> list[PositionRead]:
    return [
        PositionRead(
            symbol=p.symbol,
            qty=p.qty,
            avg_entry_price=p.avg_entry_price,
            market_value=p.market_value,
            unrealized_pl=p.unrealized_pl,
        )
        for p in broker.get_positions()
    ]
