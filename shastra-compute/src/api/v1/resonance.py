"""Personality Resonance endpoint -- match user charts against famous personalities."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from src.auth import ApiKeyAuth
from src.core.models.chart import CanonicalChart
from src.services.resonance_service import ResonanceService
from src.api.schemas.resonance import ResonanceRequest, PersonalityMatch

router = APIRouter(prefix="/v1/resonance", tags=["resonance"])

_resonance = ResonanceService()


@router.post("/match", response_model=list[PersonalityMatch])
async def find_personality_matches(
    req: ResonanceRequest, _auth: ApiKeyAuth
) -> list[dict]:
    """Find famous personalities whose charts resonate with the user's chart."""
    try:
        chart = CanonicalChart(**req.chart_data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid chart data: {e}")

    matches = _resonance.find_matches(chart, top_n=req.top_n)
    return matches
