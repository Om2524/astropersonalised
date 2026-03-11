"""Geocoding service using Nominatim (OpenStreetMap) with in-memory caching."""

from __future__ import annotations

import httpx
from timezonefinder import TimezoneFinder
from pydantic import BaseModel


class GeocodingResult(BaseModel):
    """Result of a geocoding lookup: coordinates, timezone, display name."""

    latitude: float
    longitude: float
    timezone: str
    display_name: str


class GeocodingService:
    """Geocoding service using Nominatim (OpenStreetMap) with in-memory caching."""

    def __init__(self) -> None:
        self.tf = TimezoneFinder()
        self._cache: dict[str, GeocodingResult | None] = {}

    def _cache_key(self, place: str) -> str:
        """Normalize the place string into a stable cache key."""
        return place.strip().lower()

    async def geocode(self, place: str) -> GeocodingResult | None:
        """Geocode a place name to lat/lon/timezone using Nominatim (free).

        Results are cached in-memory so repeated lookups for the same place
        string do not hit the Nominatim API again.
        """
        key = self._cache_key(place)

        if key in self._cache:
            return self._cache[key]

        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://nominatim.openstreetmap.org/search",
                params={"q": place, "format": "json", "limit": 1},
                headers={"User-Agent": "Shastra/1.0 (astrology app)"},
                timeout=10.0,
            )
            response.raise_for_status()
            results = response.json()

            if not results:
                self._cache[key] = None
                return None

            lat = float(results[0]["lat"])
            lon = float(results[0]["lon"])
            display_name = results[0]["display_name"]

            tz = self.tf.timezone_at(lat=lat, lng=lon)
            if tz is None:
                tz = "UTC"

            result = GeocodingResult(
                latitude=lat,
                longitude=lon,
                timezone=tz,
                display_name=display_name,
            )
            self._cache[key] = result
            return result
