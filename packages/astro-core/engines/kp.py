"""Krishnamurti Paddhati (KP) astrology interpretation engine.

KP system subdivides the zodiac into 249 sub-divisions based on Vimshottari
Dasha lords.  Each planet and house cusp has a star-lord and sub-lord.
Interpretation flows through the significator chain:
    planet -> star-lord -> sub-lord -> houses signified.
"""

from __future__ import annotations

from ..models.chart import CanonicalChart, PlanetPosition, HouseCusp
from .base import BaseEvidence, BaseEngine

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DASHA_YEARS: list[tuple[str, int]] = [
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
TOTAL_YEARS = 120  # sum of all dasha years

NAKSHATRA_SPAN = 13 + 20 / 60  # 13°20' = 13.33333...°

SIGN_LORDS: dict[str, str] = {
    "Aries": "Mars",
    "Taurus": "Venus",
    "Gemini": "Mercury",
    "Cancer": "Moon",
    "Leo": "Sun",
    "Virgo": "Mercury",
    "Libra": "Venus",
    "Scorpio": "Mars",
    "Sagittarius": "Jupiter",
    "Capricorn": "Saturn",
    "Aquarius": "Saturn",
    "Pisces": "Jupiter",
}

# Reverse mapping: planet -> list of signs it rules
_PLANET_TO_SIGNS: dict[str, list[str]] = {}
for _sign, _lord in SIGN_LORDS.items():
    _PLANET_TO_SIGNS.setdefault(_lord, []).append(_sign)

# 27 nakshatras mapped to their Vimshottari lords (cycle of 9)
NAKSHATRAS = [
    "Ashwini", "Bharani", "Krittika", "Rohini", "Mrigashira", "Ardra",
    "Punarvasu", "Pushya", "Ashlesha", "Magha", "Purva Phalguni",
    "Uttara Phalguni", "Hasta", "Chitra", "Swati", "Vishakha", "Anuradha",
    "Jyeshtha", "Mula", "Purva Ashadha", "Uttara Ashadha", "Shravana",
    "Dhanishta", "Shatabhisha", "Purva Bhadrapada", "Uttara Bhadrapada",
    "Revati",
]

NAKSHATRA_LORD_MAP: dict[str, str] = {
    NAKSHATRAS[i]: DASHA_YEARS[i % 9][0] for i in range(27)
}

# Day lords (for ruling planets): Monday=Moon, Tuesday=Mars, ...
# Python weekday(): Monday=0 ... Sunday=6
DAY_LORDS = ["Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn", "Sun"]

KP_DOMAIN_HOUSES: dict[str, list[int]] = {
    "career": [2, 6, 10, 11],
    "marriage": [2, 7, 11],
    "relationships": [5, 7, 11],
    "money": [2, 6, 10, 11],
    "health": [1, 5, 11],
    "education": [4, 9, 11],
    "property": [4, 11, 12],
    "travel": [3, 9, 12],
    "timing": [1, 10, 11],
    "general": [1, 5, 9, 10],
}

# KP uses all 9 "planets" (grahas) including Rahu and Ketu
KP_PLANETS = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn", "Rahu", "Ketu"]


# ---------------------------------------------------------------------------
# Sub-lord computation
# ---------------------------------------------------------------------------

def compute_sub_lord(sidereal_longitude: float) -> tuple[str, str, str]:
    """Return (nakshatra_lord, sub_lord, sub_sub_lord) for a sidereal longitude."""
    lon = sidereal_longitude % 360
    nak_idx = int(lon / NAKSHATRA_SPAN)
    if nak_idx >= 27:
        nak_idx = 26

    # Nakshatra lord
    star_lord_idx = nak_idx % 9
    star_lord = DASHA_YEARS[star_lord_idx][0]

    # Position within nakshatra
    offset_in_nak = lon - nak_idx * NAKSHATRA_SPAN

    # Sub-lord: divide nakshatra proportionally by dasha years
    # Start from star_lord_idx and cycle through
    cursor = 0.0
    sub_lord = star_lord
    for i in range(9):
        idx = (star_lord_idx + i) % 9
        sub_span = NAKSHATRA_SPAN * DASHA_YEARS[idx][1] / TOTAL_YEARS
        if cursor + sub_span > offset_in_nak:
            sub_lord = DASHA_YEARS[idx][0]
            # Sub-sub lord within sub
            sub_offset = offset_in_nak - cursor
            sub_cursor = 0.0
            sub_sub_lord = sub_lord
            for j in range(9):
                ss_idx = (idx + j) % 9
                ss_span = sub_span * DASHA_YEARS[ss_idx][1] / TOTAL_YEARS
                if sub_cursor + ss_span > sub_offset:
                    sub_sub_lord = DASHA_YEARS[ss_idx][0]
                    break
                sub_cursor += ss_span
            return star_lord, sub_lord, sub_sub_lord
        cursor += sub_span

    return star_lord, sub_lord, sub_lord  # fallback


# ---------------------------------------------------------------------------
# Helper: determine which houses a planet signifies
# ---------------------------------------------------------------------------

def _houses_ruled_by(planet: str, cusps: list[HouseCusp]) -> list[int]:
    """Return house numbers whose cusp sign is ruled by *planet*."""
    ruled_signs = _PLANET_TO_SIGNS.get(planet, [])
    # Rahu and Ketu do not own signs in classical KP; they act as agents
    # of the sign lord they occupy, but for significator purposes we return
    # empty for ownership.
    return sorted(c.house_number for c in cusps if c.sign in ruled_signs)


def _house_occupied_by(planet_name: str, planets: list[PlanetPosition]) -> int | None:
    """Return the house number occupied by *planet_name*, or None."""
    for p in planets:
        if p.name == planet_name:
            return p.house
    return None


# ---------------------------------------------------------------------------
# Evidence model
# ---------------------------------------------------------------------------

class KPEvidence(BaseEvidence):
    method: str = "kp"
    planet_significators: list[dict]   # [{planet, star_lord, sub_lord, houses_signified}]
    cusp_sub_lords: list[dict]         # [{cusp, sign, star_lord, sub_lord, sub_lord_signifies}]
    favorable_significators: list[str] # planets that signify the queried houses
    ruling_planets: list[dict]         # [{planet, role}]
    timing_indicators: list[dict]      # [{significator, activation_info}]
    domain_factors: list[dict]         # [{factor, description, relevance}]


# ---------------------------------------------------------------------------
# KP Engine
# ---------------------------------------------------------------------------

class KPEngine(BaseEngine):
    """Krishnamurti Paddhati interpretation engine."""

    def extract_evidence(
        self, chart: CanonicalChart, domain: str, query: str
    ) -> KPEvidence:
        planets = chart.sidereal_planets
        cusps = chart.houses_placidus  # KP uses Placidus

        # Target houses for the queried domain
        target_houses = KP_DOMAIN_HOUSES.get(domain, KP_DOMAIN_HOUSES["general"])

        # ----- 1. Compute star-lord / sub-lord for each planet -----
        planet_sig_list: list[dict] = []
        planet_houses_map: dict[str, list[int]] = {}  # planet -> houses signified

        for p in planets:
            if p.name not in KP_PLANETS:
                continue
            star_lord, sub_lord, sub_sub_lord = compute_sub_lord(p.longitude)

            # Houses signified by this planet (KP significator chain):
            # 1. House occupied by the planet
            # 2. Houses ruled by the planet
            # 3. House occupied by the star-lord
            # 4. Houses ruled by the star-lord
            houses_signified: set[int] = set()

            occ = _house_occupied_by(p.name, planets)
            if occ is not None:
                houses_signified.add(occ)

            houses_signified.update(_houses_ruled_by(p.name, cusps))

            sl_occ = _house_occupied_by(star_lord, planets)
            if sl_occ is not None:
                houses_signified.add(sl_occ)

            houses_signified.update(_houses_ruled_by(star_lord, cusps))

            sorted_houses = sorted(houses_signified)
            planet_houses_map[p.name] = sorted_houses

            planet_sig_list.append({
                "planet": p.name,
                "star_lord": star_lord,
                "sub_lord": sub_lord,
                "sub_sub_lord": sub_sub_lord,
                "houses_signified": sorted_houses,
            })

        # ----- 2. Compute star-lord / sub-lord for each cusp -----
        cusp_sub_lord_list: list[dict] = []
        for c in cusps:
            star_lord, sub_lord, sub_sub_lord = compute_sub_lord(c.degree)

            # What houses does the sub-lord signify?
            sub_lord_houses: set[int] = set()
            sl_occ = _house_occupied_by(sub_lord, planets)
            if sl_occ is not None:
                sub_lord_houses.add(sl_occ)
            sub_lord_houses.update(_houses_ruled_by(sub_lord, cusps))

            # Also include star-lord's influence on the sub-lord
            sl_star, _, _ = compute_sub_lord(
                next((pp.longitude for pp in planets if pp.name == sub_lord), 0.0)
            )
            sl_star_occ = _house_occupied_by(sl_star, planets)
            if sl_star_occ is not None:
                sub_lord_houses.add(sl_star_occ)
            sub_lord_houses.update(_houses_ruled_by(sl_star, cusps))

            cusp_sub_lord_list.append({
                "cusp": c.house_number,
                "sign": c.sign,
                "star_lord": star_lord,
                "sub_lord": sub_lord,
                "sub_lord_signifies": sorted(sub_lord_houses),
            })

        # ----- 3. Favorable significators for queried domain -----
        favorable: list[str] = []
        for p_sig in planet_sig_list:
            overlap = set(p_sig["houses_signified"]) & set(target_houses)
            if overlap:
                favorable.append(p_sig["planet"])

        # ----- 4. Ruling planets -----
        ruling: list[dict] = []

        # Ascendant sign lord
        asc_sign = self._sign_from_longitude(chart.ascendant_sidereal)
        asc_sign_lord = SIGN_LORDS.get(asc_sign, "")
        if asc_sign_lord:
            ruling.append({"planet": asc_sign_lord, "role": "asc_sign_lord"})

        # Ascendant star lord
        asc_star, _, _ = compute_sub_lord(chart.ascendant_sidereal)
        ruling.append({"planet": asc_star, "role": "asc_star_lord"})

        # Moon sign lord
        moon = next((p for p in planets if p.name == "Moon"), None)
        if moon:
            moon_sign_lord = SIGN_LORDS.get(moon.sign, "")
            if moon_sign_lord:
                ruling.append({"planet": moon_sign_lord, "role": "moon_sign_lord"})
            # Moon star lord
            moon_star, _, _ = compute_sub_lord(moon.longitude)
            ruling.append({"planet": moon_star, "role": "moon_star_lord"})

        # Day lord (based on birth weekday from chart computed_at)
        weekday = chart.computed_at.weekday()
        ruling.append({"planet": DAY_LORDS[weekday], "role": "day_lord"})

        # ----- 5. Timing indicators -----
        timing_indicators: list[dict] = []
        dasha = chart.vimshottari_dasha
        if dasha:
            maha_lord = dasha.maha_lord
            antar_lord = dasha.antar_lord

            maha_houses = planet_houses_map.get(maha_lord, [])
            maha_overlap = set(maha_houses) & set(target_houses)

            timing_indicators.append({
                "significator": maha_lord,
                "activation_info": (
                    f"Maha dasha lord signifying houses {sorted(maha_overlap)}"
                    if maha_overlap
                    else f"Maha dasha lord ({maha_lord}) not directly signifying target houses"
                ),
            })

            if antar_lord:
                antar_houses = planet_houses_map.get(antar_lord, [])
                antar_overlap = set(antar_houses) & set(target_houses)
                timing_indicators.append({
                    "significator": antar_lord,
                    "activation_info": (
                        f"Antar dasha lord signifying houses {sorted(antar_overlap)}"
                        if antar_overlap
                        else f"Antar dasha lord ({antar_lord}) not directly signifying target houses"
                    ),
                })

        # ----- 6. Domain factors -----
        domain_factors: list[dict] = []
        for cusp_info in cusp_sub_lord_list:
            if cusp_info["cusp"] in target_houses:
                sl = cusp_info["sub_lord"]
                sl_houses = cusp_info["sub_lord_signifies"]
                overlap = set(sl_houses) & set(target_houses)
                relevance = "strong" if overlap else "weak"
                domain_factors.append({
                    "factor": f"Cusp {cusp_info['cusp']} sub-lord: {sl}",
                    "description": (
                        f"Sub-lord {sl} of house {cusp_info['cusp']} signifies houses {sl_houses}"
                    ),
                    "relevance": relevance,
                })

        # ----- 7. Confidence scoring -----
        # Based on number and strength of significators
        total_favorable = len(favorable)
        total_planets = len(KP_PLANETS)

        # Base confidence — scale down when too many planets are "favorable"
        # (indicates weak filtering, not strong indication)
        sig_ratio = total_favorable / total_planets if total_planets else 0
        if sig_ratio > 0.7:
            # Most planets signify everything in KP; penalize diffuse signals
            confidence = min(0.35 + (1.0 - sig_ratio) * 0.5, 0.65)
        else:
            confidence = min(0.4 + sig_ratio * 0.5, 0.75)

        # Boost if dasha lords are favorable
        if dasha:
            if dasha.maha_lord in favorable:
                confidence = min(confidence + 0.1, 1.0)
            if dasha.antar_lord and dasha.antar_lord in favorable:
                confidence = min(confidence + 0.05, 1.0)

        # Boost if ruling planets overlap with favorable significators
        ruling_names = {r["planet"] for r in ruling}
        ruling_overlap = ruling_names & set(favorable)
        if ruling_overlap:
            confidence = min(confidence + 0.05 * len(ruling_overlap), 1.0)

        # Reduce if birth time is unreliable (cusps may be off)
        uncertainty_flags: list[str] = []
        if chart.birth_time_quality != "exact":
            confidence = max(confidence - 0.15, 0.1)
            uncertainty_flags.append("birth_time_not_exact_cusps_may_shift")

        # Clamp
        confidence = round(max(0.0, min(confidence, 1.0)), 3)

        # ----- Build evidence -----
        relevant_planets = favorable if favorable else [p["planet"] for p in planet_sig_list[:3]]
        relevant_houses = target_houses
        relevant_aspects = []  # KP doesn't primarily use aspects

        return KPEvidence(
            relevant_planets=relevant_planets,
            relevant_houses=relevant_houses,
            relevant_aspects=relevant_aspects,
            confidence=confidence,
            uncertainty_flags=uncertainty_flags,
            planet_significators=planet_sig_list,
            cusp_sub_lords=cusp_sub_lord_list,
            favorable_significators=favorable,
            ruling_planets=ruling,
            timing_indicators=timing_indicators,
            domain_factors=domain_factors,
        )

    @staticmethod
    def _sign_from_longitude(longitude: float) -> str:
        signs = [
            "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
            "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
        ]
        idx = int(longitude // 30) % 12
        return signs[idx]
