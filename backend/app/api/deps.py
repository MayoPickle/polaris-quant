"""Shared FastAPI dependencies.

NOTE: auth is stubbed for the skeleton — `get_current_user_id` returns a fixed
id so the rest of the API is wired and testable. Replace with real JWT auth
(decode token from the Authorization header) before any real use.
"""

from __future__ import annotations

from app.brokers.base import BrokerClient
from app.brokers.factory import get_broker


def get_current_user_id() -> int:
    # TODO: decode JWT from Authorization header and load the user.
    return 1


def get_broker_client() -> BrokerClient:
    # TODO: load per-user BrokerToken and pass decrypted credentials.
    return get_broker("alpaca")
