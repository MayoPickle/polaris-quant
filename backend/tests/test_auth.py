"""Authentication endpoints and protected API access."""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.security import SESSION_COOKIE_NAME, create_access_token, hash_password, verify_password
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.user import User


@pytest.fixture
def auth_context() -> Iterator[tuple[TestClient, sessionmaker]]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)

    def override_db() -> Iterator:
        db = Session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_db
    client = TestClient(app)
    try:
        yield client, Session
    finally:
        app.dependency_overrides.pop(get_db, None)


def test_setup_status_detects_empty_and_placeholder_users(auth_context) -> None:
    client, Session = auth_context

    assert client.get("/api/v1/auth/setup-status").json() == {"needs_setup": True}

    with Session() as db:
        db.add(User(id=1, email="dev@example.local", hashed_password="dev-placeholder"))
        db.commit()

    assert client.get("/api/v1/auth/setup-status").json() == {"needs_setup": True}


def test_setup_updates_placeholder_user_and_sets_session_cookie(auth_context) -> None:
    client, Session = auth_context
    with Session() as db:
        db.add(User(id=1, email="dev@example.local", hashed_password="dev-placeholder"))
        db.commit()

    resp = client.post(
        "/api/v1/auth/setup",
        json={"email": "Admin@Example.com", "password": "secret123"},
    )

    assert resp.status_code == 201
    assert resp.json() == {"id": 1, "email": "admin@example.com"}
    assert SESSION_COOKIE_NAME in resp.cookies
    with Session() as db:
        user = db.get(User, 1)
        assert user is not None
        assert user.email == "admin@example.com"
        assert user.hashed_password != "secret123"
        assert verify_password("secret123", user.hashed_password)


def test_setup_is_closed_after_real_user_exists(auth_context) -> None:
    client, Session = auth_context
    with Session() as db:
        db.add(User(id=1, email="admin@example.com", hashed_password=hash_password("secret123")))
        db.commit()

    resp = client.post(
        "/api/v1/auth/setup",
        json={"email": "next@example.com", "password": "secret123"},
    )

    assert resp.status_code == 409
    assert client.get("/api/v1/auth/setup-status").json() == {"needs_setup": False}


def test_login_me_and_logout(auth_context) -> None:
    client, Session = auth_context
    with Session() as db:
        db.add(User(id=1, email="admin@example.com", hashed_password=hash_password("secret123")))
        db.commit()

    wrong = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@example.com", "password": "wrong"},
    )
    assert wrong.status_code == 401

    login = client.post(
        "/api/v1/auth/login",
        json={"email": "ADMIN@example.com", "password": "secret123"},
    )
    assert login.status_code == 200
    assert SESSION_COOKIE_NAME in login.cookies
    assert client.get("/api/v1/auth/me").json() == {"id": 1, "email": "admin@example.com"}

    logout = client.post("/api/v1/auth/logout")
    assert logout.status_code == 200
    assert client.get("/api/v1/auth/me").status_code == 401


def test_inactive_user_cannot_login(auth_context) -> None:
    client, Session = auth_context
    with Session() as db:
        db.add(
            User(
                id=1,
                email="admin@example.com",
                hashed_password=hash_password("secret123"),
                is_active=False,
            )
        )
        db.commit()

    resp = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@example.com", "password": "secret123"},
    )

    assert resp.status_code == 403


def test_protected_api_requires_session_or_bearer_token(auth_context) -> None:
    client, Session = auth_context
    with Session() as db:
        db.add(User(id=1, email="admin@example.com", hashed_password=hash_password("secret123")))
        db.commit()

    assert client.get("/api/v1/strategies/available").status_code == 401

    token = create_access_token("1")
    resp = client.get(
        "/api/v1/strategies/available",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert resp.status_code == 200
    assert any(item["key"] == "sma_cross" for item in resp.json())
