"""Canonical chart data models shared across all engines and services."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Optional

from pydantic import BaseModel, Field


class BirthTimeQuality(StrEnum):
    """Indicates how accurately the birth time is known."""

    EXACT = "exact"
    APPROXIMATE = "approximate"
    UNKNOWN = "unknown"


class PlanetPosition(BaseModel):
    """Position and metadata for a single planet in the chart."""

    name: str
    longitude: float
    latitude: float
    speed: float
    sign: str
    sign_degree: float
    retrograde: bool
    nakshatra: Optional[str] = None
    nakshatra_pada: Optional[int] = None
    house: Optional[int] = None


class HouseCusp(BaseModel):
    """A single house cusp with its sign and lord."""

    house_number: int = Field(ge=1, le=12)
    sign: str
    degree: float
    lord: Optional[str] = None


class Aspect(BaseModel):
    """An angular relationship between two planets."""

    planet1: str
    planet2: str
    aspect_type: str = Field(
        description="One of: conjunction, opposition, trine, square, sextile"
    )
    orb: float
    applying: bool


class DashaInfo(BaseModel):
    """Vimshottari Dasha period information at time of birth."""

    maha_lord: str
    maha_start: datetime
    maha_end: datetime
    antar_lord: Optional[str] = None
    antar_start: Optional[datetime] = None
    antar_end: Optional[datetime] = None


class CanonicalChart(BaseModel):
    """The complete computed natal chart, system-agnostic."""

    birth_profile_id: str
    computed_at: datetime
    ayanamsa: float
    tropical_planets: list[PlanetPosition]
    sidereal_planets: list[PlanetPosition]
    houses_placidus: list[HouseCusp]
    houses_whole_sign: list[HouseCusp]
    ascendant_tropical: float
    ascendant_sidereal: float
    midheaven_tropical: float
    midheaven_sidereal: float
    aspects: list[Aspect]
    vimshottari_dasha: Optional[DashaInfo] = None
    birth_time_quality: BirthTimeQuality
    confidence_metadata: dict
