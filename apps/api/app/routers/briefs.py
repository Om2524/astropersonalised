"""Daily Brief and Weekly Outlook endpoints."""

import app.astro_imports  # noqa: F401

from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.config import settings
from app.services.briefs import BriefService
from astro_core.models.chart import CanonicalChart

router = APIRouter(prefix="/api/briefs", tags=["briefs"])

_brief_service = BriefService(api_key=settings.GEMINI_API_KEY)


class DailyBriefRequest(BaseModel):
    chart_data: dict
    target_date: Optional[date] = None


class WeeklyOutlookRequest(BaseModel):
    chart_data: dict
    week_start: Optional[date] = None


@router.post("/daily")
async def daily_brief(req: DailyBriefRequest):
    """Generate a personalized daily brief."""
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
async def weekly_outlook(req: WeeklyOutlookRequest):
    """Generate a personalized weekly outlook."""
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
