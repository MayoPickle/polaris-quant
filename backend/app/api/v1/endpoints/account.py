"""Account summary from the broker."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.deps import get_broker_client
from app.brokers.base import BrokerClient
from app.schemas.order import AccountRead

router = APIRouter()


@router.get("", response_model=AccountRead)
def get_account(broker: BrokerClient = Depends(get_broker_client)) -> AccountRead:
    a = broker.get_account()
    return AccountRead(cash=a.cash, equity=a.equity, buying_power=a.buying_power)
