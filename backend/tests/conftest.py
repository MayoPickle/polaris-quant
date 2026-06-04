"""Pytest fixtures shared across the test suite."""

import pytest

from app.strategies import registry


@pytest.fixture(autouse=True, scope="session")
def _load_builtin_strategies() -> None:
    """Built-in strategies are registered lazily at app startup; load them for tests."""
    registry.load_builtin_strategies()
