"""Strategy catalog endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Header

from app.core.i18n import negotiate_locale
from app.schemas.strategy import StrategyDescriptor
from app.strategies import registry
from app.strategies.metadata_i18n import localized_strategy_metadata

router = APIRouter()


@router.get("/available", response_model=list[StrategyDescriptor])
def list_available_strategies(
    accept_language: str | None = Header(default=None),
) -> list[StrategyDescriptor]:
    """Strategies the user can pick from, with their parameter schema."""
    locale = negotiate_locale(accept_language)
    return [_strategy_descriptor(cls, locale) for cls in registry.list_strategies()]


def _strategy_descriptor(cls, locale: str) -> StrategyDescriptor:
    name, description, param_schema = localized_strategy_metadata(cls, locale)
    return StrategyDescriptor(
        key=cls.key,
        name=name,
        description=description,
        param_schema=param_schema,
    )

