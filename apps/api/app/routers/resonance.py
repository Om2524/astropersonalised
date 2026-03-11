"""Personality Resonance endpoints — match user charts against famous personalities."""

import app.astro_imports  # noqa: F401

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional

from astro_core.models.chart import CanonicalChart
from app.services.resonance import ResonanceService

router = APIRouter(prefix="/api/resonance", tags=["resonance"])

_resonance = ResonanceService()


class ResonanceRequest(BaseModel):
    chart_data: dict
    top_n: int = Field(default=10, ge=1, le=50)


class PersonalityMatch(BaseModel):
    name: str
    category: str
    description: str
    match_score: int
    shared_features: list[str]
    birth_date: str
    image_url: Optional[str] = None


@router.post("/personalities", response_model=list[PersonalityMatch])
async def find_personality_matches(req: ResonanceRequest):
    """Find famous personalities whose charts resonate with the user's chart."""
    try:
        chart = CanonicalChart(**req.chart_data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid chart data: {e}")

    matches = _resonance.find_matches(chart, top_n=req.top_n)
    return matches
