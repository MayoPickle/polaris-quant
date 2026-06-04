"""Market data: quotes and clock."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.deps import get_broker_client
from app.brokers.base import BrokerClient
from app.schemas.order import QuoteRead

router = APIRouter()


@router.get("/clock")
def market_clock(broker: BrokerClient = Depends(get_broker_client)) -> dict:
    return {"is_open": broker.is_market_open()}


@router.get("/quote/{symbol}", response_model=QuoteRead)
def get_quote(symbol: str, broker: BrokerClient = Depends(get_broker_client)) -> QuoteRead:
    q = broker.get_quote(symbol.upper())
    return QuoteRead(
        symbol=q.symbol,
        bid_price=q.bid_price,
        ask_price=q.ask_price,
        last_price=q.last_price,
    )
