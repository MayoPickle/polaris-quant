"""Shared FastAPI dependencies."""

from __future__ import annotations

from typing import Literal

import jwt
from fastapi import Cookie, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.brokers.base import BrokerClient
from app.brokers.factory import get_broker
from app.core.config import settings
from app.core.security import SESSION_COOKIE_NAME, decode_access_token
from app.db.session import get_db
from app.models.user import User

BrokerEnv = Literal["paper", "live"]
BROKER_ENV_COOKIE_NAME = "polaris_broker_env"
BROKER_ENV_HEADER_NAME = "X-Polaris-Broker-Env"
VALID_BROKER_ENVS = {"paper", "live"}


def get_current_user_id(
    db: Session = Depends(get_db),
    session_token: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: str | None = Header(default=None),
) -> int:
    token = session_token or _bearer_token(authorization)
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated.")

    try:
        payload = decode_access_token(token)
        user_id = int(payload.get("sub", ""))
    except (jwt.PyJWTError, TypeError, ValueError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid session.")

    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid session.")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "User is inactive.")
    return user.id


def get_request_broker_env(
    cookie_env: str | None = Cookie(default=None, alias=BROKER_ENV_COOKIE_NAME),
    header_env: str | None = Header(default=None, alias=BROKER_ENV_HEADER_NAME),
) -> BrokerEnv:
    raw_env = (header_env or cookie_env or settings.ALPACA_ENV).strip().lower()
    if raw_env not in VALID_BROKER_ENVS:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Invalid broker environment: {raw_env!r}",
        )
    return raw_env  # type: ignore[return-value]


def get_broker_client(
    broker_env: BrokerEnv = Depends(get_request_broker_env),
) -> BrokerClient:
    # TODO: load per-user BrokerToken and pass decrypted credentials.
    return get_broker("alpaca", paper=broker_env == "paper")


def _bearer_token(authorization: str | None) -> str | None:
    if not authorization:
        return None
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None
    return token.strip()
