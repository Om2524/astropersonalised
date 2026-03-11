"""Famous Personality Resonance Engine.

Matches a user's sidereal birth chart against pre-computed celebrity chart
features using weighted multi-factor similarity.  NOT sun-sign matching --
uses moon, ascendant, venus, mars, saturn, nodal axis, elements, modality,
and stellium detection.
"""

from __future__ import annotations

from src.core.models.chart import CanonicalChart
from src.data.celebrities import CELEBRITIES

SIGN_LIST = [
    "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
    "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
]

ELEMENTS: dict[str, str] = {
    "Aries": "Fire",   "Taurus": "Earth",  "Gemini": "Air",
    "Cancer": "Water",  "Leo": "Fire",      "Virgo": "Earth",
    "Libra": "Air",     "Scorpio": "Water",  "Sagittarius": "Fire",
    "Capricorn": "Earth", "Aquarius": "Air", "Pisces": "Water",
}

MODALITIES: dict[str, str] = {
    "Aries": "Cardinal",   "Taurus": "Fixed",    "Gemini": "Mutable",
    "Cancer": "Cardinal",  "Leo": "Fixed",       "Virgo": "Mutable",
    "Libra": "Cardinal",   "Scorpio": "Fixed",   "Sagittarius": "Mutable",
    "Capricorn": "Cardinal", "Aquarius": "Fixed", "Pisces": "Mutable",
}

# Weights for each comparison dimension
WEIGHTS: dict[str, float] = {
    "moon": 3.0,
    "ascendant": 2.5,
    "venus": 2.0,
    "mars": 2.0,
    "saturn": 1.5,
    "rahu": 1.5,
    "dominant_element": 2.0,
    "dominant_modality": 1.0,
    "sun": 1.0,
    "stellium": 1.5,
}


class ResonanceService:
    """Compute personality resonance between a user chart and celebrity charts."""

    def find_matches(self, chart: CanonicalChart, top_n: int = 10) -> list[dict]:
        """Find the most similar celebrities to the user's chart.

        Parameters
        ----------
        chart : CanonicalChart
            The user's computed natal chart.
        top_n : int
            How many results to return (default 10).

        Returns
        -------
        list[dict]
            Sorted list of celebrity matches with scores and shared features.
        """
        user_features = self._extract_features(chart)

        results: list[dict] = []
        for celeb in CELEBRITIES:
            score, shared = self._compute_similarity(user_features, celeb)
            results.append({
                "name": celeb["name"],
                "category": celeb["category"],
                "description": celeb["description"],
                "match_score": round(score * 100),
                "shared_features": shared,
                "birth_date": celeb["birth_date"],
                "image_url": celeb.get("image_url"),
            })

        results.sort(key=lambda x: x["match_score"], reverse=True)
        return results[:top_n]

    # -- internal helpers --

    def _extract_features(self, chart: CanonicalChart) -> dict:
        """Extract comparison features from a CanonicalChart."""
        planets = {p.name: p for p in chart.sidereal_planets}

        # Dominant element
        element_counts: dict[str, int] = {}
        for p in chart.sidereal_planets:
            el = ELEMENTS.get(p.sign, "")
            if el:
                element_counts[el] = element_counts.get(el, 0) + 1
        dominant_element = max(element_counts, key=element_counts.get) if element_counts else None

        # Dominant modality
        modality_counts: dict[str, int] = {}
        for p in chart.sidereal_planets:
            mod = MODALITIES.get(p.sign, "")
            if mod:
                modality_counts[mod] = modality_counts.get(mod, 0) + 1
        dominant_modality = max(modality_counts, key=modality_counts.get) if modality_counts else None

        # Stellium detection (3+ planets in same sign)
        sign_counts: dict[str, int] = {}
        for p in chart.sidereal_planets:
            sign_counts[p.sign] = sign_counts.get(p.sign, 0) + 1
        stellium_sign = None
        for sign, count in sign_counts.items():
            if count >= 3:
                stellium_sign = sign
                break

        # Ascendant sign from sidereal longitude
        asc_idx = int(chart.ascendant_sidereal // 30) % 12
        asc_sign = SIGN_LIST[asc_idx]

        def _sign(planet_name: str) -> str | None:
            p = planets.get(planet_name)
            return p.sign if p else None

        return {
            "sun_sign": _sign("Sun"),
            "moon_sign": _sign("Moon"),
            "ascendant": asc_sign,
            "venus_sign": _sign("Venus"),
            "mars_sign": _sign("Mars"),
            "saturn_sign": _sign("Saturn"),
            "rahu_sign": _sign("Rahu"),
            "dominant_element": dominant_element,
            "dominant_modality": dominant_modality,
            "stellium_sign": stellium_sign,
        }

    def _compute_similarity(
        self, user: dict, celeb: dict
    ) -> tuple[float, list[str]]:
        """Compute weighted similarity score and list of shared features."""
        max_score = sum(WEIGHTS.values())
        score = 0.0
        shared: list[str] = []

        comparisons = [
            ("moon",             "moon_sign",        "Moon sign"),
            ("ascendant",        "ascendant",        "Ascendant"),
            ("venus",            "venus_sign",       "Venus sign"),
            ("mars",             "mars_sign",        "Mars sign"),
            ("saturn",           "saturn_sign",      "Saturn sign"),
            ("rahu",             "rahu_sign",        "Rahu sign"),
            ("dominant_element", "dominant_element",  "Dominant element"),
            ("dominant_modality","dominant_modality", "Dominant modality"),
            ("sun",              "sun_sign",         "Sun sign"),
            ("stellium",         "stellium_sign",    "Stellium sign"),
        ]

        for weight_key, feature_key, label in comparisons:
            user_val = user.get(feature_key)
            celeb_val = celeb.get(feature_key)
            if user_val and celeb_val and user_val == celeb_val:
                score += WEIGHTS[weight_key]
                shared.append(f"{label}: {user_val}")

        return score / max_score, shared
