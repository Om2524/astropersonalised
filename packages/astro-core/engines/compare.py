"""Compare Mode Aggregator — runs all three engines and finds agreements/disagreements."""

from __future__ import annotations

from pydantic import BaseModel, Field

from ..models.chart import CanonicalChart
from .base import BaseEvidence
from .vedic import VedicEngine, VedicEvidence
from .kp import KPEngine, KPEvidence
from .western import WesternEngine, WesternEvidence


class CompareEvidence(BaseModel):
    vedic: VedicEvidence
    kp: KPEvidence
    western: WesternEvidence
    agreements: list[dict]
    disagreements: list[dict]
    strongest_method: str
    strongest_confidence: float = Field(ge=0.0, le=1.0)
    common_planets: list[str]
    common_houses: list[int]


class CompareEngine:
    def __init__(self) -> None:
        self.vedic = VedicEngine()
        self.kp = KPEngine()
        self.western = WesternEngine()

    def extract_evidence(
        self, chart: CanonicalChart, domain: str, query: str
    ) -> CompareEvidence:
        vedic_ev = self.vedic.extract_evidence(chart, domain, query)
        kp_ev = self.kp.extract_evidence(chart, domain, query)
        western_ev = self.western.extract_evidence(chart, domain, query)

        # Find common planets across methods
        vedic_planets = set(vedic_ev.relevant_planets)
        kp_planets = set(kp_ev.relevant_planets)
        western_planets = set(western_ev.relevant_planets)
        common_planets = sorted(vedic_planets & kp_planets & western_planets)
        two_of_three_planets = sorted(
            (vedic_planets & kp_planets)
            | (vedic_planets & western_planets)
            | (kp_planets & western_planets)
        )

        # Find common houses
        vedic_houses = set(vedic_ev.relevant_houses)
        kp_houses = set(kp_ev.relevant_houses)
        western_houses = set(western_ev.relevant_houses)
        common_houses = sorted(vedic_houses & kp_houses & western_houses)

        # Build agreements
        agreements = []
        if common_planets:
            agreements.append({
                "type": "planet_agreement",
                "description": f"All three methods highlight: {', '.join(common_planets)}",
                "planets": common_planets,
            })
        if two_of_three_planets:
            only_two = sorted(set(two_of_three_planets) - set(common_planets))
            if only_two:
                agreements.append({
                    "type": "partial_planet_agreement",
                    "description": f"Two of three methods highlight: {', '.join(only_two)}",
                    "planets": only_two,
                })
        if common_houses:
            agreements.append({
                "type": "house_agreement",
                "description": f"All methods point to house(s): {', '.join(str(h) for h in common_houses)}",
                "houses": common_houses,
            })

        # Check if confidence directions agree
        confidences = {
            "vedic": vedic_ev.confidence,
            "kp": kp_ev.confidence,
            "western": western_ev.confidence,
        }
        high = [m for m, c in confidences.items() if c >= 0.7]
        if len(high) >= 2:
            agreements.append({
                "type": "confidence_agreement",
                "description": f"High confidence from: {', '.join(high)}",
            })

        # Build disagreements
        disagreements = []
        vedic_only = sorted(vedic_planets - kp_planets - western_planets)
        kp_only = sorted(kp_planets - vedic_planets - western_planets)
        western_only = sorted(western_planets - vedic_planets - kp_planets)

        if vedic_only:
            disagreements.append({
                "type": "vedic_unique",
                "description": f"Only Vedic highlights: {', '.join(vedic_only)}",
                "planets": vedic_only,
            })
        if kp_only:
            disagreements.append({
                "type": "kp_unique",
                "description": f"Only KP highlights: {', '.join(kp_only)}",
                "planets": kp_only,
            })
        if western_only:
            disagreements.append({
                "type": "western_unique",
                "description": f"Only Western highlights: {', '.join(western_only)}",
                "planets": western_only,
            })

        # Confidence spread
        max_conf = max(confidences.values())
        min_conf = min(confidences.values())
        if max_conf - min_conf > 0.3:
            disagreements.append({
                "type": "confidence_spread",
                "description": f"Confidence varies widely: {', '.join(f'{m}={c:.0%}' for m, c in confidences.items())}",
            })

        # Strongest method
        strongest_method = max(confidences, key=confidences.get)  # type: ignore[arg-type]

        return CompareEvidence(
            vedic=vedic_ev,
            kp=kp_ev,
            western=western_ev,
            agreements=agreements,
            disagreements=disagreements,
            strongest_method=strongest_method,
            strongest_confidence=confidences[strongest_method],
            common_planets=common_planets,
            common_houses=common_houses,
        )
