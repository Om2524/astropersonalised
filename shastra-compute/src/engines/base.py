"""Base evidence model and abstract engine interface.

All astrology interpretation engines (Vedic, KP, Western) inherit from
``BaseEngine`` and produce evidence that extends ``BaseEvidence``.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

from pydantic import BaseModel, Field

from src.core.models.chart import CanonicalChart


class BaseEvidence(BaseModel):
    """Common evidence fields shared across all interpretation methods."""

    relevant_planets: list[str]
    relevant_houses: list[int]
    relevant_aspects: list[str]
    confidence: float = Field(ge=0.0, le=1.0)
    uncertainty_flags: list[str]
    method: str


class BaseEngine(ABC):
    """Abstract base for an astrology interpretation engine."""

    @abstractmethod
    def extract_evidence(
        self, chart: CanonicalChart, domain: str, query: str
    ) -> BaseEvidence:
        """Extract structured evidence from a chart for a given domain and query."""
        ...
