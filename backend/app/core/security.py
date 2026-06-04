"""Security helpers: password hashing, JWT, and broker-credential encryption."""

from datetime import datetime, timedelta, timezone

import jwt
from cryptography.fernet import Fernet
from passlib.context import CryptContext

from app.core.config import settings

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
_ALGORITHM = "HS256"


# ---- Passwords ----
def hash_password(plain: str) -> str:
    return _pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return _pwd_context.verify(plain, hashed)


# ---- JWT ----
def create_access_token(subject: str, expires_minutes: int | None = None) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=expires_minutes or settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload = {"sub": subject, "exp": expire}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=_ALGORITHM)


def decode_access_token(token: str) -> dict:
    return jwt.decode(token, settings.SECRET_KEY, algorithms=[_ALGORITHM])


# ---- Broker-credential encryption (at rest) ----
def _fernet() -> Fernet:
    return Fernet(settings.ENCRYPTION_KEY.encode())


def encrypt_secret(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt_secret(ciphertext: str) -> str:
    return _fernet().decrypt(ciphertext.encode()).decode()
