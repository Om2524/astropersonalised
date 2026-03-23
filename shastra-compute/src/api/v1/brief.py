"""Daily Brief and Weekly Outlook endpoints."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException

from src.auth import ApiKeyAuth
from src.core.models.chart import CanonicalChart
from src.services.brief_service import BriefService
from src.api.schemas.brief import DailyRequest, WeeklyRequest

router = APIRouter(prefix="/v1/brief", tags=["brief"])

_brief_service = BriefService()


@router.post("/daily")
async def daily_brief(req: DailyRequest, _auth: ApiKeyAuth) -> dict:
    """Generate a personalized daily brief from a natal chart."""
    try:
        chart = CanonicalChart(**req.chart_data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid chart data: {e}")

    target = req.target_date or date.today()

    try:
        result = _brief_service.generate_daily_brief(chart, target)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Brief generation failed: {e}")

    return result


@router.post("/weekly")
async def weekly_outlook(req: WeeklyRequest, _auth: ApiKeyAuth) -> dict:
    """Generate a personalized weekly outlook from a natal chart."""
    try:
        chart = CanonicalChart(**req.chart_data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid chart data: {e}")

    if req.week_start:
        start = req.week_start
    else:
        today = date.today()
        start = today - timedelta(days=today.weekday())

    try:
        result = _brief_service.generate_weekly_outlook(chart, start)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Outlook generation failed: {e}")

    return result
