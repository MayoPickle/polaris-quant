"""Lightweight application authentication."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_current_user_id
from app.core.config import settings
from app.core.security import (
    SESSION_COOKIE_NAME,
    create_access_token,
    hash_password,
    verify_password,
)
from app.db.session import get_db
from app.models.user import User

router = APIRouter()

_DEV_USER_EMAIL = "dev@example.local"
_DEV_PLACEHOLDER_HASH = "dev-placeholder"


class SetupStatusRead(BaseModel):
    needs_setup: bool


class AuthUserRead(BaseModel):
    id: int
    email: str


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=1, max_length=256)


class SetupRequest(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=8, max_length=256)


@router.get("/setup-status", response_model=SetupStatusRead)
def setup_status(db: Session = Depends(get_db)) -> SetupStatusRead:
    return SetupStatusRead(needs_setup=_needs_setup(db))


@router.post("/setup", response_model=AuthUserRead, status_code=status.HTTP_201_CREATED)
def setup(
    payload: SetupRequest,
    response: Response,
    db: Session = Depends(get_db),
) -> AuthUserRead:
    if not _needs_setup(db):
        raise HTTPException(status.HTTP_409_CONFLICT, "Application setup is already complete.")

    email = _normalize_email(payload.email)
    if not _looks_like_email(email):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Invalid email address.")

    user = _placeholder_user(db)
    if user is None:
        user = User(email=email, hashed_password=hash_password(payload.password), is_active=True)
        db.add(user)
    else:
        user.email = email
        user.hashed_password = hash_password(payload.password)
        user.is_active = True
        user.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(user)
    _set_session_cookie(response, user.id)
    return AuthUserRead(id=user.id, email=user.email)


@router.post("/login", response_model=AuthUserRead)
def login(
    payload: LoginRequest,
    response: Response,
    db: Session = Depends(get_db),
) -> AuthUserRead:
    email = _normalize_email(payload.email)
    user = _user_by_email(db, email)
    if user is None or not _verify_password(payload.password, user.hashed_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password.")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "User is inactive.")

    _set_session_cookie(response, user.id)
    return AuthUserRead(id=user.id, email=user.email)


@router.post("/logout")
def logout(response: Response) -> dict[str, bool]:
    _clear_session_cookie(response)
    return {"ok": True}


@router.get("/me", response_model=AuthUserRead)
def me(
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
) -> AuthUserRead:
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated.")
    return AuthUserRead(id=user.id, email=user.email)


def _needs_setup(db: Session) -> bool:
    return _real_user_count(db) == 0


def _real_user_count(db: Session) -> int:
    return (
        db.query(User)
        .filter(
            ~(
                (User.email == _DEV_USER_EMAIL)
                & (User.hashed_password == _DEV_PLACEHOLDER_HASH)
            )
        )
        .count()
    )


def _placeholder_user(db: Session) -> User | None:
    return (
        db.query(User)
        .filter(User.email == _DEV_USER_EMAIL, User.hashed_password == _DEV_PLACEHOLDER_HASH)
        .one_or_none()
    )


def _user_by_email(db: Session, email: str) -> User | None:
    return db.query(User).filter(func.lower(User.email) == email).one_or_none()


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _looks_like_email(email: str) -> bool:
    return "@" in email and "." in email.rsplit("@", 1)[-1]


def _verify_password(plain: str, hashed: str) -> bool:
    try:
        return verify_password(plain, hashed)
    except Exception:  # noqa: BLE001 - malformed legacy placeholders should not authenticate.
        return False


def _set_session_cookie(response: Response, user_id: int) -> None:
    token = create_access_token(str(user_id))
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        httponly=True,
        secure=settings.ENV == "production",
        samesite="lax",
        path="/",
    )


def _clear_session_cookie(response: Response) -> None:
    response.delete_cookie(
        key=SESSION_COOKIE_NAME,
        httponly=True,
        secure=settings.ENV == "production",
        samesite="lax",
        path="/",
    )
