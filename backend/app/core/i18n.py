"""Small locale helpers for API display metadata."""

from __future__ import annotations

DEFAULT_LOCALE = "en-US"
SUPPORTED_LOCALES = {"en-US", "zh-CN"}


def negotiate_locale(accept_language: str | None) -> str:
    """Choose a supported locale from an Accept-Language header."""
    if not accept_language:
        return DEFAULT_LOCALE

    candidates: list[tuple[str, float]] = []
    for raw_part in accept_language.split(","):
        part = raw_part.strip()
        if not part:
            continue
        language, _, params = part.partition(";")
        quality = 1.0
        for param in params.split(";"):
            key, _, value = param.strip().partition("=")
            if key == "q":
                try:
                    quality = float(value)
                except ValueError:
                    quality = 0.0
        candidates.append((language.strip(), quality))

    for language, _quality in sorted(candidates, key=lambda item: item[1], reverse=True):
        lower = language.lower()
        if lower.startswith("zh"):
            return "zh-CN"
        if lower.startswith("en"):
            return "en-US"
    return DEFAULT_LOCALE
