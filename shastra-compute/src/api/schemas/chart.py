"""Request/response schemas for chart computation endpoints."""

from __future__ import annotations

from datetime import date, time
from typing import Optional

from pydantic import BaseModel, Field


class ChartRequest(BaseModel):
    """Request body for ``POST /v1/chart/compute``."""

    date_of_birth: date
    time_of_birth: Optional[time] = None
    birthplace: str
    birth_time_quality: str = Field(default="exact")


class ChartResponse(BaseModel):
    """Response body for ``POST /v1/chart/compute``."""

    chart: dict
    latitude: float
    longitude: float
    timezone: str
    display_name: str


class TransitRequest(BaseModel):
    """Request body for ``POST /v1/chart/transits``."""

    chart_data: dict
