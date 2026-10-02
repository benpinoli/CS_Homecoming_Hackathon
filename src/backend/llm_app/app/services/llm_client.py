"""Thin wrapper around the Anthropic SDK that returns validated Pydantic objects."""
from functools import lru_cache
from typing import TypeVar

import anthropic
from pydantic import BaseModel

from app.config import get_settings

T = TypeVar("T", bound=BaseModel)


class LLMError(Exception):
    """The model call finished but didn't produce usable output."""


@lru_cache
def get_client() -> anthropic.Anthropic:
    return anthropic.Anthropic(api_key=get_settings().anthropic_api_key)


def generate_structured(system: str, user_content: str, output_model: type[T]) -> T:
    """Ask Claude for JSON matching `output_model` and return the parsed object."""
    settings = get_settings()
    extra: dict = {}
    if settings.enable_refusal_fallback:
        extra = {"betas": ["server-side-fallback-2026-07-01"], "fallbacks": "default"}

    response = get_client().beta.messages.create(
        model=settings.anthropic_model,
        max_tokens=settings.anthropic_max_tokens,
        system=system,
        messages=[{"role": "user", "content": user_content}],
        output_config={
            "effort": settings.anthropic_effort,
            "format": {"type": "json_schema", "schema": output_model.model_json_schema()},
        },
        **extra,
    )

    if response.stop_reason == "refusal":
        raise LLMError("The model declined this request.")
    if response.stop_reason == "max_tokens":
        raise LLMError("Output was cut off; raise ANTHROPIC_MAX_TOKENS.")

    text = next((b.text for b in response.content if b.type == "text"), None)
    if text is None:
        raise LLMError("The model returned no text output.")
    return output_model.model_validate_json(text)
