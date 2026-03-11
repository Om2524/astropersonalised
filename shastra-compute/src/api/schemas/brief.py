"""Request/response schemas for daily brief and weekly outlook endpoints."""

from __future__ import annotations

from datetime import date
from typing import Optional

from pydantic import BaseModel


class DailyRequest(BaseModel):
    """Request body for ``POST /v1/brief/daily``."""

    chart_data: dict
    target_date: Optional[date] = None


class WeeklyRequest(BaseModel):
    """Request body for ``POST /v1/brief/weekly``."""

    chart_data: dict
    week_start: Optional[date] = None
