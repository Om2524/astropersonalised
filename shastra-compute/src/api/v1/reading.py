"""Reading endpoints -- the core AI-powered astrology Q&A.

Handles both structured (JSON) and streaming (SSE) reading flows:
1. Classify the user's query via Gemini
2. Resolve the natal chart (from provided data or by computing it)
3. Select the best interpretation engine
4. Extract astrological evidence
5. Compose an answer (structured or streamed)
"""

from __future__ import annotations

import asyncio
import json
import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from src.auth import ApiKeyAuth, StreamTokenAuth
from src.config import settings
from src.core.calculator import ChartCalculator
from src.core.geocoding import GeocodingService
from src.core.models.chart import CanonicalChart
from src.engines.vedic import VedicEngine
from src.engines.kp import KPEngine
from src.engines.western import WesternEngine
from src.engines.compare import CompareEngine
from src.services.query_router import QueryRouter
from src.services.answer_composer import AnswerComposer
from src.api.schemas.reading import AskRequest, AskResponse

router = APIRouter(prefix="/v1/reading", tags=["reading"])

logger = logging.getLogger(__name__)

# Services
_geocoding = GeocodingService()
_calculator = ChartCalculator()
_query_router = QueryRouter()
_composer = AnswerComposer()

# Engines
_engines = {
    "vedic": VedicEngine(),
    "kp": KPEngine(),
    "western": WesternEngine(),
    "compare": CompareEngine(),
}

# Analysis ledger steps displayed to the user during streaming
LEDGER_STEPS = [
    "Analyzing your question...",
    "Building natal chart snapshot...",
    "Checking planetary placements...",
    "Evaluating current transits...",
    "Applying {method} analysis...",
    "Extracting key evidence...",
    "Composing your reading...",
]

# House significance labels for planet context cards
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
    "Sun": "\u2609", "Moon": "\u263d", "Mercury": "\u263f", "Venus": "\u2640",
    "Mars": "\u2642", "Jupiter": "\u2643", "Saturn": "\u2644",
    "Rahu": "\u260a", "Ketu": "\u260b", "Uranus": "\u2645", "Neptune": "\u2646", "Pluto": "\u2647",
}


@router.post("/ask", response_model=AskResponse)
async def ask(req: AskRequest, _auth: ApiKeyAuth) -> AskResponse:
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
        language=req.language,
    )

    # Build summary -- CompareEvidence has a different structure
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

    return AskResponse(
        query=req.query,
        classification=classification.model_dump(),
        method_used=method,
        reading=reading.model_dump(),
        evidence_summary=evidence_summary,
    )


@router.post("/stream")
async def ask_stream(req: AskRequest, _auth: StreamTokenAuth) -> StreamingResponse:
    """Stream a reading with analysis ledger events (SSE)."""

    timeout = settings.stream_timeout_seconds

    async def event_stream():
        try:
            async with asyncio.timeout(timeout):
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
                    language=req.language,
                ):
                    yield _sse_event("content", {"text": chunk})

                yield _sse_event("done", {"method_used": method})

        except asyncio.TimeoutError:
            logger.error("Streaming timed out after %d seconds", timeout)
            yield _sse_event("error", {"message": f"Reading generation timed out after {timeout}s"})
        except asyncio.CancelledError:
            logger.info("Streaming cancelled by client disconnect")
            return
        except Exception as e:
            logger.exception("Streaming error")
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


async def _resolve_chart(req: AskRequest) -> CanonicalChart:
    """Get canonical chart from request -- either from provided data or by computing it."""
    if req.chart_data:
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
