"""Unified Gemini client for all LLM-backed features."""
from __future__ import annotations

import logging

from src.config import settings

logger = logging.getLogger(__name__)


def generate(
    prompt: str,
    *,
    system: str = "",
    model: str | None = None,
    json_mode: bool = False,
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
        return response.text
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

        config: dict = {}
        if system:
            config["system_instruction"] = system

        for chunk in client.models.generate_content_stream(
            model=gemini_model,
            contents=prompt,
            config=config if config else {},
        ):
            if chunk.text:
                yield chunk.text
    except (genai_errors.ClientError, genai_errors.ServerError) as error:
        logger.error("Gemini stream API error: %s", error)
        raise
    except (ConnectionError, TimeoutError) as error:
        logger.error("Gemini stream network error: %s", error)
        raise
