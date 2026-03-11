"""Vedic (Jyotish) astrology interpretation engine.

Analyses a sidereal chart using planet dignities, house lordships, yoga
detection, Vimshottari Dasha context, and Vedic special aspects.
"""

from __future__ import annotations

from src.core.models.chart import CanonicalChart, PlanetPosition
from src.engines.base import BaseEvidence, BaseEngine

# ---------------------------------------------------------------------------
# Vedic constants
# ---------------------------------------------------------------------------

SIGNS = [
    "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
    "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
]

EXALTATION = {
    "Sun": "Aries", "Moon": "Taurus", "Mercury": "Virgo", "Venus": "Pisces",
    "Mars": "Capricorn", "Jupiter": "Cancer", "Saturn": "Libra",
    "Rahu": "Taurus", "Ketu": "Scorpio",
}

DEBILITATION = {
    "Sun": "Libra", "Moon": "Scorpio", "Mercury": "Pisces", "Venus": "Virgo",
    "Mars": "Cancer", "Jupiter": "Capricorn", "Saturn": "Aries",
    "Rahu": "Scorpio", "Ketu": "Taurus",
}

OWN_SIGNS = {
    "Sun": ["Leo"], "Moon": ["Cancer"],
    "Mercury": ["Gemini", "Virgo"], "Venus": ["Taurus", "Libra"],
    "Mars": ["Aries", "Scorpio"], "Jupiter": ["Sagittarius", "Pisces"],
    "Saturn": ["Capricorn", "Aquarius"],
    "Rahu": ["Aquarius"], "Ketu": ["Scorpio"],
}

SIGN_LORDS = {
    "Aries": "Mars", "Taurus": "Venus", "Gemini": "Mercury",
    "Cancer": "Moon", "Leo": "Sun", "Virgo": "Mercury",
    "Libra": "Venus", "Scorpio": "Mars", "Sagittarius": "Jupiter",
    "Capricorn": "Saturn", "Aquarius": "Saturn", "Pisces": "Jupiter",
}

DOMAIN_HOUSES = {
    "career": [1, 2, 6, 10, 11],
    "relationships": [5, 7, 8, 11],
    "marriage": [2, 7, 8, 12],
    "family": [2, 4, 5, 9],
    "money": [2, 5, 8, 11],
    "health": [1, 6, 8, 12],
    "purpose": [1, 5, 9, 10],
    "personality": [1, 2, 3, 5],
    "education": [2, 4, 5, 9],
    "spirituality": [5, 8, 9, 12],
    "timing": [1, 10],
    "general": [1, 4, 7, 10],
}

# Friendly signs for each planet (beyond own/exaltation).
FRIENDLY_SIGNS = {
    "Sun": ["Aries", "Sagittarius", "Pisces", "Cancer", "Scorpio"],
    "Moon": ["Taurus", "Gemini", "Virgo", "Pisces"],
    "Mercury": ["Taurus", "Leo", "Libra"],
    "Venus": ["Cancer", "Capricorn", "Aquarius", "Pisces", "Gemini"],
    "Mars": ["Leo", "Sagittarius", "Pisces", "Cancer"],
    "Jupiter": ["Aries", "Leo", "Scorpio"],
    "Saturn": ["Gemini", "Virgo", "Taurus", "Libra"],
    "Rahu": ["Gemini", "Virgo", "Sagittarius", "Pisces"],
    "Ketu": ["Sagittarius", "Pisces", "Gemini"],
}

ENEMY_SIGNS = {
    "Sun": ["Taurus", "Libra", "Capricorn", "Aquarius"],
    "Moon": ["Scorpio", "Capricorn", "Aquarius"],
    "Mercury": ["Cancer", "Scorpio", "Aries"],
    "Venus": ["Leo", "Aries", "Scorpio"],
    "Mars": ["Gemini", "Virgo", "Taurus", "Libra"],
    "Jupiter": ["Gemini", "Virgo", "Capricorn", "Taurus"],
    "Saturn": ["Aries", "Leo", "Cancer", "Scorpio"],
    "Rahu": ["Leo", "Cancer", "Aries", "Scorpio"],
    "Ketu": ["Taurus", "Libra", "Cancer", "Leo"],
}

# Vedic special aspects: planet -> list of extra houses aspected
# (in addition to the universal 7th-house aspect).
SPECIAL_ASPECTS = {
    "Mars": [4, 8],
    "Jupiter": [5, 9],
    "Saturn": [3, 10],
}

KENDRA_HOUSES = [1, 4, 7, 10]
TRIKONA_HOUSES = [1, 5, 9]
DUSTHANA_HOUSES = [6, 8, 12]

MAHAPURUSHA_PLANETS = ["Mars", "Mercury", "Jupiter", "Venus", "Saturn"]


# ---------------------------------------------------------------------------
# Evidence model
# ---------------------------------------------------------------------------

class VedicEvidence(BaseEvidence):
    """Structured evidence produced by the Vedic interpretation engine."""

    method: str = "vedic"
    planet_dignities: list[dict]
    house_analysis: list[dict]
    yogas: list[dict]
    dasha_context: dict | None
    vedic_aspects: list[dict]
    domain_factors: list[dict]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _sign_index(sign: str) -> int:
    """Return the 0-based index for a zodiac sign name."""
    return SIGNS.index(sign)


def _house_distance(from_house: int, to_house: int) -> int:
    """Return the 1-based distance from *from_house* to *to_house*."""
    return (to_house - from_house) % 12 or 12


def _planet_map(planets: list[PlanetPosition]) -> dict[str, PlanetPosition]:
    """Build a name-keyed lookup dict from a list of planet positions."""
    return {p.name: p for p in planets}


def _get_dignity(planet_name: str, sign: str) -> str:
    """Determine the dignity of a planet in a given sign."""
    if EXALTATION.get(planet_name) == sign:
        return "exalted"
    if DEBILITATION.get(planet_name) == sign:
        return "debilitated"
    if sign in OWN_SIGNS.get(planet_name, []):
        return "own"
    if sign in FRIENDLY_SIGNS.get(planet_name, []):
        return "friendly"
    if sign in ENEMY_SIGNS.get(planet_name, []):
        return "enemy"
    return "neutral"


def _vedic_aspects_for_planet(
    planet: PlanetPosition,
    houses: list,
) -> list[dict]:
    """Return the list of houses aspected by *planet* using Vedic rules."""
    if planet.house is None:
        return []
    aspects: list[dict] = []
    # Universal 7th aspect
    target_7 = (planet.house - 1 + 7) % 12 + 1
    aspects.append({
        "aspecting_planet": planet.name,
        "aspected_house": target_7,
        "aspect_type": "7th (full)",
    })
    for extra in SPECIAL_ASPECTS.get(planet.name, []):
        target = (planet.house - 1 + extra) % 12 + 1
        aspects.append({
            "aspecting_planet": planet.name,
            "aspected_house": target,
            "aspect_type": f"{_ordinal(extra)} (special)",
        })
    return aspects


def _ordinal(n: int) -> str:
    """Return the ordinal string for a number (e.g. 1st, 2nd, 3rd)."""
    suffix = {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    if 11 <= n % 100 <= 13:
        suffix = "th"
    return f"{n}{suffix}"


# ---------------------------------------------------------------------------
# Yoga detectors
# ---------------------------------------------------------------------------

def _detect_gajakesari(pmap: dict[str, PlanetPosition]) -> list[dict]:
    """Detect Gajakesari Yoga (Jupiter in kendra from Moon)."""
    moon = pmap.get("Moon")
    jupiter = pmap.get("Jupiter")
    if not moon or not jupiter or moon.house is None or jupiter.house is None:
        return []
    dist = _house_distance(moon.house, jupiter.house)
    if dist in KENDRA_HOUSES:
        jup_dignity = _get_dignity("Jupiter", jupiter.sign)
        strength = "strong" if jup_dignity in ("exalted", "own") else "moderate"
        return [{
            "name": "Gajakesari Yoga",
            "description": (
                "Jupiter in a kendra from Moon -- bestows wisdom, wealth and "
                "lasting reputation."
            ),
            "planets_involved": ["Moon", "Jupiter"],
            "strength": strength,
        }]
    return []


def _detect_budhaditya(pmap: dict[str, PlanetPosition]) -> list[dict]:
    """Detect Budhaditya Yoga (Sun-Mercury conjunction)."""
    sun = pmap.get("Sun")
    mercury = pmap.get("Mercury")
    if not sun or not mercury:
        return []
    if sun.sign == mercury.sign:
        # Combust or retrograde Mercury weakens the yoga
        strength = "moderate"
        if _get_dignity("Mercury", mercury.sign) in ("exalted", "own"):
            strength = "strong"
        if mercury.retrograde:
            strength = "weak"
        return [{
            "name": "Budhaditya Yoga",
            "description": (
                "Sun and Mercury conjunct -- sharp intellect, communication "
                "skills and potential fame."
            ),
            "planets_involved": ["Sun", "Mercury"],
            "strength": strength,
        }]
    return []


def _detect_viparita_raja(
    pmap: dict[str, PlanetPosition],
    houses_ws: list,
) -> list[dict]:
    """Detect Viparita Raja Yoga (lords of 6, 8, 12 placed in each other's houses)."""
    lord_6 = houses_ws[5].lord
    lord_8 = houses_ws[7].lord
    lord_12 = houses_ws[11].lord

    dusthana_lords = {6: lord_6, 8: lord_8, 12: lord_12}
    pairs: list[tuple[int, int]] = [(6, 8), (6, 12), (8, 12)]
    yogas: list[dict] = []

    for h_a, h_b in pairs:
        planet_a = pmap.get(dusthana_lords[h_a])
        planet_b = pmap.get(dusthana_lords[h_b])
        if not planet_a or not planet_b:
            continue
        if planet_a.house == h_b and planet_b.house == h_a:
            yogas.append({
                "name": "Viparita Raja Yoga",
                "description": (
                    f"Lord of {h_a} in {h_b} and lord of {h_b} in {h_a} -- "
                    "triumph through adversity, unexpected gains from losses."
                ),
                "planets_involved": [dusthana_lords[h_a], dusthana_lords[h_b]],
                "strength": "moderate",
            })
    # Also check single-planet version: dusthana lord in another dusthana
    for h_src, lord_name in dusthana_lords.items():
        planet = pmap.get(lord_name)
        if not planet:
            continue
        other_dusthanas = [h for h in DUSTHANA_HOUSES if h != h_src]
        if planet.house in other_dusthanas:
            already = any(
                lord_name in y["planets_involved"] for y in yogas
            )
            if not already:
                yogas.append({
                    "name": "Viparita Raja Yoga",
                    "description": (
                        f"Lord of {h_src} ({lord_name}) placed in house "
                        f"{planet.house} -- success arising from difficulties."
                    ),
                    "planets_involved": [lord_name],
                    "strength": "weak",
                })
    return yogas


def _detect_chandra_mangala(pmap: dict[str, PlanetPosition]) -> list[dict]:
    """Detect Chandra-Mangala Yoga (Moon-Mars association)."""
    moon = pmap.get("Moon")
    mars = pmap.get("Mars")
    if not moon or not mars:
        return []
    same_sign = moon.sign == mars.sign
    mutual_aspect = False
    if moon.house is not None and mars.house is not None:
        dist_m_to_ma = _house_distance(moon.house, mars.house)
        dist_ma_to_m = _house_distance(mars.house, moon.house)
        # Moon aspects 7th; Mars aspects 4, 7, 8
        mars_aspects_moon = dist_ma_to_m in [4, 7, 8]
        moon_aspects_mars = dist_m_to_ma == 7
        mutual_aspect = mars_aspects_moon and moon_aspects_mars
    if same_sign or mutual_aspect:
        strength = "strong" if same_sign else "moderate"
        return [{
            "name": "Chandra-Mangala Yoga",
            "description": (
                "Moon and Mars associated -- wealth through courage and "
                "determination, entrepreneurial ability."
            ),
            "planets_involved": ["Moon", "Mars"],
            "strength": strength,
        }]
    return []


def _detect_dhana_yoga(
    pmap: dict[str, PlanetPosition],
    houses_ws: list,
) -> list[dict]:
    """Detect Dhana Yoga (connection between lords of 2nd and 11th houses)."""
    lord_2 = houses_ws[1].lord
    lord_11 = houses_ws[10].lord
    p2 = pmap.get(lord_2)
    p11 = pmap.get(lord_11)
    if not p2 or not p11:
        return []
    connected = False
    description_detail = ""
    # Conjunction (same sign)
    if p2.sign == p11.sign:
        connected = True
        description_detail = "conjunct"
    # Mutual exchange
    elif p2.house == 11 and p11.house == 2:
        connected = True
        description_detail = "in mutual exchange"
    # One in the other's house
    elif p2.house == 11 or p11.house == 2:
        connected = True
        description_detail = "connected by house placement"
    if connected:
        strength = "strong" if description_detail == "in mutual exchange" else "moderate"
        return [{
            "name": "Dhana Yoga",
            "description": (
                f"Lords of 2nd ({lord_2}) and 11th ({lord_11}) {description_detail} -- "
                "wealth accumulation and financial gains."
            ),
            "planets_involved": [lord_2, lord_11],
            "strength": strength,
        }]
    return []


def _detect_raja_yoga(
    pmap: dict[str, PlanetPosition],
    houses_ws: list,
) -> list[dict]:
    """Detect Raja Yoga (kendra-trikona lord connections)."""
    kendra_lords: set[str] = set()
    trikona_lords: set[str] = set()
    for h in KENDRA_HOUSES:
        lord = houses_ws[h - 1].lord
        if lord:
            kendra_lords.add(lord)
    for h in TRIKONA_HOUSES:
        lord = houses_ws[h - 1].lord
        if lord:
            trikona_lords.add(lord)

    yogas: list[dict] = []
    seen_pairs: set[tuple[str, str]] = set()

    for k_lord in kendra_lords:
        for t_lord in trikona_lords:
            if k_lord == t_lord:
                # Same planet lords both a kendra and a trikona
                p = pmap.get(k_lord)
                if p and p.house is not None:
                    pair = tuple(sorted([k_lord]))
                    if pair not in seen_pairs:
                        seen_pairs.add(pair)
                        strength = (
                            "strong"
                            if _get_dignity(k_lord, p.sign) in ("exalted", "own")
                            else "moderate"
                        )
                        yogas.append({
                            "name": "Raja Yoga",
                            "description": (
                                f"{k_lord} lords both a kendra and a trikona -- "
                                "power, authority and success."
                            ),
                            "planets_involved": [k_lord],
                            "strength": strength,
                        })
                continue

            pk = pmap.get(k_lord)
            pt = pmap.get(t_lord)
            if not pk or not pt:
                continue
            pair = tuple(sorted([k_lord, t_lord]))
            if pair in seen_pairs:
                continue
            # Conjunction
            if pk.sign == pt.sign:
                seen_pairs.add(pair)
                yogas.append({
                    "name": "Raja Yoga",
                    "description": (
                        f"Kendra lord {k_lord} conjunct trikona lord {t_lord} -- "
                        "authority, recognition and success."
                    ),
                    "planets_involved": [k_lord, t_lord],
                    "strength": "strong",
                })
            # Mutual exchange
            elif pk.house and pt.house:
                k_houses = [h for h in KENDRA_HOUSES if houses_ws[h - 1].lord == k_lord]
                t_houses = [h for h in TRIKONA_HOUSES if houses_ws[h - 1].lord == t_lord]
                if pt.house in k_houses and pk.house in t_houses:
                    seen_pairs.add(pair)
                    yogas.append({
                        "name": "Raja Yoga",
                        "description": (
                            f"Kendra lord {k_lord} and trikona lord {t_lord} "
                            "in mutual exchange -- great fortune and leadership."
                        ),
                        "planets_involved": [k_lord, t_lord],
                        "strength": "strong",
                    })
    return yogas


def _detect_pancha_mahapurusha(pmap: dict[str, PlanetPosition]) -> list[dict]:
    """Detect Pancha Mahapurusha Yogas (five great person yogas)."""
    yoga_names = {
        "Mars": "Ruchaka",
        "Mercury": "Bhadra",
        "Jupiter": "Hamsa",
        "Venus": "Malavya",
        "Saturn": "Shasha",
    }
    yogas: list[dict] = []
    for planet_name in MAHAPURUSHA_PLANETS:
        p = pmap.get(planet_name)
        if not p or p.house is None:
            continue
        dignity = _get_dignity(planet_name, p.sign)
        if dignity in ("exalted", "own") and p.house in KENDRA_HOUSES:
            yogas.append({
                "name": f"Pancha Mahapurusha -- {yoga_names[planet_name]} Yoga",
                "description": (
                    f"{planet_name} in {dignity} sign in house {p.house} (kendra) -- "
                    f"extraordinary qualities of {planet_name}."
                ),
                "planets_involved": [planet_name],
                "strength": "strong",
            })
    return yogas


# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------

class VedicEngine(BaseEngine):
    """Vedic (Jyotish) interpretation engine using sidereal zodiac."""

    def extract_evidence(
        self, chart: CanonicalChart, domain: str, query: str
    ) -> VedicEvidence:
        """Extract Vedic astrological evidence for a given domain and query."""
        planets = chart.sidereal_planets
        houses_ws = chart.houses_whole_sign
        pmap = _planet_map(planets)
        domain_key = self._resolve_domain(domain)
        relevant_house_numbers = DOMAIN_HOUSES.get(domain_key, DOMAIN_HOUSES["general"])

        # 1. Planet dignities
        planet_dignities = []
        for p in planets:
            planet_dignities.append({
                "planet": p.name,
                "sign": p.sign,
                "dignity": _get_dignity(p.name, p.sign),
                "house": p.house,
            })

        # 2. House analysis for relevant houses
        house_analysis = []
        for h_num in relevant_house_numbers:
            h = houses_ws[h_num - 1]
            lord = h.lord
            lord_planet = pmap.get(lord)
            lord_house = lord_planet.house if lord_planet else None
            planets_in = [p.name for p in planets if p.house == h_num]
            house_analysis.append({
                "house": h_num,
                "sign": h.sign,
                "lord": lord,
                "lord_house": lord_house,
                "planets_in_house": planets_in,
            })

        # 3. Yoga detection
        yogas: list[dict] = []
        yogas.extend(_detect_gajakesari(pmap))
        yogas.extend(_detect_budhaditya(pmap))
        yogas.extend(_detect_viparita_raja(pmap, houses_ws))
        yogas.extend(_detect_chandra_mangala(pmap))
        yogas.extend(_detect_dhana_yoga(pmap, houses_ws))
        yogas.extend(_detect_raja_yoga(pmap, houses_ws))
        yogas.extend(_detect_pancha_mahapurusha(pmap))

        # 4. Dasha context
        dasha_context = None
        if chart.vimshottari_dasha:
            dasha = chart.vimshottari_dasha
            maha_planet = pmap.get(dasha.maha_lord)
            antar_planet = pmap.get(dasha.antar_lord) if dasha.antar_lord else None
            maha_lord_house = maha_planet.house if maha_planet else None
            antar_lord_house = antar_planet.house if antar_planet else None

            maha_dignity = (
                _get_dignity(dasha.maha_lord, maha_planet.sign)
                if maha_planet else "unknown"
            )
            interp_parts = [
                f"Maha dasha of {dasha.maha_lord} (house {maha_lord_house}, "
                f"{maha_dignity})"
            ]
            if dasha.antar_lord:
                antar_dignity = (
                    _get_dignity(dasha.antar_lord, antar_planet.sign)
                    if antar_planet else "unknown"
                )
                interp_parts.append(
                    f"Antar dasha of {dasha.antar_lord} (house "
                    f"{antar_lord_house}, {antar_dignity})"
                )
            dasha_context = {
                "maha_lord": dasha.maha_lord,
                "antar_lord": dasha.antar_lord,
                "maha_lord_house": maha_lord_house,
                "antar_lord_house": antar_lord_house,
                "interpretation": "; ".join(interp_parts),
            }

        # 5. Vedic aspects for planets relevant to the domain
        vedic_aspects: list[dict] = []
        relevant_planets_set: set[str] = set()
        for ha in house_analysis:
            if ha["lord"]:
                relevant_planets_set.add(ha["lord"])
            for pn in ha["planets_in_house"]:
                relevant_planets_set.add(pn)
        for p in planets:
            if p.name in relevant_planets_set:
                vedic_aspects.extend(_vedic_aspects_for_planet(p, houses_ws))

        # 6. Domain factors
        domain_factors = self._compile_domain_factors(
            domain_key, house_analysis, planet_dignities, yogas,
            dasha_context, vedic_aspects, pmap, houses_ws,
        )

        # 7. Confidence
        uncertainty_flags: list[str] = []
        if chart.birth_time_quality == "unknown":
            uncertainty_flags.append("birth_time_unknown")
        if chart.birth_time_quality == "approximate":
            uncertainty_flags.append("birth_time_approximate")
        if not chart.vimshottari_dasha:
            uncertainty_flags.append("no_dasha_data")

        confidence = self._compute_confidence(
            planet_dignities, yogas, house_analysis, dasha_context,
            uncertainty_flags,
        )

        # Collect all relevant planet / house / aspect names for the base fields
        all_relevant_planets = sorted(relevant_planets_set)
        all_relevant_houses = sorted(relevant_house_numbers)
        all_relevant_aspects = [
            f"{a['aspecting_planet']}->H{a['aspected_house']}"
            for a in vedic_aspects
        ]

        return VedicEvidence(
            relevant_planets=all_relevant_planets,
            relevant_houses=all_relevant_houses,
            relevant_aspects=all_relevant_aspects,
            confidence=confidence,
            uncertainty_flags=uncertainty_flags,
            planet_dignities=planet_dignities,
            house_analysis=house_analysis,
            yogas=yogas,
            dasha_context=dasha_context,
            vedic_aspects=vedic_aspects,
            domain_factors=domain_factors,
        )

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _resolve_domain(domain: str) -> str:
        """Map a user-supplied domain string to a canonical domain key."""
        domain_lower = domain.strip().lower()
        if domain_lower in DOMAIN_HOUSES:
            return domain_lower
        # Fuzzy matching for common synonyms
        synonyms = {
            "job": "career", "work": "career", "profession": "career",
            "promotion": "career", "business": "career",
            "love": "relationships", "romance": "relationships",
            "partner": "marriage", "spouse": "marriage", "wedding": "marriage",
            "children": "family", "parents": "family", "kids": "family",
            "finance": "money", "wealth": "money", "income": "money",
            "disease": "health", "illness": "health", "medical": "health",
            "dharma": "purpose", "destiny": "purpose", "life path": "purpose",
            "studies": "education", "learning": "education",
            "meditation": "spirituality", "moksha": "spirituality",
        }
        return synonyms.get(domain_lower, "general")

    @staticmethod
    def _compile_domain_factors(
        domain: str,
        house_analysis: list[dict],
        planet_dignities: list[dict],
        yogas: list[dict],
        dasha_context: dict | None,
        vedic_aspects: list[dict],
        pmap: dict[str, PlanetPosition],
        houses_ws: list,
    ) -> list[dict]:
        """Build a list of high-level domain factors for the reading."""
        factors: list[dict] = []

        # Dignity-based factors for lords of relevant houses
        relevant_lords = {ha["lord"] for ha in house_analysis if ha["lord"]}
        dignity_lookup = {d["planet"]: d["dignity"] for d in planet_dignities}
        for lord in relevant_lords:
            dignity = dignity_lookup.get(lord, "neutral")
            if dignity in ("exalted", "own"):
                factors.append({
                    "factor": f"{lord} dignity",
                    "description": (
                        f"{lord} is {dignity} in {pmap[lord].sign} -- strengthens "
                        f"house(s) it lords."
                    ),
                    "relevance": "high",
                })
            elif dignity == "debilitated":
                factors.append({
                    "factor": f"{lord} dignity",
                    "description": (
                        f"{lord} is debilitated in {pmap[lord].sign} -- weakens "
                        f"house(s) it lords."
                    ),
                    "relevance": "high",
                })
            elif dignity == "enemy":
                factors.append({
                    "factor": f"{lord} dignity",
                    "description": (
                        f"{lord} is in enemy sign {pmap[lord].sign} -- mild "
                        f"weakness for its significations."
                    ),
                    "relevance": "medium",
                })

        # Planets in relevant houses
        for ha in house_analysis:
            for planet_name in ha["planets_in_house"]:
                dignity = dignity_lookup.get(planet_name, "neutral")
                rel = "high" if dignity in ("exalted", "own") else "medium"
                factors.append({
                    "factor": f"{planet_name} in house {ha['house']}",
                    "description": (
                        f"{planet_name} ({dignity}) occupies house {ha['house']} "
                        f"({ha['sign']}) -- direct influence on {domain} matters."
                    ),
                    "relevance": rel,
                })

        # Yogas relevant to domain
        for yoga in yogas:
            factors.append({
                "factor": yoga["name"],
                "description": yoga["description"],
                "relevance": "high" if yoga["strength"] == "strong" else "medium",
            })

        # Dasha factor
        if dasha_context:
            relevant_houses_set = {ha["house"] for ha in house_analysis}
            maha_house = dasha_context.get("maha_lord_house")
            antar_house = dasha_context.get("antar_lord_house")
            dasha_relevant = (
                maha_house in relevant_houses_set
                or antar_house in relevant_houses_set
            )
            factors.append({
                "factor": "Dasha period",
                "description": dasha_context["interpretation"],
                "relevance": "high" if dasha_relevant else "low",
            })

        return factors

    @staticmethod
    def _compute_confidence(
        planet_dignities: list[dict],
        yogas: list[dict],
        house_analysis: list[dict],
        dasha_context: dict | None,
        uncertainty_flags: list[str],
    ) -> float:
        """Compute a heuristic confidence score between 0 and 1."""
        score = 0.5  # baseline

        # Strong dignities boost confidence
        strong_count = sum(
            1 for d in planet_dignities
            if d["dignity"] in ("exalted", "own")
        )
        score += min(strong_count * 0.03, 0.15)

        # Yogas boost
        strong_yogas = sum(1 for y in yogas if y["strength"] == "strong")
        moderate_yogas = sum(1 for y in yogas if y["strength"] == "moderate")
        score += min(strong_yogas * 0.05 + moderate_yogas * 0.02, 0.15)

        # Houses with planets = more data
        occupied = sum(1 for ha in house_analysis if ha["planets_in_house"])
        score += min(occupied * 0.03, 0.10)

        # Dasha available
        if dasha_context:
            score += 0.05

        # Penalties
        if "birth_time_unknown" in uncertainty_flags:
            score -= 0.15
        if "birth_time_approximate" in uncertainty_flags:
            score -= 0.05

        return round(max(0.0, min(1.0, score)), 2)
