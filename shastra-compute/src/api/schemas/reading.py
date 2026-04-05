"""Request/response schemas for reading/ask endpoints."""

from __future__ import annotations

from datetime import date, time
from typing import Optional

from pydantic import BaseModel, Field


class AskRequest(BaseModel):
    """Request body for ``POST /v1/reading/ask`` and ``POST /v1/reading/stream``."""

    query: str
    method: str = Field(default="auto", description="vedic, kp, western, compare, or auto")
    tone: str = Field(default="practical", description="practical, emotional, spiritual, concise")
    language: str = Field(default="en", description="Response language code: en, hi, mr, te, ta, kn, bn, gu, es")
    # Birth data -- either provide chart_data or birth details
    chart_data: Optional[dict] = None
    # Or provide birth details for on-the-fly computation
    date_of_birth: Optional[date] = None
    time_of_birth: Optional[time] = None
    birthplace: Optional[str] = None
    birth_time_quality: str = Field(default="exact")


class AskResponse(BaseModel):
    """Response body for ``POST /v1/reading/ask``."""

    query: str
    classification: dict
    method_used: str
    reading: dict
    evidence_summary: dict


class StreamRequest(BaseModel):
    """Alias schema for the streaming endpoint (same fields as AskRequest)."""

    query: str
    method: str = Field(default="auto", description="vedic, kp, western, compare, or auto")
    tone: str = Field(default="practical", description="practical, emotional, spiritual, concise")
    language: str = Field(default="en", description="Response language code: en, hi, mr, te, ta, kn, bn, gu, es")
    chart_data: Optional[dict] = None
    date_of_birth: Optional[date] = None
    time_of_birth: Optional[time] = None
    birthplace: Optional[str] = None
    birth_time_quality: str = Field(default="exact")
