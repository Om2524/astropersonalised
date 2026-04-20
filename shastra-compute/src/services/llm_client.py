"""Unified Gemini client for all LLM-backed features."""
from __future__ import annotations

import logging
import time
from typing import Any, TypedDict

from src.config import settings
from src.services.posthog_analytics import capture_ai_generation

logger = logging.getLogger(__name__)


class LLMTelemetry(TypedDict, total=False):
    distinct_id: str
    trace_id: str
    properties: dict[str, Any]


def _get_usage_value(usage_metadata: Any, *keys: str) -> int | None:
    for key in keys:
        value = (
            usage_metadata.get(key)
            if isinstance(usage_metadata, dict)
            else getattr(usage_metadata, key, None)
        )
        if value is None:
            continue
        try:
            return int(value)
        except (TypeError, ValueError):
            continue
    return None


def _capture_generation(
    *,
    telemetry: LLMTelemetry | None,
    model: str,
    input_text: str,
    output_text: str,
    latency_seconds: float,
    usage_metadata: Any = None,
) -> None:
    if not telemetry:
        return

    input_tokens = _get_usage_value(
        usage_metadata,
        "prompt_token_count",
        "promptTokenCount",
        "input_token_count",
        "inputTokenCount",
    )
    output_tokens = _get_usage_value(
        usage_metadata,
        "candidates_token_count",
        "candidatesTokenCount",
        "output_token_count",
        "outputTokenCount",
    )

    capture_ai_generation(
        distinct_id=telemetry.get("distinct_id"),
        trace_id=telemetry.get("trace_id"),
        model=model,
        provider="google",
        input_text=input_text,
        output_text=output_text,
        latency_seconds=latency_seconds,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        properties=telemetry.get("properties"),
    )


def generate(
    prompt: str,
    *,
    system: str = "",
    model: str | None = None,
    json_mode: bool = False,
    capture_input: str | None = None,
    telemetry: LLMTelemetry | None = None,
) -> str:
    """Generate text with Gemini only.

    Parameters
    ----------
    prompt : str
        The user/content prompt.
    system : str
        Optional Gemini system instruction.
    model : str | None
        Gemini model name override. Defaults to ``settings.gemini_model``.
    json_mode : bool
        If True, request JSON output via Gemini ``response_mime_type``.
    """
    gemini_model = model or settings.gemini_model

    if not settings.gemini_api_key:
        raise RuntimeError("No Gemini API key configured (set GEMINI_API_KEY)")

    try:
        from google import genai
        from google.genai import errors as genai_errors

        client = genai.Client(api_key=settings.gemini_api_key)
        started_at = time.perf_counter()

        config: dict = {}
        if system:
            config["system_instruction"] = system
        if json_mode:
            config["response_mime_type"] = "application/json"

        response = client.models.generate_content(
            model=gemini_model,
            contents=prompt,
            config=config if config else {},
        )
        text = response.text or ""
        _capture_generation(
            telemetry=telemetry,
            model=gemini_model,
            input_text=capture_input or prompt,
            output_text=text,
            latency_seconds=time.perf_counter() - started_at,
            usage_metadata=getattr(response, "usage_metadata", None),
        )
        return text
    except (genai_errors.ClientError, genai_errors.ServerError) as error:
        logger.error("Gemini API error: %s", error)
        raise
    except (ConnectionError, TimeoutError) as error:
        logger.error("Gemini network error: %s", error)
        raise


def generate_stream(
    prompt: str,
    *,
    system: str = "",
    model: str | None = None,
    capture_input: str | None = None,
    telemetry: LLMTelemetry | None = None,
):
    """Stream text chunks with Gemini only.

    Yields str chunks. This is a synchronous generator (the underlying
    Gemini SDK ``generate_content_stream`` is synchronous).
    """
    gemini_model = model or settings.gemini_model

    if not settings.gemini_api_key:
        raise RuntimeError("No Gemini API key configured (set GEMINI_API_KEY)")

    try:
        from google import genai
        from google.genai import errors as genai_errors

        client = genai.Client(api_key=settings.gemini_api_key)
        started_at = time.perf_counter()

        config: dict = {}
        if system:
            config["system_instruction"] = system

        chunks: list[str] = []
        usage_metadata = None
        for chunk in client.models.generate_content_stream(
            model=gemini_model,
            contents=prompt,
            config=config if config else {},
        ):
            usage_metadata = getattr(chunk, "usage_metadata", None) or usage_metadata
            if chunk.text:
                chunks.append(chunk.text)
                yield chunk.text

        _capture_generation(
            telemetry=telemetry,
            model=gemini_model,
            input_text=capture_input or prompt,
            output_text="".join(chunks),
            latency_seconds=time.perf_counter() - started_at,
            usage_metadata=usage_metadata,
        )
    except (genai_errors.ClientError, genai_errors.ServerError) as error:
        logger.error("Gemini stream API error: %s", error)
        raise
    except (ConnectionError, TimeoutError) as error:
        logger.error("Gemini stream network error: %s", error)
        raise
