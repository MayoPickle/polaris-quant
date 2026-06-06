from collections.abc import Iterator
from contextlib import contextmanager

from app.api.deps import get_broker_client, get_current_user_id
from app.brokers.base import Account, Bar, OrderRequest, OrderResult, Position, Quote
from app.main import app


class FakeMarketBroker:
    def __init__(self) -> None:
        self.calls: list[dict] = []

    def is_market_open(self) -> bool:
        return True

    def get_quote(self, symbol: str) -> Quote:
        return Quote(symbol=symbol, bid_price=100, ask_price=101, last_price=100.5)

    def get_bars(self, symbol: str, *, timeframe="1Day", start=None, end=None) -> list[Bar]:
        self.calls.append({"symbol": symbol, "timeframe": timeframe, "start": start, "end": end})
        base = 100 if symbol == "AAPL" else 200
        return [
            Bar(
                timestamp="2026-01-01T00:00:00+00:00",
                open=base,
                high=base + 2,
                low=base - 1,
                close=base + 1,
                volume=1_000,
            ),
            Bar(
                timestamp="2026-01-02T00:00:00+00:00",
                open=base + 1,
                high=base + 3,
                low=base,
                close=base + 2,
                volume=1_500,
            ),
        ]

    def get_account(self) -> Account:
        return Account(cash=100_000, equity=100_000, buying_power=100_000)

    def get_positions(self) -> list[Position]:
        return []

    def submit_order(self, request: OrderRequest) -> OrderResult:
        raise NotImplementedError

    def get_order(self, broker_order_id: str) -> OrderResult:
        raise NotImplementedError

    def cancel_order(self, broker_order_id: str) -> None:
        raise NotImplementedError


@contextmanager
def broker_override(broker: FakeMarketBroker) -> Iterator[None]:
    app.dependency_overrides[get_broker_client] = lambda: broker
    try:
        yield
    finally:
        app.dependency_overrides.pop(get_broker_client, None)


@contextmanager
def auth_override(user_id: int = 1) -> Iterator[None]:
    app.dependency_overrides[get_current_user_id] = lambda: user_id
    try:
        yield
    finally:
        app.dependency_overrides.pop(get_current_user_id, None)

