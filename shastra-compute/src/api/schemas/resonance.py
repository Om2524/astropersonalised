"""Request/response schemas for the resonance (personality match) endpoint."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class ResonanceRequest(BaseModel):
    """Request body for ``POST /v1/resonance/match``."""

    chart_data: dict
    top_n: int = Field(default=10, ge=1, le=50)


class PersonalityMatch(BaseModel):
    """A single celebrity match result."""

    name: str
    category: str
    description: str
    match_score: int
    shared_features: list[str]
    birth_date: str
    image_url: Optional[str] = None
