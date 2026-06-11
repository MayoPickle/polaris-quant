"""Resolve a concrete BrokerClient from credentials/config.

This is the single place that knows which broker classes exist. Add new brokers
here; callers stay decoupled behind `BrokerClient`.
"""

from __future__ import annotations

from app.brokers.alpaca.client import AlpacaClient
from app.brokers.base import BrokerClient
from app.core.config import settings


def get_broker(
    broker: str = "alpaca",
    *,
    api_key: str | None = None,
    api_secret: str | None = None,
    paper: bool | None = None,
) -> BrokerClient:
    if broker == "alpaca":
        resolved_paper = settings.is_paper if paper is None else paper
        return AlpacaClient(
            api_key=api_key or settings.alpaca_api_key_for_env(paper=resolved_paper),
            api_secret=api_secret or settings.alpaca_api_secret_for_env(paper=resolved_paper),
            paper=resolved_paper,
        )
    raise ValueError(f"Unknown broker: {broker!r}")
