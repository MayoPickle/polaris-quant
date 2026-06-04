"""Strategy registry.

Built-in strategies register here so the API can expose a list of available
strategies (key + name + param schema) for the picker UI, and the engine can
instantiate one by key.
"""

from __future__ import annotations

from app.strategies.base import Strategy

_REGISTRY: dict[str, type[Strategy]] = {}


def register(cls: type[Strategy]) -> type[Strategy]:
    """Class decorator that registers a strategy by its `key`."""
    if not cls.key:
        raise ValueError(f"{cls.__name__} must define a non-empty `key`")
    if cls.key in _REGISTRY:
        raise ValueError(f"Duplicate strategy key: {cls.key!r}")
    _REGISTRY[cls.key] = cls
    return cls


def get_strategy_class(key: str) -> type[Strategy]:
    if key not in _REGISTRY:
        raise KeyError(f"Unknown strategy: {key!r}")
    return _REGISTRY[key]


def create_strategy(key: str, params: dict | None = None) -> Strategy:
    return get_strategy_class(key)(params)


def list_strategies() -> list[type[Strategy]]:
    return list(_REGISTRY.values())


def load_builtin_strategies() -> None:
    """Import built-in strategy modules so their @register runs. Call at startup."""
    from app.strategies.builtin import (  # noqa: F401
        bollinger,
        macd,
        momentum,
        rsi,
        sma_cross,
        sma_stop,
    )
