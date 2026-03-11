from __future__ import annotations

from abc import ABC, abstractmethod

from pydantic import BaseModel, Field

from ..models.chart import CanonicalChart


class BaseEvidence(BaseModel):
    relevant_planets: list[str]
    relevant_houses: list[int]
    relevant_aspects: list[str]
    confidence: float = Field(ge=0.0, le=1.0)
    uncertainty_flags: list[str]
    method: str


class BaseEngine(ABC):
    @abstractmethod
    def extract_evidence(
        self, chart: CanonicalChart, domain: str, query: str
    ) -> BaseEvidence:
        ...
