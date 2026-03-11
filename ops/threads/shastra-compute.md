# Shastra Compute -- Thread Log

## Status: COMPLETE

## What was implemented

Created the full `shastra-compute/` project -- a stateless Python computation API that absorbs code from both `apps/api/` and `packages/astro-core/`, removing all database/auth/Redis/Alembic dependencies.

### Project structure (35 files)
- `pyproject.toml` -- dependencies: fastapi, uvicorn, google-genai, pyswisseph, pydantic, pydantic-settings, httpx, timezonefinder, python-dateutil, pytz. NO sqlalchemy/asyncpg/alembic/redis.
- `Dockerfile` -- python:3.13-slim with gcc for pyswisseph
- `.env.example` -- GEMINI_API_KEY, GEOCODING_API_KEY, API_KEY, STREAM_TOKEN_SECRET
- `src/config.py` -- pydantic-settings (gemini_api_key, geocoding_api_key, api_key, stream_token_secret, environment, log_level)
- `src/auth.py` -- X-API-Key + HMAC stream token validation with ApiKeyAuth and StreamTokenAuth dependency aliases
- `src/main.py` -- FastAPI app, CORS (forsee.life + localhost:3000), health endpoint, all v1 routers mounted

### Core layer (copied from packages/astro-core with import fixes)
- `src/core/models/chart.py` -- CanonicalChart, PlanetPosition, HouseCusp, Aspect, DashaInfo, BirthTimeQuality
- `src/core/calculator.py` -- ChartCalculator (Swiss Ephemeris, compute_chart, compute_transits)
- `src/core/geocoding.py` -- GeocodingService (Nominatim + TimezoneFinder)

### Engines (copied from packages/astro-core/engines with import fixes)
- `src/engines/base.py` -- BaseEvidence, BaseEngine ABC
- `src/engines/vedic.py` -- VedicEngine (dignities, yogas, dasha, vedic aspects)
- `src/engines/kp.py` -- KPEngine (sub-lords, significators, ruling planets)
- `src/engines/western.py` -- WesternEngine (tropical, patterns, element/modality balance)
- `src/engines/compare.py` -- CompareEngine (aggregates all three)

### Services (copied from apps/api/app/services with import fixes)
- `src/services/query_router.py` -- QueryRouter (Gemini-based classification)
- `src/services/answer_composer.py` -- AnswerComposer (structured + streaming)
- `src/services/brief_service.py` -- BriefService (daily + weekly)
- `src/services/resonance_service.py` -- ResonanceService (celebrity matching)

### Data
- `src/data/celebrities.py` -- 50 pre-computed celebrity chart features

### API routes
- `src/api/v1/chart.py` -- POST /v1/chart/compute, POST /v1/chart/transits (ApiKeyAuth)
- `src/api/v1/reading.py` -- POST /v1/reading/ask (ApiKeyAuth), POST /v1/reading/stream (StreamTokenAuth + SSE)
- `src/api/v1/brief.py` -- POST /v1/brief/daily, POST /v1/brief/weekly (ApiKeyAuth)
- `src/api/v1/resonance.py` -- POST /v1/resonance/match (ApiKeyAuth)

### API schemas
- `src/api/schemas/chart.py` -- ChartRequest, ChartResponse, TransitRequest
- `src/api/schemas/reading.py` -- AskRequest, AskResponse, StreamRequest
- `src/api/schemas/brief.py` -- DailyRequest, WeeklyRequest
- `src/api/schemas/resonance.py` -- ResonanceRequest, PersonalityMatch

## Quality verification
- Zero references to `from app.`, `from astro_core.`, sqlalchemy, asyncpg, alembic, redis, SavedReading, or database
- All 33 Python files parse without syntax errors
- All imports use `src.` prefix
- Docstrings on every module, class, and public function
- Type hints throughout

## Decisions made
- Used `src.` as the import root (matching the project structure inside shastra-compute/)
- Streaming endpoint uses StreamTokenAuth (HMAC token), non-streaming uses ApiKeyAuth (X-API-Key header)
- Kept the full reading pipeline: classify -> select engine -> extract evidence -> compose answer
- Removed session_id/DB-save logic from readings (was the main DB dependency)
- Removed `app.astro_imports` hack -- no longer needed since everything is under `src.`
