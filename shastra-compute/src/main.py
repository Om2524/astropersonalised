"""FastAPI application entry point for Shastra Compute.

Configures CORS, mounts all v1 routers, and exposes a health check endpoint.
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.api.v1.chart import router as chart_router
from src.api.v1.reading import router as reading_router
from src.api.v1.brief import router as brief_router
from src.api.v1.resonance import router as resonance_router

app = FastAPI(
    title="Shastra Compute",
    version="1.0.0",
    description="Stateless astrology computation API -- chart calculation, evidence extraction, and LLM-powered readings.",
)

# CORS -- allow the frontend and local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://forsee.life",
        "https://www.forsee.life",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount v1 routers
app.include_router(chart_router)
app.include_router(reading_router)
app.include_router(brief_router)
app.include_router(resonance_router)


@app.get("/health")
async def health() -> dict[str, str]:
    """Liveness / readiness probe."""
    return {"status": "ok"}
