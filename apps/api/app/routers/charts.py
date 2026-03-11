"""Chart computation endpoints."""

import app.astro_imports  # noqa: F401 — registers astro_core

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from datetime import date, time
from typing import Optional

from app.services.geocoding import GeocodingService
from astro_core.calculator import ChartCalculator
from astro_core.models.chart import CanonicalChart

router = APIRouter(prefix="/api/charts", tags=["charts"])

_geocoding_service = GeocodingService()
_chart_calculator = ChartCalculator()


class ChartRequest(BaseModel):
    date_of_birth: date
    time_of_birth: Optional[time] = None
    birthplace: str
    birth_time_quality: str = Field(default="exact")


class ChartResponse(BaseModel):
    chart: dict
    latitude: float
    longitude: float
    timezone: str
    display_name: str


class TransitRequest(BaseModel):
    chart_data: dict


@router.post("/compute", response_model=ChartResponse)
async def compute_chart(req: ChartRequest):
    geo_result = await _geocoding_service.geocode(req.birthplace)
    if geo_result is None:
        raise HTTPException(status_code=400, detail=f"Could not geocode birthplace: {req.birthplace}")

    try:
        chart = _chart_calculator.compute_chart(
            date_of_birth=req.date_of_birth,
            time_of_birth=req.time_of_birth,
            latitude=geo_result.latitude,
            longitude=geo_result.longitude,
            timezone_str=geo_result.timezone,
            birth_time_quality=req.birth_time_quality,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chart computation failed: {e}")

    return ChartResponse(
        chart=chart.model_dump(mode="json"),
        latitude=geo_result.latitude,
        longitude=geo_result.longitude,
        timezone=geo_result.timezone,
        display_name=geo_result.display_name,
    )


@router.post("/transits")
async def get_transits(
    req: TransitRequest,
    transit_date: Optional[date] = Query(default=None),
):
    if transit_date is None:
        transit_date = date.today()

    try:
        natal_chart = CanonicalChart(**req.chart_data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid chart data: {e}")

    try:
        transits = _chart_calculator.compute_transits(transit_date, natal_chart)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transit computation failed: {e}")

    return {
        "transit_date": transit_date.isoformat(),
        "transit_planets": [p.model_dump(mode="json") for p in transits["transit_planets"]],
        "transit_to_natal_aspects": transits["transit_to_natal_aspects"],
    }
