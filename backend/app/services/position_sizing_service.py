"""Position sizing for automated strategy signals.

Strategies decide direction. This service decides the account-equity percentage
to allocate to a single signal, using OpenAI when configured and a preset
fallback otherwise.
"""

from __future__ import annotations

import json
from dataclasses import dataclass

import httpx

from app.brokers.base import Account, Bar, Position
from app.core.config import settings
from app.core.logging import get_logger
from app.models.strategy import StrategyInstance
from app.strategies.base import Signal

logger = get_logger(__name__)


@dataclass
class PositionSizingDecision:
    allocation_pct: float
    rationale: str
    source: str


def decide_position_allocation(
    *,
    instance: StrategyInstance,
    signal: Signal,
    latest_bar: Bar,
    account: Account,
    positions: list[Position],
) -> PositionSizingDecision:
    fallback = _fallback_decision("preset default")
    if not settings.OPENAI_API_KEY:
        return fallback

    try:
        payload = _call_openai(instance, signal, latest_bar, account, positions)
        allocation = float(payload["allocation_pct"])
        rationale = str(payload.get("rationale") or "OpenAI sizing decision")
        if allocation <= 0 or allocation > 100:
            raise ValueError(f"allocation_pct out of range: {allocation}")
        return PositionSizingDecision(
            allocation_pct=round(allocation, 4),
            rationale=rationale[:500],
            source="openai",
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("OpenAI sizing failed; using preset %.2f%%: %s", fallback.allocation_pct, exc)
        return _fallback_decision(f"preset fallback after OpenAI error: {exc}")


def _fallback_decision(reason: str) -> PositionSizingDecision:
    return PositionSizingDecision(
        allocation_pct=settings.DEFAULT_POSITION_ALLOCATION_PCT,
        rationale=reason,
        source="preset",
    )


def _call_openai(
    instance: StrategyInstance,
    signal: Signal,
    latest_bar: Bar,
    account: Account,
    positions: list[Position],
) -> dict:
    schema = {
        "type": "object",
        "properties": {
            "allocation_pct": {
                "type": "number",
                "description": "Percent of account equity to allocate to this one signal.",
                "minimum": 0.01,
                "maximum": 100,
            },
            "rationale": {
                "type": "string",
                "description": "One concise reason for the allocation.",
            },
        },
        "required": ["allocation_pct", "rationale"],
        "additionalProperties": False,
    }
    body = {
        "model": settings.POSITION_MODEL,
        "reasoning": {"effort": "low"},
        "input": [
            {
                "role": "developer",
                "content": (
                    "You size a trading signal. Return JSON only. "
                    "Do not choose direction; the strategy already did. "
                    "Respect conservative risk management."
                ),
            },
            {
                "role": "user",
                "content": json.dumps(
                    {
                        "strategy": {
                            "name": instance.name,
                            "key": instance.strategy_key,
                            "params": instance.params,
                        },
                        "signal": {
                            "symbol": signal.symbol,
                            "side": signal.side,
                            "meta": signal.meta,
                        },
                        "latest_bar": latest_bar.__dict__,
                        "account": account.__dict__,
                        "positions": [p.__dict__ for p in positions],
                        "default_allocation_pct": settings.DEFAULT_POSITION_ALLOCATION_PCT,
                    }
                ),
            },
        ],
        "text": {
            "format": {
                "type": "json_schema",
                "name": "position_sizing_decision",
                "strict": True,
                "schema": schema,
            }
        },
    }
    headers = {
        "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }
    with httpx.Client(timeout=settings.OPENAI_TIMEOUT_SECONDS) as client:
        response = client.post("https://api.openai.com/v1/responses", headers=headers, json=body)
        response.raise_for_status()
        data = response.json()
    return json.loads(_extract_output_text(data))


def _extract_output_text(data: dict) -> str:
    if isinstance(data.get("output_text"), str):
        return data["output_text"]
    for item in data.get("output", []):
        for content in item.get("content", []):
            text = content.get("text")
            if isinstance(text, str):
                return text
    raise ValueError("OpenAI response did not include output text.")
