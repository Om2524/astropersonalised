"""Swiss Ephemeris chart computation engine for Vedic/Western astrology."""

from __future__ import annotations

from datetime import date, time, datetime, timedelta
from typing import Optional

import pytz
import swisseph as swe

from .models.chart import (
    CanonicalChart,
    PlanetPosition,
    HouseCusp,
    Aspect,
    DashaInfo,
    BirthTimeQuality,
)

SIGNS = [
    "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
    "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
]

SIGN_LORDS = {
    "Aries": "Mars", "Taurus": "Venus", "Gemini": "Mercury",
    "Cancer": "Moon", "Leo": "Sun", "Virgo": "Mercury",
    "Libra": "Venus", "Scorpio": "Mars", "Sagittarius": "Jupiter",
    "Capricorn": "Saturn", "Aquarius": "Saturn", "Pisces": "Jupiter",
}

NAKSHATRAS = [
    "Ashwini", "Bharani", "Krittika", "Rohini", "Mrigashira", "Ardra",
    "Punarvasu", "Pushya", "Ashlesha", "Magha", "Purva Phalguni",
    "Uttara Phalguni", "Hasta", "Chitra", "Swati", "Vishakha", "Anuradha",
    "Jyeshtha", "Mula", "Purva Ashadha", "Uttara Ashadha", "Shravana",
    "Dhanishta", "Shatabhisha", "Purva Bhadrapada", "Uttara Bhadrapada",
    "Revati",
]

# Nakshatra lords for Vimshottari Dasha, in cycle order, with maha-dasha
# duration in years.
NAKSHATRA_LORDS = [
    ("Ketu", 7),
    ("Venus", 20),
    ("Sun", 6),
    ("Moon", 10),
    ("Mars", 7),
    ("Rahu", 18),
    ("Jupiter", 16),
    ("Saturn", 19),
    ("Mercury", 17),
]

# Total Vimshottari cycle = 120 years
_VIMSHOTTARI_TOTAL = sum(y for _, y in NAKSHATRA_LORDS)

# Map each nakshatra index (0-26) to its lord index in NAKSHATRA_LORDS
# Nakshatras repeat the 9-lord cycle: 0->Ketu, 1->Venus, …, 8->Mercury, 9->Ketu, …
_NAKSHATRA_TO_LORD_IDX = [i % 9 for i in range(27)]

# Planet names as used in output
PLANET_SPECS = [
    ("Sun", swe.SUN),
    ("Moon", swe.MOON),
    ("Mercury", swe.MERCURY),
    ("Venus", swe.VENUS),
    ("Mars", swe.MARS),
    ("Jupiter", swe.JUPITER),
    ("Saturn", swe.SATURN),
    ("Rahu", swe.MEAN_NODE),
]

# Aspect definitions: (name, exact_angle, orb)
ASPECT_DEFS = [
    ("conjunction", 0.0, 8.0),
    ("opposition", 180.0, 8.0),
    ("trine", 120.0, 7.0),
    ("square", 90.0, 7.0),
    ("sextile", 60.0, 5.0),
]

NAKSHATRA_SPAN = 13.0 + 20.0 / 60.0  # 13°20' = 13.33333…°
PADA_SPAN = NAKSHATRA_SPAN / 4.0      # 3°20' = 3.33333…°


def _normalize(deg: float) -> float:
    """Normalize an angle to [0, 360)."""
    return deg % 360.0


def _sign_index(longitude: float) -> int:
    return int(longitude // 30) % 12


def _sign_name(longitude: float) -> str:
    return SIGNS[_sign_index(longitude)]


def _sign_degree(longitude: float) -> float:
    return longitude % 30.0


def _nakshatra_info(sidereal_longitude: float) -> tuple[str, int]:
    """Return (nakshatra_name, pada) for a sidereal longitude."""
    lon = _normalize(sidereal_longitude)
    nak_idx = int(lon / NAKSHATRA_SPAN)
    if nak_idx >= 27:
        nak_idx = 26
    offset_in_nak = lon - nak_idx * NAKSHATRA_SPAN
    pada = int(offset_in_nak / PADA_SPAN) + 1
    if pada > 4:
        pada = 4
    return NAKSHATRAS[nak_idx], pada


class ChartCalculator:
    """Core computation engine backed by the Swiss Ephemeris (pyswisseph)."""

    def __init__(self, ephe_path: Optional[str] = None):
        if ephe_path:
            swe.set_ephe_path(ephe_path)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def compute_chart(
        self,
        date_of_birth: date,
        time_of_birth: time | None,
        latitude: float,
        longitude: float,
        timezone_str: str,
        birth_time_quality: str,
        birth_profile_id: str = "",
    ) -> CanonicalChart:
        quality = BirthTimeQuality(birth_time_quality)
        confidence = self._initial_confidence(quality)

        # --- 1. Resolve birth time & compute Julian Day ----------------
        local_dt, used_time = self._resolve_local_datetime(
            date_of_birth, time_of_birth, timezone_str, quality,
        )
        utc_dt = local_dt.astimezone(pytz.utc)
        hour_ut = utc_dt.hour + utc_dt.minute / 60.0 + utc_dt.second / 3600.0
        jd = swe.julday(
            utc_dt.year, utc_dt.month, utc_dt.day, hour_ut, swe.GREG_CAL,
        )

        # --- 2. Ayanamsa ---------------------------------------------
        swe.set_sid_mode(swe.SIDM_LAHIRI)
        ayanamsa = swe.get_ayanamsa_ut(jd)

        # --- 3. Planetary positions -----------------------------------
        tropical_planets: list[PlanetPosition] = []
        sidereal_planets: list[PlanetPosition] = []

        raw_positions: list[dict] = []  # for internal use (aspects, houses)

        for name, planet_id in PLANET_SPECS:
            trop_lon, trop_lat, trop_speed = self._calc_planet(jd, planet_id)
            sid_lon = _normalize(trop_lon - ayanamsa)
            retro = trop_speed < 0

            nak_name, nak_pada = _nakshatra_info(sid_lon)

            tropical_planets.append(PlanetPosition(
                name=name,
                longitude=trop_lon,
                latitude=trop_lat,
                speed=trop_speed,
                sign=_sign_name(trop_lon),
                sign_degree=round(_sign_degree(trop_lon), 6),
                retrograde=retro,
            ))

            sidereal_planets.append(PlanetPosition(
                name=name,
                longitude=sid_lon,
                latitude=trop_lat,
                speed=trop_speed,
                sign=_sign_name(sid_lon),
                sign_degree=round(_sign_degree(sid_lon), 6),
                retrograde=retro,
                nakshatra=nak_name,
                nakshatra_pada=nak_pada,
            ))

            raw_positions.append({
                "name": name,
                "trop_lon": trop_lon,
                "sid_lon": sid_lon,
                "speed": trop_speed,
            })

        # Ketu = Rahu + 180° (shadow point, always retrograde like Rahu)
        rahu_raw = raw_positions[-1]  # last entry is Rahu
        ketu_trop = _normalize(rahu_raw["trop_lon"] + 180.0)
        ketu_sid = _normalize(rahu_raw["sid_lon"] + 180.0)
        ketu_speed = rahu_raw["speed"]  # same magnitude, nodes share speed
        ketu_nak, ketu_pada = _nakshatra_info(ketu_sid)

        tropical_planets.append(PlanetPosition(
            name="Ketu",
            longitude=ketu_trop,
            latitude=0.0,
            speed=ketu_speed,
            sign=_sign_name(ketu_trop),
            sign_degree=round(_sign_degree(ketu_trop), 6),
            retrograde=ketu_speed < 0,
        ))
        sidereal_planets.append(PlanetPosition(
            name="Ketu",
            longitude=ketu_sid,
            latitude=0.0,
            speed=ketu_speed,
            sign=_sign_name(ketu_sid),
            sign_degree=round(_sign_degree(ketu_sid), 6),
            retrograde=ketu_speed < 0,
            nakshatra=ketu_nak,
            nakshatra_pada=ketu_pada,
        ))
        raw_positions.append({
            "name": "Ketu",
            "trop_lon": ketu_trop,
            "sid_lon": ketu_sid,
            "speed": ketu_speed,
        })

        # --- 4. House cusps ------------------------------------------
        cusps_trop, ascmc = swe.houses(jd, latitude, longitude, b'P')
        asc_trop = ascmc[0]
        mc_trop = ascmc[1]
        asc_sid = _normalize(asc_trop - ayanamsa)
        mc_sid = _normalize(mc_trop - ayanamsa)

        # Placidus houses (tropical cusps converted to sidereal for labels)
        houses_placidus: list[HouseCusp] = []
        for i, cusp_trop in enumerate(cusps_trop):
            cusp_sid = _normalize(cusp_trop - ayanamsa)
            sign = _sign_name(cusp_sid)
            houses_placidus.append(HouseCusp(
                house_number=i + 1,
                sign=sign,
                degree=round(cusp_sid, 6),
                lord=SIGN_LORDS[sign],
            ))

        # Whole-sign houses (sidereal): ascendant sign = house 1
        asc_sign_idx = _sign_index(asc_sid)
        houses_whole_sign: list[HouseCusp] = []
        for h in range(12):
            sign_idx = (asc_sign_idx + h) % 12
            sign = SIGNS[sign_idx]
            houses_whole_sign.append(HouseCusp(
                house_number=h + 1,
                sign=sign,
                degree=round(sign_idx * 30.0, 6),
                lord=SIGN_LORDS[sign],
            ))

        # --- 5. Assign planets to houses -----------------------------
        self._assign_houses_placidus(sidereal_planets, houses_placidus)
        self._assign_houses_whole_sign(sidereal_planets, asc_sign_idx)

        # Also assign for tropical (Placidus tropical cusps)
        self._assign_houses_placidus_tropical(tropical_planets, cusps_trop)

        # --- 6. Aspects -----------------------------------------------
        aspects = self._compute_aspects(raw_positions)

        # --- 7. Vimshottari Dasha ------------------------------------
        moon_sid = None
        for p in sidereal_planets:
            if p.name == "Moon":
                moon_sid = p
                break

        dasha: Optional[DashaInfo] = None
        if moon_sid is not None:
            dasha = self._compute_vimshottari(moon_sid.longitude, local_dt)

        # --- 8. Build result -----------------------------------------
        return CanonicalChart(
            birth_profile_id=birth_profile_id,
            computed_at=datetime.utcnow(),
            ayanamsa=round(ayanamsa, 6),
            tropical_planets=tropical_planets,
            sidereal_planets=sidereal_planets,
            houses_placidus=houses_placidus,
            houses_whole_sign=houses_whole_sign,
            ascendant_tropical=round(asc_trop, 6),
            ascendant_sidereal=round(asc_sid, 6),
            midheaven_tropical=round(mc_trop, 6),
            midheaven_sidereal=round(mc_sid, 6),
            aspects=aspects,
            vimshottari_dasha=dasha,
            birth_time_quality=quality,
            confidence_metadata=confidence,
        )

    def compute_transits(self, transit_date: date, natal_chart: CanonicalChart) -> dict:
        """Compute current planetary positions and aspects to natal planets."""
        # Use noon UTC for the transit date
        jd = swe.julday(transit_date.year, transit_date.month, transit_date.day, 12.0, swe.GREG_CAL)

        swe.set_sid_mode(swe.SIDM_LAHIRI)
        ayanamsa = swe.get_ayanamsa_ut(jd)

        transit_planets: list[PlanetPosition] = []
        transit_raw: list[dict] = []

        for name, planet_id in PLANET_SPECS:
            trop_lon, trop_lat, trop_speed = self._calc_planet(jd, planet_id)
            sid_lon = _normalize(trop_lon - ayanamsa)
            retro = trop_speed < 0
            nak_name, nak_pada = _nakshatra_info(sid_lon)

            transit_planets.append(PlanetPosition(
                name=name,
                longitude=sid_lon,
                latitude=trop_lat,
                speed=trop_speed,
                sign=_sign_name(sid_lon),
                sign_degree=round(_sign_degree(sid_lon), 6),
                retrograde=retro,
                nakshatra=nak_name,
                nakshatra_pada=nak_pada,
            ))
            transit_raw.append({
                "name": name,
                "trop_lon": trop_lon,
                "sid_lon": sid_lon,
                "speed": trop_speed,
            })

        # Ketu
        rahu_raw = transit_raw[-1]
        ketu_trop = _normalize(rahu_raw["trop_lon"] + 180.0)
        ketu_sid = _normalize(rahu_raw["sid_lon"] + 180.0)
        ketu_speed = rahu_raw["speed"]
        ketu_nak, ketu_pada = _nakshatra_info(ketu_sid)

        transit_planets.append(PlanetPosition(
            name="Ketu",
            longitude=ketu_sid,
            latitude=0.0,
            speed=ketu_speed,
            sign=_sign_name(ketu_sid),
            sign_degree=round(_sign_degree(ketu_sid), 6),
            retrograde=ketu_speed < 0,
            nakshatra=ketu_nak,
            nakshatra_pada=ketu_pada,
        ))
        transit_raw.append({
            "name": "Ketu",
            "trop_lon": ketu_trop,
            "sid_lon": ketu_sid,
            "speed": ketu_speed,
        })

        # Compute transit-to-natal aspects
        transit_to_natal_aspects: list[dict] = []
        for t_raw, t_planet in zip(transit_raw, transit_planets):
            for natal_planet in natal_chart.sidereal_planets:
                diff = abs(t_raw["sid_lon"] - natal_planet.longitude)
                if diff > 180.0:
                    diff = 360.0 - diff
                for asp_name, asp_angle, asp_orb in ASPECT_DEFS:
                    orb = abs(diff - asp_angle)
                    if orb <= asp_orb:
                        applying = _is_applying(
                            t_raw["sid_lon"], t_raw["speed"],
                            natal_planet.longitude, 0.0,  # natal planets are stationary
                            asp_angle,
                        )
                        transit_to_natal_aspects.append({
                            "transit_planet": t_raw["name"],
                            "natal_planet": natal_planet.name,
                            "aspect_type": asp_name,
                            "orb": round(orb, 6),
                            "applying": applying,
                        })

        return {
            "transit_planets": transit_planets,
            "transit_to_natal_aspects": transit_to_natal_aspects,
        }

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _resolve_local_datetime(
        dob: date,
        tob: time | None,
        tz_str: str,
        quality: BirthTimeQuality,
    ) -> tuple[datetime, time]:
        tz = pytz.timezone(tz_str)
        if quality == BirthTimeQuality.UNKNOWN or tob is None:
            tob = time(12, 0, 0)
        naive = datetime.combine(dob, tob)
        local_dt = tz.localize(naive)
        return local_dt, tob

    @staticmethod
    def _initial_confidence(quality: BirthTimeQuality) -> dict:
        if quality == BirthTimeQuality.EXACT:
            return {
                "ascendant": "reliable",
                "houses": "reliable",
                "moon_degree": "reliable",
                "planets": "reliable",
            }
        elif quality == BirthTimeQuality.APPROXIMATE:
            return {
                "ascendant": "reduced",
                "houses": "reduced",
                "moon_degree": "reliable",
                "planets": "reliable",
            }
        else:  # UNKNOWN
            return {
                "ascendant": "unreliable",
                "houses": "unreliable",
                "moon_degree": "unreliable",
                "planets": "reliable",
            }

    @staticmethod
    def _calc_planet(jd: float, planet_id: int) -> tuple[float, float, float]:
        """Return (longitude, latitude, speed) for a planet at the given JD."""
        result, _flags = swe.calc_ut(jd, planet_id)
        lon = result[0]
        lat = result[1]
        speed = result[3] if len(result) > 3 else result[2]
        return lon, lat, speed

    # --- House assignment ---

    @staticmethod
    def _assign_houses_placidus(
        planets: list[PlanetPosition],
        houses: list[HouseCusp],
    ) -> None:
        """Assign each planet a Placidus house number based on sidereal cusps."""
        cusp_degrees = [h.degree for h in houses]
        for p in planets:
            p.house = _house_for_longitude(p.longitude, cusp_degrees)

    @staticmethod
    def _assign_houses_placidus_tropical(
        planets: list[PlanetPosition],
        cusps_trop: tuple,
    ) -> None:
        cusp_degrees = list(cusps_trop)
        for p in planets:
            p.house = _house_for_longitude(p.longitude, cusp_degrees)

    @staticmethod
    def _assign_houses_whole_sign(
        planets: list[PlanetPosition],
        asc_sign_idx: int,
    ) -> None:
        """Overwrite planet.house with the whole-sign house number."""
        for p in planets:
            planet_sign_idx = _sign_index(p.longitude)
            p.house = (planet_sign_idx - asc_sign_idx) % 12 + 1

    # --- Aspects ---

    @staticmethod
    def _compute_aspects(raw_positions: list[dict]) -> list[Aspect]:
        aspects: list[Aspect] = []
        n = len(raw_positions)
        for i in range(n):
            for j in range(i + 1, n):
                p1 = raw_positions[i]
                p2 = raw_positions[j]
                diff = abs(p1["trop_lon"] - p2["trop_lon"])
                if diff > 180.0:
                    diff = 360.0 - diff
                for asp_name, asp_angle, asp_orb in ASPECT_DEFS:
                    orb = abs(diff - asp_angle)
                    if orb <= asp_orb:
                        # Determine applying vs separating
                        applying = _is_applying(
                            p1["trop_lon"], p1["speed"],
                            p2["trop_lon"], p2["speed"],
                            asp_angle,
                        )
                        aspects.append(Aspect(
                            planet1=p1["name"],
                            planet2=p2["name"],
                            aspect_type=asp_name,
                            orb=round(orb, 6),
                            applying=applying,
                        ))
        return aspects

    # --- Vimshottari Dasha ---

    @staticmethod
    def _compute_vimshottari(
        moon_sid_lon: float,
        birth_dt: datetime,
    ) -> DashaInfo:
        """Compute the maha and antar dasha at birth based on Moon's sidereal
        longitude."""
        lon = _normalize(moon_sid_lon)
        nak_idx = int(lon / NAKSHATRA_SPAN)
        if nak_idx >= 27:
            nak_idx = 26
        offset_in_nak = lon - nak_idx * NAKSHATRA_SPAN
        fraction_elapsed = offset_in_nak / NAKSHATRA_SPAN  # 0..1

        lord_idx = _NAKSHATRA_TO_LORD_IDX[nak_idx]
        lord_name, lord_years = NAKSHATRA_LORDS[lord_idx]

        # The remaining portion of the first maha dasha
        remaining_fraction = 1.0 - fraction_elapsed
        remaining_years = lord_years * remaining_fraction

        maha_start = birth_dt - timedelta(
            days=fraction_elapsed * lord_years * 365.25
        )
        maha_end = maha_start + timedelta(days=lord_years * 365.25)

        # Determine antar dasha at birth
        antar_lord, antar_start, antar_end = _antar_at_date(
            lord_idx, maha_start, lord_years, birth_dt,
        )

        return DashaInfo(
            maha_lord=lord_name,
            maha_start=maha_start,
            maha_end=maha_end,
            antar_lord=antar_lord,
            antar_start=antar_start,
            antar_end=antar_end,
        )


# ======================================================================
# Module-level helper functions
# ======================================================================

def _house_for_longitude(lon: float, cusp_degrees: list[float]) -> int:
    """Given a longitude and 12 cusp degrees (sorted by house number),
    return the house number (1-12) the longitude falls in."""
    for h in range(12):
        next_h = (h + 1) % 12
        start = cusp_degrees[h]
        end = cusp_degrees[next_h]
        if start < end:
            if start <= lon < end:
                return h + 1
        else:
            # Wraps around 0°
            if lon >= start or lon < end:
                return h + 1
    return 1  # fallback


def _is_applying(
    lon1: float, speed1: float,
    lon2: float, speed2: float,
    aspect_angle: float,
) -> bool:
    """Determine whether the aspect between two planets is applying.

    An aspect is applying when the faster planet is moving towards the
    exact aspect angle with the slower planet.
    """
    diff = _normalize(lon1 - lon2)
    # Rate of change of the angular separation
    rel_speed = speed1 - speed2
    # If the aspect corresponds to the raw diff being near aspect_angle
    if abs(diff - aspect_angle) <= 10:
        # If rel_speed is reducing the gap, it's applying
        return rel_speed < 0 if diff > aspect_angle else rel_speed > 0
    else:
        inv_diff = 360.0 - diff
        if abs(inv_diff - aspect_angle) <= 10:
            return rel_speed > 0 if inv_diff > aspect_angle else rel_speed < 0
    return False


def _antar_at_date(
    maha_lord_idx: int,
    maha_start: datetime,
    maha_years: float,
    target: datetime,
) -> tuple[str, datetime, datetime]:
    """Find which antar-dasha is running at *target* within a maha dasha.

    The antar sequence starts with the maha lord itself and then cycles
    through the remaining lords in order.
    """
    cursor = maha_start
    for offset in range(9):
        antar_idx = (maha_lord_idx + offset) % 9
        antar_name, antar_base_years = NAKSHATRA_LORDS[antar_idx]
        # Antar duration = (maha_years * antar_base_years) / 120
        antar_days = (maha_years * antar_base_years / _VIMSHOTTARI_TOTAL) * 365.25
        antar_end = cursor + timedelta(days=antar_days)
        if cursor <= target < antar_end:
            return antar_name, cursor, antar_end
        cursor = antar_end
    # Fallback: return last antar
    antar_idx = (maha_lord_idx + 8) % 9
    antar_name, antar_base_years = NAKSHATRA_LORDS[antar_idx]
    antar_days = (maha_years * antar_base_years / _VIMSHOTTARI_TOTAL) * 365.25
    return antar_name, cursor - timedelta(days=antar_days), cursor
