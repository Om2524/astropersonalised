"""Application configuration via environment variables.

Uses pydantic-settings to load and validate all required secrets and
runtime options from the environment (or a .env file).
"""

from __future__ import annotations

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Global settings for the Shastra Compute service."""

    gemini_api_key: str = ""
    geocoding_api_key: str = ""
    api_key: str = ""
    stream_token_secret: str = ""
    environment: str = "development"
    log_level: str = "INFO"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
