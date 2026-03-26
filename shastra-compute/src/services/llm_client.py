"""Unified LLM client with Gemini primary, OpenRouter fallback."""
from __future__ import annotations

import logging
from typing import AsyncGenerator

from src.config import settings

logger = logging.getLogger(__name__)


def generate(
    prompt: str,
    *,
    system: str = "",
    model: str | None = None,
    json_mode: bool = False,
) -> str:
    """Generate text. Tries Gemini first, falls back to OpenRouter.

    Parameters
    ----------
    prompt : str
        The user/content prompt.
    system : str
        Optional system instruction (Gemini) / system message (OpenRouter).
    model : str | None
        Gemini model name override. Defaults to ``settings.gemini_model``.
        Ignored for the OpenRouter fallback which uses ``settings.openrouter_model``.
    json_mode : bool
        If True, request JSON output (``response_mime_type`` on Gemini,
        ``response_format`` on OpenRouter).
    """
    gemini_model = model or settings.gemini_model

    # --- Try Gemini first ---
    if settings.gemini_api_key:
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
        except (genai_errors.ClientError, genai_errors.ServerError) as e:
            logger.warning("Gemini API error, falling back to OpenRouter: %s", e)
        except (ConnectionError, TimeoutError) as e:
            logger.warning("Gemini network error, falling back to OpenRouter: %s", e)

    # --- Fallback to OpenRouter ---
    if settings.openrouter_api_key:
        try:
            from openai import OpenAI
            from openai import APIError, APIConnectionError, APITimeoutError

            client = OpenAI(
                base_url="https://openrouter.ai/api/v1",
                api_key=settings.openrouter_api_key,
            )

            messages: list[dict] = []
            if system:
                messages.append({"role": "system", "content": system})
            messages.append({"role": "user", "content": prompt})

            kwargs: dict = {
                "model": settings.openrouter_model,
                "messages": messages,
            }
            if json_mode:
                kwargs["response_format"] = {"type": "json_object"}

            response = client.chat.completions.create(**kwargs)
            return response.choices[0].message.content
        except (APIError, APIConnectionError, APITimeoutError) as e:
            logger.error("OpenRouter also failed: %s", e)
            raise

    raise RuntimeError(
        "No LLM API key configured (set GEMINI_API_KEY or OPENROUTER_API_KEY)"
    )


def generate_stream(
    prompt: str,
    *,
    system: str = "",
    model: str | None = None,
):
    """Stream text chunks. Tries Gemini first, falls back to OpenRouter.

    Yields str chunks. This is a synchronous generator (the underlying
    Gemini SDK ``generate_content_stream`` is synchronous).
    """
    gemini_model = model or settings.gemini_model

    # --- Try Gemini first ---
    gemini_failed = False
    if settings.gemini_api_key:
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
            return  # success -- stop here
        except (genai_errors.ClientError, genai_errors.ServerError) as e:
            logger.warning("Gemini stream API error, falling back to OpenRouter: %s", e)
            gemini_failed = True
        except (ConnectionError, TimeoutError) as e:
            logger.warning("Gemini stream network error, falling back to OpenRouter: %s", e)
            gemini_failed = True

    # --- Fallback to OpenRouter ---
    if settings.openrouter_api_key:
        from openai import OpenAI

        client = OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=settings.openrouter_api_key,
        )

        messages: list[dict] = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        stream = client.chat.completions.create(
            model=settings.openrouter_model,
            messages=messages,
            stream=True,
        )
        for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content
        return

    if not gemini_failed:
        raise RuntimeError(
            "No LLM API key configured (set GEMINI_API_KEY or OPENROUTER_API_KEY)"
        )
