"""Readings endpoints — the core AI-powered astrology Q&A."""

import json
import app.astro_imports  # noqa: F401

import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from datetime import date, time
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.reading import SavedReading
from app.services.geocoding import GeocodingService
from app.services.query_router import QueryRouter
from app.services.answer_composer import AnswerComposer
from astro_core.calculator import ChartCalculator
from astro_core.engines.vedic import VedicEngine
from astro_core.engines.kp import KPEngine
from astro_core.engines.western import WesternEngine
from astro_core.engines.compare import CompareEngine

router = APIRouter(prefix="/api/readings", tags=["readings"])

# Services
_geocoding = GeocodingService()
_calculator = ChartCalculator()
_query_router = QueryRouter(api_key=settings.GEMINI_API_KEY)
_composer = AnswerComposer(api_key=settings.GEMINI_API_KEY)

# Engines
_engines = {
    "vedic": VedicEngine(),
    "kp": KPEngine(),
    "western": WesternEngine(),
    "compare": CompareEngine(),
}

# Analysis ledger steps
LEDGER_STEPS = [
    "Analyzing your question...",
    "Building natal chart snapshot...",
    "Checking planetary placements...",
    "Evaluating current transits...",
    "Applying {method} analysis...",
    "Extracting key evidence...",
    "Composing your reading...",
]


class AskRequest(BaseModel):
    query: str
    method: str = Field(default="auto", description="vedic, kp, western, compare, or auto")
    tone: str = Field(default="practical", description="practical, emotional, spiritual, concise")
    # Birth data — either provide chart_data or birth details
    chart_data: Optional[dict] = None
    # Or provide birth details for on-the-fly computation
    date_of_birth: Optional[date] = None
    time_of_birth: Optional[time] = None
    birthplace: Optional[str] = None
    birth_time_quality: str = Field(default="exact")
    session_id: Optional[str] = None


class AskResponse(BaseModel):
    query: str
    classification: dict
    method_used: str
    reading: dict
    evidence_summary: dict


logger = logging.getLogger(__name__)


@router.post("/ask", response_model=AskResponse)
async def ask(req: AskRequest, db: AsyncSession = Depends(get_db)):
    """Ask a question and get a structured astrology reading."""

    # 1. Get or compute the chart
    chart = await _resolve_chart(req)

    # 2. Classify the query
    classification = _query_router.classify(req.query)

    # 3. Determine method
    if req.method == "auto":
        method = classification.best_fit_engine
    else:
        method = req.method

    # 4. Extract evidence
    engine = _engines.get(method)
    if engine is None:
        raise HTTPException(status_code=400, detail=f"Unknown method: {method}")

    evidence = engine.extract_evidence(chart, classification.domain, req.query)
    evidence_dict = evidence.model_dump(mode="json")

    # 5. Compose answer
    reading = _composer.compose(
        query=req.query,
        evidence=evidence_dict,
        method=method,
        tone=req.tone,
        birth_time_quality=req.birth_time_quality,
    )

    # Build summary — CompareEvidence has a different structure
    if method == "compare":
        evidence_summary = {
            "relevant_planets": evidence.common_planets,
            "relevant_houses": evidence.common_houses,
            "confidence": evidence.strongest_confidence,
            "method": "compare",
            "strongest_method": evidence.strongest_method,
            "agreements": len(evidence.agreements),
            "disagreements": len(evidence.disagreements),
        }
    else:
        evidence_summary = {
            "relevant_planets": evidence.relevant_planets,
            "relevant_houses": evidence.relevant_houses,
            "confidence": evidence.confidence,
            "method": evidence.method,
        }

    # Auto-save reading to history (is_saved=False until user bookmarks)
    if req.session_id:
        try:
            row = SavedReading(
                session_id=req.session_id,
                query=req.query,
                method_used=method,
                domain=classification.domain,
                reading=reading.model_dump(),
                evidence_summary=evidence_summary,
                classification=classification.model_dump(),
                confidence=evidence_summary.get("confidence"),
                is_saved=False,
            )
            db.add(row)
            await db.flush()
        except Exception:
            logger.exception("Failed to auto-save reading")

    return AskResponse(
        query=req.query,
        classification=classification.model_dump(),
        method_used=method,
        reading=reading.model_dump(),
        evidence_summary=evidence_summary,
    )


@router.post("/ask/stream")
async def ask_stream(req: AskRequest):
    """Stream a reading with analysis ledger events (SSE)."""

    async def event_stream():
        try:
            # Ledger step 1: Analyzing
            yield _sse_event("ledger", {"step": 1, "message": LEDGER_STEPS[0]})

            # 1. Resolve chart
            chart = await _resolve_chart(req)
            yield _sse_event("ledger", {"step": 2, "message": LEDGER_STEPS[1]})

            # 2. Classify query
            classification = _query_router.classify(req.query)
            yield _sse_event("classification", classification.model_dump())

            # 3. Determine method
            method = req.method if req.method != "auto" else classification.best_fit_engine
            method_label = method.upper() if method != "compare" else "Compare All"

            yield _sse_event("ledger", {"step": 3, "message": LEDGER_STEPS[2]})
            yield _sse_event("ledger", {"step": 4, "message": LEDGER_STEPS[3]})
            yield _sse_event("ledger", {
                "step": 5,
                "message": LEDGER_STEPS[4].format(method=method_label),
            })

            # 4. Extract evidence
            engine = _engines.get(method)
            if engine is None:
                yield _sse_event("error", {"message": f"Unknown method: {method}"})
                return

            evidence = engine.extract_evidence(chart, classification.domain, req.query)
            evidence_dict = evidence.model_dump(mode="json")

            yield _sse_event("ledger", {"step": 6, "message": LEDGER_STEPS[5]})
            if method == "compare":
                yield _sse_event("evidence_summary", {
                    "relevant_planets": evidence.common_planets,
                    "relevant_houses": evidence.common_houses,
                    "confidence": evidence.strongest_confidence,
                    "method": "compare",
                })
            else:
                yield _sse_event("evidence_summary", {
                    "relevant_planets": evidence.relevant_planets,
                    "relevant_houses": evidence.relevant_houses,
                    "confidence": evidence.confidence,
                    "method": evidence.method,
                })

            yield _sse_event("ledger", {"step": 7, "message": LEDGER_STEPS[6]})

            # 5a. Send structured planet context for visual rendering
            planet_context = _build_planet_context(evidence, method, classification.domain)
            yield _sse_event("planet_context", planet_context)

            # 5b. Stream the reading
            for chunk in _composer.compose_stream(
                query=req.query,
                evidence=evidence_dict,
                method=method,
                tone=req.tone,
                birth_time_quality=req.birth_time_quality,
            ):
                yield _sse_event("content", {"text": chunk})

            yield _sse_event("done", {"method_used": method})

        except Exception as e:
            yield _sse_event("error", {"message": str(e)})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


async def _resolve_chart(req: AskRequest):
    """Get canonical chart from request — either from provided data or by computing it."""
    if req.chart_data:
        from astro_core.models.chart import CanonicalChart
        return CanonicalChart(**req.chart_data)

    if not req.date_of_birth or not req.birthplace:
        raise HTTPException(
            status_code=400,
            detail="Provide either chart_data or (date_of_birth + birthplace)",
        )

    geo = await _geocoding.geocode(req.birthplace)
    if geo is None:
        raise HTTPException(status_code=400, detail=f"Could not geocode: {req.birthplace}")

    return _calculator.compute_chart(
        date_of_birth=req.date_of_birth,
        time_of_birth=req.time_of_birth,
        latitude=geo.latitude,
        longitude=geo.longitude,
        timezone_str=geo.timezone,
        birth_time_quality=req.birth_time_quality,
    )


HOUSE_SIGNIFICANCE = {
    1: "Self & Identity",
    2: "Wealth & Speech",
    3: "Courage & Siblings",
    4: "Home & Mother",
    5: "Children & Creativity",
    6: "Health & Enemies",
    7: "Marriage & Partners",
    8: "Transformation & Hidden",
    9: "Fortune & Dharma",
    10: "Career & Public Life",
    11: "Gains & Aspirations",
    12: "Loss & Liberation",
}

PLANET_SYMBOLS = {
    "Sun": "☉", "Moon": "☽", "Mercury": "☿", "Venus": "♀",
    "Mars": "♂", "Jupiter": "♃", "Saturn": "♄",
    "Rahu": "☊", "Ketu": "☋", "Uranus": "♅", "Neptune": "♆", "Pluto": "♇",
}


def _build_planet_context(evidence, method: str, domain: str) -> dict:
    """Build structured planet context from evidence for frontend visual cards."""
    ev = evidence.model_dump(mode="json")

    # Planet placements
    planets = []
    dignities = ev.get("planet_dignities", [])
    relevant_set = set(ev.get("relevant_planets", []))
    for pd in dignities:
        if pd["planet"] in relevant_set:
            planets.append({
                "name": pd["planet"],
                "symbol": PLANET_SYMBOLS.get(pd["planet"], ""),
                "sign": pd["sign"],
                "house": pd["house"],
                "dignity": pd["dignity"],
            })

    # Yogas
    yogas = []
    for y in ev.get("yogas", []):
        yogas.append({
            "name": y["name"],
            "planets": y.get("planets_involved", []),
            "strength": y.get("strength", "moderate"),
            "description": y["description"],
        })

    # Houses
    houses = []
    for ha in ev.get("house_analysis", []):
        houses.append({
            "number": ha["house"],
            "sign": ha["sign"],
            "lord": ha["lord"],
            "planets_in": ha.get("planets_in_house", []),
            "significance": HOUSE_SIGNIFICANCE.get(ha["house"], ""),
        })

    # Dasha
    dasha = ev.get("dasha_context")

    return {
        "planets": planets,
        "yogas": yogas,
        "houses": houses,
        "dasha": dasha,
        "method": method,
        "domain": domain,
    }


def _sse_event(event_type: str, data: dict) -> str:
    """Format a Server-Sent Event."""
    return f"event: {event_type}\ndata: {json.dumps(data, default=str)}\n\n"
