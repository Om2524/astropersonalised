"""Western (tropical/Placidus) astrology interpretation engine.

Uses tropical zodiac, Placidus houses, and psychological interpretation
of planet-sign-house placements, aspects, and chart patterns.
"""

from __future__ import annotations

from src.core.models.chart import CanonicalChart, PlanetPosition, Aspect
from src.engines.base import BaseEvidence, BaseEngine

# ---------------------------------------------------------------------------
# Reference data
# ---------------------------------------------------------------------------

PLANET_KEYWORDS: dict[str, dict] = {
    "Sun": {"archetype": "identity", "keywords": ["self-expression", "vitality", "purpose", "ego", "authority"]},
    "Moon": {"archetype": "emotions", "keywords": ["feelings", "instincts", "nurturing", "subconscious", "comfort"]},
    "Mercury": {"archetype": "mind", "keywords": ["communication", "thinking", "learning", "analysis", "adaptability"]},
    "Venus": {"archetype": "values", "keywords": ["love", "beauty", "relationships", "pleasure", "harmony"]},
    "Mars": {"archetype": "drive", "keywords": ["action", "energy", "ambition", "courage", "conflict"]},
    "Jupiter": {"archetype": "expansion", "keywords": ["growth", "wisdom", "optimism", "abundance", "philosophy"]},
    "Saturn": {"archetype": "structure", "keywords": ["discipline", "responsibility", "limits", "maturity", "karma"]},
    "Rahu": {"archetype": "obsession", "keywords": ["desire", "ambition", "worldly-pursuits", "disruption"]},
    "Ketu": {"archetype": "release", "keywords": ["detachment", "spirituality", "past-life", "liberation"]},
}

ELEMENTS: dict[str, str] = {
    "Aries": "Fire", "Taurus": "Earth", "Gemini": "Air", "Cancer": "Water",
    "Leo": "Fire", "Virgo": "Earth", "Libra": "Air", "Scorpio": "Water",
    "Sagittarius": "Fire", "Capricorn": "Earth", "Aquarius": "Air", "Pisces": "Water",
}

MODALITIES: dict[str, str] = {
    "Aries": "Cardinal", "Taurus": "Fixed", "Gemini": "Mutable",
    "Cancer": "Cardinal", "Leo": "Fixed", "Virgo": "Mutable",
    "Libra": "Cardinal", "Scorpio": "Fixed", "Sagittarius": "Mutable",
    "Capricorn": "Cardinal", "Aquarius": "Fixed", "Pisces": "Mutable",
}

HOUSE_THEMES: dict[int, str] = {
    1: "self, identity, appearance",
    2: "values, possessions, self-worth",
    3: "communication, siblings, short journeys",
    4: "home, family, roots, inner foundation",
    5: "creativity, romance, children, joy",
    6: "health, service, daily routines",
    7: "partnerships, marriage, open enemies",
    8: "transformation, shared resources, intimacy",
    9: "philosophy, higher education, travel",
    10: "career, public image, achievement",
    11: "community, hopes, friendships",
    12: "spirituality, subconscious, hidden matters",
}

DOMAIN_HOUSES: dict[str, list[int]] = {
    "career": [2, 6, 10],
    "relationships": [5, 7, 8],
    "marriage": [7, 8],
    "family": [4, 5],
    "money": [2, 8, 11],
    "health": [1, 6],
    "purpose": [1, 9, 10],
    "personality": [1, 5],
    "education": [3, 9],
    "spirituality": [9, 12],
    "general": [1, 4, 7, 10],
}

# Aspect type to typical interpretation flavour
_ASPECT_QUALITY: dict[str, str] = {
    "conjunction": "fusion/intensification",
    "opposition": "tension/awareness",
    "trine": "ease/flow",
    "square": "challenge/growth",
    "sextile": "opportunity",
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _planets_by_sign(planets: list[PlanetPosition]) -> dict[str, list[str]]:
    """Group planet names by their sign."""
    by_sign: dict[str, list[str]] = {}
    for p in planets:
        by_sign.setdefault(p.sign, []).append(p.name)
    return by_sign


def _planets_by_house(planets: list[PlanetPosition]) -> dict[int, list[str]]:
    """Group planet names by house number."""
    by_house: dict[int, list[str]] = {}
    for p in planets:
        if p.house is not None:
            by_house.setdefault(p.house, []).append(p.name)
    return by_house


def _planet_longitude_map(planets: list[PlanetPosition]) -> dict[str, float]:
    """Build a name -> longitude lookup from a list of planet positions."""
    return {p.name: p.longitude for p in planets}


def _angular_distance(a: float, b: float) -> float:
    """Shortest arc between two ecliptic longitudes (0-180)."""
    diff = abs(a - b) % 360
    return diff if diff <= 180 else 360 - diff


# ---------------------------------------------------------------------------
# Pattern detection
# ---------------------------------------------------------------------------


def _detect_stellia(by_sign: dict[str, list[str]]) -> list[dict]:
    """Detect stelliums (3+ planets in one sign)."""
    results: list[dict] = []
    for sign, planets in by_sign.items():
        if len(planets) >= 3:
            results.append({
                "name": "Stellium",
                "planets": planets,
                "signs": [sign],
                "description": (
                    f"Stellium in {sign} ({ELEMENTS.get(sign, '?')} / "
                    f"{MODALITIES.get(sign, '?')}): concentrated energy through "
                    f"{', '.join(planets)}"
                ),
            })
    return results


def _detect_t_square(aspects: list[Aspect], lon: dict[str, float]) -> list[dict]:
    """Detect T-Square: two planets in opposition, a third squaring both."""
    oppositions = [a for a in aspects if a.aspect_type == "opposition"]
    squares = [a for a in aspects if a.aspect_type == "square"]
    square_pairs: set[frozenset[str]] = {frozenset([s.planet1, s.planet2]) for s in squares}

    results: list[dict] = []
    seen: set[frozenset[str]] = set()
    for opp in oppositions:
        p1, p2 = opp.planet1, opp.planet2
        for sq in squares:
            apex: str | None = None
            if sq.planet1 in (p1, p2):
                apex = sq.planet2
            elif sq.planet2 in (p1, p2):
                apex = sq.planet1
            else:
                continue
            if apex is None or apex in (p1, p2):
                continue
            other = p1 if sq.planet1 == apex or sq.planet2 == apex else p2
            remaining = p2 if other == p1 else p1
            if frozenset([apex, remaining]) not in square_pairs:
                continue
            key = frozenset([p1, p2, apex])
            if key in seen:
                continue
            seen.add(key)
            results.append({
                "name": "T-Square",
                "planets": sorted([p1, p2, apex]),
                "signs": [],
                "description": (
                    f"T-Square with {apex} at the apex, opposing pair "
                    f"{p1}-{p2}: dynamic tension driving action"
                ),
            })
    return results


def _detect_grand_trine(aspects: list[Aspect]) -> list[dict]:
    """Detect Grand Trine: three mutual trines forming a triangle."""
    trines = [a for a in aspects if a.aspect_type == "trine"]
    trine_pairs: dict[frozenset[str], Aspect] = {}
    for t in trines:
        trine_pairs[frozenset([t.planet1, t.planet2])] = t

    planets_in_trines: set[str] = set()
    for t in trines:
        planets_in_trines.add(t.planet1)
        planets_in_trines.add(t.planet2)

    results: list[dict] = []
    seen: set[frozenset[str]] = set()
    planet_list = sorted(planets_in_trines)
    for i, a in enumerate(planet_list):
        for j in range(i + 1, len(planet_list)):
            b = planet_list[j]
            if frozenset([a, b]) not in trine_pairs:
                continue
            for k in range(j + 1, len(planet_list)):
                c = planet_list[k]
                if (
                    frozenset([a, c]) in trine_pairs
                    and frozenset([b, c]) in trine_pairs
                ):
                    key = frozenset([a, b, c])
                    if key not in seen:
                        seen.add(key)
                        results.append({
                            "name": "Grand Trine",
                            "planets": sorted([a, b, c]),
                            "signs": [],
                            "description": (
                                f"Grand Trine among {a}, {b}, {c}: "
                                "natural talent and ease of flow"
                            ),
                        })
    return results


def _detect_grand_cross(aspects: list[Aspect]) -> list[dict]:
    """Detect Grand Cross: 4 planets, 2 oppositions, 4 squares."""
    oppositions = [a for a in aspects if a.aspect_type == "opposition"]
    square_set: set[frozenset[str]] = {
        frozenset([a.planet1, a.planet2])
        for a in aspects
        if a.aspect_type == "square"
    }

    results: list[dict] = []
    seen: set[frozenset[str]] = set()
    for i, o1 in enumerate(oppositions):
        for o2 in oppositions[i + 1:]:
            pts = {o1.planet1, o1.planet2, o2.planet1, o2.planet2}
            if len(pts) != 4:
                continue
            # Need all four adjacent squares
            g1 = [o1.planet1, o1.planet2]
            g2 = [o2.planet1, o2.planet2]
            all_squares = all(
                frozenset([a, b]) in square_set for a in g1 for b in g2
            )
            if all_squares:
                key = frozenset(pts)
                if key not in seen:
                    seen.add(key)
                    results.append({
                        "name": "Grand Cross",
                        "planets": sorted(pts),
                        "signs": [],
                        "description": (
                            f"Grand Cross among {', '.join(sorted(pts))}: "
                            "powerful tension demanding integration"
                        ),
                    })
    return results


# ---------------------------------------------------------------------------
# Evidence model
# ---------------------------------------------------------------------------


class WesternEvidence(BaseEvidence):
    """Structured evidence produced by the Western interpretation engine."""

    method: str = "western"
    planet_sign_analysis: list[dict]
    aspect_analysis: list[dict]
    patterns: list[dict]
    element_balance: dict
    modality_balance: dict
    house_emphasis: list[dict]
    domain_factors: list[dict]


# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------


class WesternEngine(BaseEngine):
    """Tropical / Placidus / psychological interpretation engine."""

    def extract_evidence(
        self, chart: CanonicalChart, domain: str, query: str
    ) -> WesternEvidence:
        """Extract Western astrological evidence for a given domain and query."""
        planets = chart.tropical_planets
        aspects = chart.aspects
        domain_key = domain.lower()
        relevant_houses = DOMAIN_HOUSES.get(domain_key, DOMAIN_HOUSES["general"])

        # --- 1. Planet-sign analysis ---
        planet_sign_analysis: list[dict] = []
        for p in planets:
            info = PLANET_KEYWORDS.get(p.name, {"archetype": "unknown", "keywords": []})
            planet_sign_analysis.append({
                "planet": p.name,
                "sign": p.sign,
                "house": p.house,
                "element": ELEMENTS.get(p.sign, "unknown"),
                "modality": MODALITIES.get(p.sign, "unknown"),
                "archetype": info["archetype"],
                "keywords": info["keywords"],
                "retrograde": p.retrograde,
            })

        # --- 2. Aspect analysis (filter to domain-relevant where possible) ---
        domain_planets: set[str] = set()
        for p in planets:
            if p.house is not None and p.house in relevant_houses:
                domain_planets.add(p.name)
        # Always include luminaries & key planets
        domain_planets.update({"Sun", "Moon"})

        aspect_analysis: list[dict] = []
        for a in aspects:
            is_domain = a.planet1 in domain_planets or a.planet2 in domain_planets
            aspect_analysis.append({
                "planet1": a.planet1,
                "planet2": a.planet2,
                "aspect_type": a.aspect_type,
                "orb": round(a.orb, 2),
                "interpretation_key": _ASPECT_QUALITY.get(a.aspect_type, "mixed"),
                "domain_relevant": is_domain,
            })

        # --- 3. Pattern detection ---
        by_sign = _planets_by_sign(planets)
        lon = _planet_longitude_map(planets)
        patterns: list[dict] = []
        patterns.extend(_detect_stellia(by_sign))
        patterns.extend(_detect_t_square(aspects, lon))
        patterns.extend(_detect_grand_trine(aspects))
        patterns.extend(_detect_grand_cross(aspects))

        # --- 4. Element & modality balance ---
        elem_counts: dict[str, int] = {"Fire": 0, "Earth": 0, "Air": 0, "Water": 0}
        mod_counts: dict[str, int] = {"Cardinal": 0, "Fixed": 0, "Mutable": 0}
        for p in planets:
            e = ELEMENTS.get(p.sign)
            m = MODALITIES.get(p.sign)
            if e:
                elem_counts[e] += 1
            if m:
                mod_counts[m] += 1

        dominant_elem = max(elem_counts, key=lambda k: elem_counts[k])
        lacking_elem = min(elem_counts, key=lambda k: elem_counts[k])
        max_elem_val = elem_counts[dominant_elem]
        dominant_elems = [e for e, c in elem_counts.items() if c == max_elem_val]
        dominant_mod = max(mod_counts, key=lambda k: mod_counts[k])

        element_balance: dict = {
            **elem_counts,
            "dominant": "/".join(dominant_elems),
            "lacking": lacking_elem,
        }
        modality_balance: dict = {
            **mod_counts,
            "dominant": dominant_mod,
        }

        # --- 5. House emphasis ---
        by_house = _planets_by_house(planets)
        house_emphasis: list[dict] = []
        for h in sorted(by_house.keys()):
            planet_names = by_house[h]
            house_emphasis.append({
                "house": h,
                "planets": planet_names,
                "theme": HOUSE_THEMES.get(h, ""),
                "relevance_to_domain": h in relevant_houses,
            })

        # --- 6. Domain factors ---
        domain_factors: list[dict] = []

        # 6a. Planets in domain houses
        for h in relevant_houses:
            house_planets = by_house.get(h, [])
            if house_planets:
                for pn in house_planets:
                    info = PLANET_KEYWORDS.get(pn, {"archetype": "unknown", "keywords": []})
                    domain_factors.append({
                        "factor": f"{pn} in house {h}",
                        "description": (
                            f"{pn} ({info['archetype']}) placed in the "
                            f"{_ordinal(h)} house of {HOUSE_THEMES.get(h, '?')}"
                        ),
                        "relevance": "high",
                    })

        # 6b. Aspects between domain-relevant planets
        for a in aspects:
            if a.planet1 in domain_planets and a.planet2 in domain_planets:
                domain_factors.append({
                    "factor": f"{a.planet1} {a.aspect_type} {a.planet2}",
                    "description": (
                        f"{a.aspect_type.title()} ({_ASPECT_QUALITY.get(a.aspect_type, 'mixed')}) "
                        f"between {a.planet1} and {a.planet2} (orb {a.orb:.1f}\u00b0)"
                    ),
                    "relevance": "medium",
                })

        # 6c. Patterns touching domain planets
        for pat in patterns:
            if any(p in domain_planets for p in pat["planets"]):
                domain_factors.append({
                    "factor": pat["name"],
                    "description": pat["description"],
                    "relevance": "high",
                })

        # --- 7. Confidence ---
        uncertainty_flags: list[str] = []
        if chart.birth_time_quality.value != "exact":
            uncertainty_flags.append(
                f"birth_time_{chart.birth_time_quality.value}"
            )
        if not planets:
            uncertainty_flags.append("no_tropical_planets")

        confidence = self._compute_confidence(
            chart, domain_factors, uncertainty_flags
        )

        # --- Relevant planets & aspects for base fields ---
        rel_planets = sorted({p.name for p in planets if p.house in relevant_houses})
        rel_aspects = [
            f"{a.planet1} {a.aspect_type} {a.planet2}"
            for a in aspects
            if a.planet1 in domain_planets or a.planet2 in domain_planets
        ]

        return WesternEvidence(
            relevant_planets=rel_planets,
            relevant_houses=relevant_houses,
            relevant_aspects=rel_aspects,
            confidence=confidence,
            uncertainty_flags=uncertainty_flags,
            planet_sign_analysis=planet_sign_analysis,
            aspect_analysis=aspect_analysis,
            patterns=patterns,
            element_balance=element_balance,
            modality_balance=modality_balance,
            house_emphasis=house_emphasis,
            domain_factors=domain_factors,
        )

    # ----- helpers ----------------------------------------------------------

    @staticmethod
    def _compute_confidence(
        chart: CanonicalChart,
        domain_factors: list[dict],
        uncertainty_flags: list[str],
    ) -> float:
        """Heuristic confidence score between 0 and 1."""
        base = 0.6
        # More domain factors -> higher confidence (up to +0.25)
        factor_bonus = min(len(domain_factors) * 0.03, 0.25)
        # Penalties
        penalty = 0.0
        if "birth_time_approximate" in uncertainty_flags:
            penalty += 0.15
        if "birth_time_unknown" in uncertainty_flags:
            penalty += 0.30
        if "no_tropical_planets" in uncertainty_flags:
            penalty += 0.40
        score = base + factor_bonus - penalty
        return round(max(0.0, min(1.0, score)), 2)


def _ordinal(n: int) -> str:
    """Return ordinal string for a house number."""
    if 11 <= (n % 100) <= 13:
        suffix = "th"
    else:
        suffix = {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suffix}"
