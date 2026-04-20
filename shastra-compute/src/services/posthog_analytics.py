"""Helpers for manually capturing PostHog LLM analytics events."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from src.config import settings

logger = logging.getLogger(__name__)


def capture_ai_generation(
    *,
    distinct_id: str | None,
    trace_id: str | None,
    model: str,
    provider: str,
    input_text: str,
    output_text: str,
    latency_seconds: float,
    input_tokens: int | None = None,
    output_tokens: int | None = None,
    properties: dict[str, Any] | None = None,
) -> None:
    """Send a manual ``$ai_generation`` event to PostHog.

    The capture is intentionally best-effort and never raises back into the
    request path so a telemetry hiccup cannot block the reading flow.
    """
    if not settings.posthog_project_api_key or not distinct_id or not trace_id:
        return

    event_properties: dict[str, Any] = {
        "$ai_trace_id": trace_id,
        "$ai_model": model,
        "$ai_provider": provider,
        "$ai_input": [{"role": "user", "content": input_text}],
        "$ai_output_choices": [{"role": "assistant", "content": output_text}],
        "$ai_latency": round(latency_seconds, 3),
    }
    if input_tokens is not None:
        event_properties["$ai_input_tokens"] = input_tokens
    if output_tokens is not None:
        event_properties["$ai_output_tokens"] = output_tokens
    if properties:
        event_properties.update(properties)

    try:
        response = httpx.post(
            f"{settings.posthog_host.rstrip('/')}/capture/",
            json={
                "api_key": settings.posthog_project_api_key,
                "event": "$ai_generation",
                "distinct_id": distinct_id,
                "properties": event_properties,
            },
            timeout=1.5,
        )
        response.raise_for_status()
    except Exception as error:
        logger.warning("Failed to capture PostHog AI generation event: %s", error)
