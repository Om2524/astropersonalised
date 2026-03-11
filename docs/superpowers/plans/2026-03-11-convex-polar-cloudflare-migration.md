# Convex + Polar.sh + Cloudflare Migration — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate Sudarshan from FastAPI monolith to Convex (auth/DB/payments) + stateless Python compute (Cloudflare Containers) + Next.js (Cloudflare Pages), with Polar.sh payment gateway for Maya/Dhyan/Moksha tiers.

**Architecture:** Convex Cloud owns all state (users, sessions, subscriptions, readings, rate limiting). Python API becomes a stateless computation sidecar called by Convex actions. Frontend talks exclusively to Convex except for SSE streaming which uses a token-gated direct connection to the Python API.

**Tech Stack:** Convex, @convex-dev/polar, FastAPI, pyswisseph, Google GenAI (Gemini), Next.js 16, Cloudflare Pages, Cloudflare Containers, Polar.sh

**Spec:** `docs/superpowers/specs/2026-03-11-convex-polar-cloudflare-migration-design.md`

---

## File Structure

### New: `shastra-compute/` (Python stateless API)

Absorbs code from `apps/api/` and `packages/astro-core/`. Removes all DB, auth, Redis, Alembic code.

| File | Source | Responsibility |
|---|---|---|
| `shastra-compute/Dockerfile` | Modify `apps/api/Dockerfile` | Container build |
| `shastra-compute/pyproject.toml` | Modify `apps/api/pyproject.toml` | Dependencies (remove sqlalchemy, asyncpg, alembic, redis) |
| `shastra-compute/src/main.py` | Rewrite `apps/api/app/main.py` | FastAPI app, CORS, health, router mounts |
| `shastra-compute/src/config.py` | Rewrite `apps/api/app/config.py` | Pydantic settings (GEMINI_API_KEY, API_KEY, STREAM_TOKEN_SECRET, GEOCODING_API_KEY) |
| `shastra-compute/src/auth.py` | Create new | X-API-Key dependency + HMAC token validation |
| `shastra-compute/src/api/v1/chart.py` | Rewrite `apps/api/app/routers/charts.py` | /v1/chart/compute, /v1/chart/transits |
| `shastra-compute/src/api/v1/reading.py` | Rewrite `apps/api/app/routers/readings.py` | /v1/reading/ask, /v1/reading/stream (remove DB saves) |
| `shastra-compute/src/api/v1/brief.py` | Rewrite `apps/api/app/routers/briefs.py` | /v1/brief/daily, /v1/brief/weekly |
| `shastra-compute/src/api/v1/resonance.py` | Rewrite `apps/api/app/routers/resonance.py` | /v1/resonance/match |
| `shastra-compute/src/api/schemas/chart.py` | Create new | ChartRequest, ChartResponse Pydantic models |
| `shastra-compute/src/api/schemas/reading.py` | Create new | AskRequest, AskResponse, StreamRequest models |
| `shastra-compute/src/api/schemas/brief.py` | Create new | DailyRequest, WeeklyRequest, response models |
| `shastra-compute/src/api/schemas/resonance.py` | Create new | ResonanceRequest, PersonalityMatch models |
| `shastra-compute/src/core/calculator.py` | Copy `packages/astro-core/calculator.py` | Swiss Ephemeris wrapper (617 lines, no changes) |
| `shastra-compute/src/core/geocoding.py` | Copy `apps/api/app/services/geocoding.py` | Birthplace geocoding |
| `shastra-compute/src/core/models/chart.py` | Copy `packages/astro-core/models/chart.py` | CanonicalChart, PlanetPosition, etc. |
| `shastra-compute/src/engines/base.py` | Copy `packages/astro-core/engines/base.py` | BaseEngine, BaseEvidence |
| `shastra-compute/src/engines/vedic.py` | Copy `packages/astro-core/engines/vedic.py` | VedicEngine (732 lines, no changes) |
| `shastra-compute/src/engines/kp.py` | Copy `packages/astro-core/engines/kp.py` | KPEngine (394 lines, no changes) |
| `shastra-compute/src/engines/western.py` | Copy `packages/astro-core/engines/western.py` | WesternEngine (468 lines, no changes) |
| `shastra-compute/src/engines/compare.py` | Copy `packages/astro-core/engines/compare.py` | CompareEngine (139 lines, no changes) |
| `shastra-compute/src/services/query_router.py` | Copy `apps/api/app/services/query_router.py` | Gemini query classification |
| `shastra-compute/src/services/answer_composer.py` | Copy `apps/api/app/services/answer_composer.py` | Gemini response composition |
| `shastra-compute/src/services/brief_service.py` | Copy `apps/api/app/services/briefs.py` | Daily/weekly generation |
| `shastra-compute/src/services/resonance_service.py` | Copy `apps/api/app/services/resonance.py` | Personality matching |
| `shastra-compute/src/data/celebrities.py` | Copy `apps/api/app/data/celebrities.py` | Pre-computed celebrity charts (923 lines) |

### New: `convex/` (Convex backend)

| File | Responsibility |
|---|---|
| `convex/convex.config.ts` | Register @convex-dev/polar component |
| `convex/schema.ts` | All table definitions with indexes |
| `convex/auth.ts` | Convex Auth setup |
| `convex/auth.config.ts` | Google OAuth + magic link providers |
| `convex/http.ts` | Polar webhook route registration |
| `convex/polar.ts` | Polar component init, product mapping, exported API |
| `convex/functions/sessions.ts` | Anonymous session create/get |
| `convex/functions/users.ts` | User CRUD + session migration |
| `convex/functions/birthProfiles.ts` | Birth data CRUD |
| `convex/functions/charts.ts` | Chart storage + retrieval |
| `convex/functions/readings.ts` | Reading history, save/unsave/delete |
| `convex/functions/queryUsage.ts` | Rate limiting (rolling 7-day) + tier resolution |
| `convex/functions/subscriptions.ts` | Tier checks, feature gates |
| `convex/actions/computeChart.ts` | Convex action → Python /v1/chart/compute |
| `convex/actions/askReading.ts` | Rate limit check → Python /v1/reading/ask → store |
| `convex/actions/authorizeStream.ts` | Rate limit check → issue HMAC token |
| `convex/actions/dailyBrief.ts` | → Python /v1/brief/daily |
| `convex/actions/weeklyOutlook.ts` | → Python /v1/brief/weekly |
| `convex/actions/personalityMatch.ts` | → Python /v1/resonance/match |
| `convex/crons.ts` | Cleanup expired usage + stale sessions |

### Modified: `apps/web/` (Frontend)

| File | Change |
|---|---|
| `apps/web/package.json` | Add convex, @convex-dev/polar, @auth/core deps |
| `apps/web/next.config.ts` | Remove `output: "standalone"`, add OpenNext config |
| `apps/web/app/layout.tsx` | Wrap with ConvexAuthNextjsServerProvider |
| `apps/web/app/store.tsx` | Replace localStorage state with Convex queries |
| `apps/web/app/api.ts` | Remove entirely (replaced by Convex actions) |
| `apps/web/app/types.ts` | Keep as-is (shared types) |
| `apps/web/app/page.tsx` | Minor: check Convex auth state |
| `apps/web/app/onboarding/page.tsx` | Use Convex mutations for birth data + chart |
| `apps/web/app/chat/page.tsx` | Use Convex actions + token-gated streaming |
| `apps/web/app/chat/components/Sidebar.tsx` | Add auth-aware user menu |
| `apps/web/app/daily/page.tsx` | Use Convex action for daily brief |
| `apps/web/app/weekly/page.tsx` | Use Convex action for weekly outlook |
| `apps/web/app/saved/page.tsx` | Use Convex query for saved readings |
| `apps/web/app/personalities/page.tsx` | Use Convex action for personality match |
| `apps/web/app/settings/page.tsx` | Add CustomerPortalLink, subscription info |
| `apps/web/app/pricing/page.tsx` | Create new: three-tier pricing with CheckoutLink |
| `apps/web/app/auth/signin/page.tsx` | Create new: Google + magic link sign-in |
| `apps/web/app/components/AuthWall.tsx` | Create new: auth gate component |
| `apps/web/app/components/UsageIndicator.tsx` | Create new: queries remaining badge |
| `apps/web/app/hooks/useSession.ts` | Create new: session management hook |
| `apps/web/app/hooks/useSubscription.ts` | Create new: tier/usage hook |
| `apps/web/middleware.ts` | Create new: Convex Auth middleware |
| `apps/web/convex.ts` | Create new: Convex client initialization |

### Root config changes

| File | Change |
|---|---|
| `docker-compose.yml` | Remove entirely (replaced by Cloudflare) |
| `wrangler.jsonc` | Create new: Cloudflare Container config for shastra-compute |

---

## Chunk 1: Phase 0 + Phase 1 — Polar Setup + Shastra Compute

### Task 1: Create Polar Products in Sandbox

**Files:** None (dashboard-only)

- [ ] **Step 1: Create Polar sandbox account**

Go to https://sandbox.polar.sh and create/login to organization.

- [ ] **Step 2: Create Dhyan product**

In Polar dashboard:
- Name: "Dhyan"
- Description: "50 queries per week. All astrology methods + Compare mode. Full daily briefs, weekly outlooks, and personality resonance."
- Price: $100/month recurring
- Note the product ID

- [ ] **Step 3: Create Moksha product**

In Polar dashboard:
- Name: "Moksha"
- Description: "500 queries per week. All astrology methods + Compare mode. Full daily briefs, weekly outlooks, and personality resonance."
- Price: $1000/month recurring
- Note the product ID

- [ ] **Step 4: Create webhook endpoint**

In Polar dashboard → Webhooks:
- URL: (will be set after Convex deployment, placeholder for now)
- Enable events: `product.created`, `product.updated`, `subscription.created`, `subscription.active`, `subscription.updated`, `subscription.canceled`, `subscription.revoked`, `subscription.past_due`, `order.created`
- Note the webhook secret

- [ ] **Step 5: Record IDs in a temporary env file**

```bash
cat > shastra-compute/.env.polar << 'EOF'
POLAR_DHYAN_PRODUCT_ID=<from_step_2>
POLAR_MOKSHA_PRODUCT_ID=<from_step_3>
POLAR_WEBHOOK_SECRET=<from_step_4>
POLAR_ORGANIZATION_TOKEN=<your_org_token>
EOF
```

---

### Task 2: Scaffold Shastra Compute Project

**Files:**
- Create: `shastra-compute/pyproject.toml`
- Create: `shastra-compute/src/__init__.py`
- Create: `shastra-compute/src/main.py`
- Create: `shastra-compute/src/config.py`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p shastra-compute/src/{api/v1,api/schemas,core/models,engines,services,data}
touch shastra-compute/src/__init__.py
touch shastra-compute/src/api/__init__.py
touch shastra-compute/src/api/v1/__init__.py
touch shastra-compute/src/api/schemas/__init__.py
touch shastra-compute/src/core/__init__.py
touch shastra-compute/src/core/models/__init__.py
touch shastra-compute/src/engines/__init__.py
touch shastra-compute/src/services/__init__.py
touch shastra-compute/src/data/__init__.py
```

- [ ] **Step 2: Write pyproject.toml**

```toml
[project]
name = "shastra-compute"
version = "1.0.0"
description = "Stateless astrology computation API for Sudarshan"
requires-python = ">=3.13"
dependencies = [
    "fastapi>=0.135.0",
    "uvicorn>=0.34.0",
    "google-genai>=1.0.0",
    "pyswisseph>=2.10.3.2",
    "pydantic>=2.0.0",
    "pydantic-settings>=2.0.0",
    "httpx>=0.28.0",
    "timezonefinder>=6.5.0",
    "python-dateutil>=2.9.0",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"
```

- [ ] **Step 3: Write config.py**

```python
"""Application configuration via environment variables."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Shastra Compute configuration.

    All values are loaded from environment variables.
    """

    gemini_api_key: str
    geocoding_api_key: str = ""
    api_key: str  # Shared secret for X-API-Key validation
    stream_token_secret: str  # HMAC signing key for streaming tokens
    environment: str = "development"
    log_level: str = "INFO"

    model_config = {"env_prefix": "", "case_sensitive": False}


settings = Settings()
```

- [ ] **Step 4: Write main.py**

```python
"""Shastra Compute — Stateless astrology computation API.

This service handles all astronomical calculations, astrological
evidence extraction, and LLM-based answer composition. It holds
no state — all user data lives in Convex.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.api.v1 import chart, reading, brief, resonance

app = FastAPI(
    title="Shastra Compute",
    description="Stateless astrology computation API",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://forsee.life", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chart.router, prefix="/v1/chart", tags=["chart"])
app.include_router(reading.router, prefix="/v1/reading", tags=["reading"])
app.include_router(brief.router, prefix="/v1/brief", tags=["brief"])
app.include_router(resonance.router, prefix="/v1/resonance", tags=["resonance"])


@app.get("/health")
async def health_check():
    """Health check endpoint — no auth required."""
    return {"status": "ok", "service": "shastra-compute"}
```

- [ ] **Step 5: Commit scaffold**

```bash
git add shastra-compute/
git commit -m "feat: scaffold shastra-compute project structure"
```

---

### Task 3: Auth Module (API Key + HMAC Token)

**Files:**
- Create: `shastra-compute/src/auth.py`

- [ ] **Step 1: Write auth.py**

```python
"""Authentication for Shastra Compute.

Two auth mechanisms:
1. X-API-Key: Shared secret for Convex action calls (non-streaming)
2. Bearer token: HMAC-signed token for direct streaming calls from frontend

Tokens are single-use, 60-second expiry, signed with STREAM_TOKEN_SECRET.
"""

import hashlib
import hmac
import json
import time
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status

from src.config import settings


def verify_api_key(
    x_api_key: Annotated[str, Header()],
) -> bool:
    """Validate X-API-Key header against shared secret.

    Used for all non-streaming endpoints called from Convex actions.

    Raises:
        HTTPException: 401 if key is missing or invalid.
    """
    if not hmac.compare_digest(x_api_key, settings.api_key):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key",
        )
    return True


def verify_stream_token(
    authorization: Annotated[str, Header()],
) -> dict:
    """Validate HMAC-signed Bearer token for streaming endpoints.

    Token format: base64(json_payload).hex_signature
    Payload: {"sessionId": str, "userId": str|null, "queriedAt": int, "exp": int}

    The token is issued by Convex authorizeStream action after rate limit check.
    Valid for 60 seconds, single-use enforced by expiry.

    Returns:
        dict: Decoded token payload.

    Raises:
        HTTPException: 401 if token is invalid, expired, or tampered.
    """
    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Bearer token",
        )

    token = authorization[7:]

    try:
        parts = token.rsplit(".", 1)
        if len(parts) != 2:
            raise ValueError("Invalid token format")

        payload_b64, signature_hex = parts

        # Verify HMAC signature
        expected_sig = hmac.new(
            settings.stream_token_secret.encode(),
            payload_b64.encode(),
            hashlib.sha256,
        ).hexdigest()

        if not hmac.compare_digest(signature_hex, expected_sig):
            raise ValueError("Invalid signature")

        # Decode payload
        import base64
        payload_json = base64.urlsafe_b64decode(payload_b64).decode()
        payload = json.loads(payload_json)

        # Check expiry
        if payload.get("exp", 0) < time.time():
            raise ValueError("Token expired")

        return payload

    except (ValueError, json.JSONDecodeError, Exception) as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid stream token: {e}",
        )


# FastAPI dependency aliases
ApiKeyAuth = Annotated[bool, Depends(verify_api_key)]
StreamTokenAuth = Annotated[dict, Depends(verify_stream_token)]
```

- [ ] **Step 2: Commit**

```bash
git add shastra-compute/src/auth.py
git commit -m "feat: add API key + HMAC token auth for shastra-compute"
```

---

### Task 4: Copy Core Computation Layer

**Files:**
- Copy: `packages/astro-core/calculator.py` → `shastra-compute/src/core/calculator.py`
- Copy: `packages/astro-core/models/chart.py` → `shastra-compute/src/core/models/chart.py`
- Copy: `apps/api/app/services/geocoding.py` → `shastra-compute/src/core/geocoding.py`

- [ ] **Step 1: Copy calculator (no changes needed)**

```bash
cp packages/astro-core/calculator.py shastra-compute/src/core/calculator.py
```

- [ ] **Step 2: Copy chart models (no changes needed)**

```bash
cp packages/astro-core/models/chart.py shastra-compute/src/core/models/chart.py
```

- [ ] **Step 3: Copy geocoding service (no changes needed)**

```bash
cp apps/api/app/services/geocoding.py shastra-compute/src/core/geocoding.py
```

- [ ] **Step 4: Commit**

```bash
git add shastra-compute/src/core/
git commit -m "feat: add core computation layer (calculator, models, geocoding)"
```

---

### Task 5: Copy Engine Layer

**Files:**
- Copy all from `packages/astro-core/engines/` → `shastra-compute/src/engines/`

- [ ] **Step 1: Copy all engines (no changes needed)**

```bash
cp packages/astro-core/engines/base.py shastra-compute/src/engines/base.py
cp packages/astro-core/engines/vedic.py shastra-compute/src/engines/vedic.py
cp packages/astro-core/engines/kp.py shastra-compute/src/engines/kp.py
cp packages/astro-core/engines/western.py shastra-compute/src/engines/western.py
cp packages/astro-core/engines/compare.py shastra-compute/src/engines/compare.py
```

- [ ] **Step 2: Commit**

```bash
git add shastra-compute/src/engines/
git commit -m "feat: add astrology engine layer (vedic, kp, western, compare)"
```

---

### Task 6: Copy Services Layer

**Files:**
- Copy: `apps/api/app/services/query_router.py` → `shastra-compute/src/services/query_router.py`
- Copy: `apps/api/app/services/answer_composer.py` → `shastra-compute/src/services/answer_composer.py`
- Copy: `apps/api/app/services/briefs.py` → `shastra-compute/src/services/brief_service.py`
- Copy: `apps/api/app/services/resonance.py` → `shastra-compute/src/services/resonance_service.py`
- Copy: `apps/api/app/data/celebrities.py` → `shastra-compute/src/data/celebrities.py`

- [ ] **Step 1: Copy services**

```bash
cp apps/api/app/services/query_router.py shastra-compute/src/services/query_router.py
cp apps/api/app/services/answer_composer.py shastra-compute/src/services/answer_composer.py
cp apps/api/app/services/briefs.py shastra-compute/src/services/brief_service.py
cp apps/api/app/services/resonance.py shastra-compute/src/services/resonance_service.py
cp apps/api/app/data/celebrities.py shastra-compute/src/data/celebrities.py
```

- [ ] **Step 2: Fix imports in copied services**

All services currently import from `app.` paths. Update to `src.` paths:

In each file under `shastra-compute/src/services/`, replace:
- `from app.services.` → `from src.services.`
- `from app.data.` → `from src.data.`
- `from astro_core.` → `from src.core.` or `from src.engines.`

In `query_router.py`: update `from app.config import settings` → `from src.config import settings`
In `answer_composer.py`: update `from app.config import settings` → `from src.config import settings`
In `brief_service.py`: update any imports from `app.` to `src.`
In `resonance_service.py`: update any imports from `app.` to `src.`

- [ ] **Step 3: Commit**

```bash
git add shastra-compute/src/services/ shastra-compute/src/data/
git commit -m "feat: add services layer (query router, composer, briefs, resonance)"
```

---

### Task 7: Write API Schemas

**Files:**
- Create: `shastra-compute/src/api/schemas/chart.py`
- Create: `shastra-compute/src/api/schemas/reading.py`
- Create: `shastra-compute/src/api/schemas/brief.py`
- Create: `shastra-compute/src/api/schemas/resonance.py`

- [ ] **Step 1: Write chart schemas**

```python
"""Request/response schemas for chart endpoints."""

from pydantic import BaseModel, Field


class ChartRequest(BaseModel):
    """Request to compute a natal chart.

    Attributes:
        date_of_birth: Date in YYYY-MM-DD format.
        time_of_birth: Time in HH:MM format, or null if unknown.
        birthplace: Display name of birthplace.
        birth_time_quality: One of "exact", "approximate", "unknown".
    """

    date_of_birth: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    time_of_birth: str | None = None
    birthplace: str
    birth_time_quality: str = "exact"


class TransitRequest(BaseModel):
    """Request to compute transits for an existing chart."""

    chart_data: dict
    target_date: str | None = None


class ChartResponse(BaseModel):
    """Computed chart response — contains the full CanonicalChart."""

    chart: dict
    geo: dict
```

- [ ] **Step 2: Write reading schemas**

```python
"""Request/response schemas for reading endpoints."""

from pydantic import BaseModel, Field


class AskRequest(BaseModel):
    """Request for a synchronous reading.

    Attributes:
        query: User's natural language question.
        method: Astrology method — vedic, kp, western, or compare.
        tone: Response tone — practical, emotional, spiritual, or concise.
        chart_data: Pre-computed CanonicalChart as JSON dict.
        birth_time_quality: Quality of birth time for confidence adjustments.
    """

    query: str
    method: str = "vedic"
    tone: str = "practical"
    chart_data: dict
    birth_time_quality: str = "exact"


class StreamRequest(BaseModel):
    """Request for a streaming reading (SSE).

    Same fields as AskRequest. Auth is via Bearer HMAC token,
    not X-API-Key.
    """

    query: str
    method: str = "vedic"
    tone: str = "practical"
    chart_data: dict
    birth_time_quality: str = "exact"


class AskResponse(BaseModel):
    """Structured reading response."""

    classification: dict
    method_used: str
    reading: dict
    evidence_summary: dict
```

- [ ] **Step 3: Write brief schemas**

```python
"""Request/response schemas for brief endpoints."""

from pydantic import BaseModel


class DailyRequest(BaseModel):
    """Request for a personalized daily brief."""

    chart_data: dict
    target_date: str | None = None


class WeeklyRequest(BaseModel):
    """Request for a weekly outlook."""

    chart_data: dict
    week_start: str | None = None
```

- [ ] **Step 4: Write resonance schemas**

```python
"""Request/response schemas for personality resonance."""

from pydantic import BaseModel, Field


class ResonanceRequest(BaseModel):
    """Request to find famous personality matches."""

    chart_data: dict
    top_n: int = Field(default=10, ge=1, le=50)
```

- [ ] **Step 5: Commit**

```bash
git add shastra-compute/src/api/schemas/
git commit -m "feat: add API request/response schemas"
```

---

### Task 8: Write API Route Handlers

**Files:**
- Create: `shastra-compute/src/api/v1/chart.py`
- Create: `shastra-compute/src/api/v1/reading.py`
- Create: `shastra-compute/src/api/v1/brief.py`
- Create: `shastra-compute/src/api/v1/resonance.py`

- [ ] **Step 1: Write chart routes**

Rewrite `apps/api/app/routers/charts.py` without DB dependencies.
Key: remove all SQLAlchemy sessions, database saves. Keep chart computation + geocoding logic.

```python
"""Chart computation endpoints.

POST /v1/chart/compute — Compute natal chart from birth details
POST /v1/chart/transits — Compute transits for existing chart
"""

from fastapi import APIRouter, Depends

from src.auth import ApiKeyAuth
from src.api.schemas.chart import ChartRequest, ChartResponse, TransitRequest
from src.core.geocoding import GeocodingService
from src.core.calculator import ChartCalculator

router = APIRouter()
geocoding = GeocodingService()


@router.post("/compute", response_model=ChartResponse)
async def compute_chart(req: ChartRequest, _auth: ApiKeyAuth):
    """Compute a natal chart from birth details.

    Geocodes the birthplace, then computes planetary positions,
    houses, aspects, nakshatras, and dasha using Swiss Ephemeris.
    Returns both tropical and sidereal data.
    """
    geo = await geocoding.geocode(req.birthplace)
    calculator = ChartCalculator()
    chart = calculator.compute(
        date_of_birth=req.date_of_birth,
        time_of_birth=req.time_of_birth,
        latitude=geo.latitude,
        longitude=geo.longitude,
        timezone=geo.timezone,
        birth_time_quality=req.birth_time_quality,
    )
    return ChartResponse(
        chart=chart.model_dump(),
        geo={
            "latitude": geo.latitude,
            "longitude": geo.longitude,
            "timezone": geo.timezone,
            "display_name": geo.display_name,
        },
    )


@router.post("/transits")
async def compute_transits(req: TransitRequest, _auth: ApiKeyAuth):
    """Compute current transits relative to a natal chart."""
    calculator = ChartCalculator()
    transits = calculator.compute_transits(
        chart_data=req.chart_data,
        target_date=req.target_date,
    )
    return transits
```

- [ ] **Step 2: Write reading routes**

Rewrite `apps/api/app/routers/readings.py` (347 lines). Remove all DB saves, session handling. Keep: query routing, evidence extraction, answer composition, streaming.

The reading route handler should:
1. Parse request
2. Call QueryRouter to classify the query
3. Select engine based on method
4. Extract evidence using the engine
5. Call AnswerComposer to compose response
6. Return structured response

For streaming: same flow but use SSE with analysis ledger events.

Reference the existing `apps/api/app/routers/readings.py` for the full logic — strip out all `SavedReading` DB operations and `session_id` handling.

The streaming endpoint uses `StreamTokenAuth` instead of `ApiKeyAuth`.

- [ ] **Step 3: Write brief routes**

Rewrite `apps/api/app/routers/briefs.py` without DB. Keep brief generation logic.

- [ ] **Step 4: Write resonance routes**

Rewrite `apps/api/app/routers/resonance.py` without DB. Keep matching logic.

- [ ] **Step 5: Commit**

```bash
git add shastra-compute/src/api/v1/
git commit -m "feat: add API route handlers (chart, reading, brief, resonance)"
```

---

### Task 9: Write Dockerfile + Verify Build

**Files:**
- Create: `shastra-compute/Dockerfile`
- Create: `shastra-compute/.env.example`

- [ ] **Step 1: Write Dockerfile**

```dockerfile
FROM python:3.13-slim

WORKDIR /app

# Install system deps for pyswisseph
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy project files
COPY pyproject.toml .
COPY src/ src/

# Install Python dependencies
RUN pip install --no-cache-dir .

# Expose port
EXPOSE 8000

# Run with uvicorn
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 2: Write .env.example**

```bash
GEMINI_API_KEY=your_gemini_api_key
GEOCODING_API_KEY=your_geocoding_api_key
API_KEY=shared_secret_with_convex
STREAM_TOKEN_SECRET=hmac_signing_key
```

- [ ] **Step 3: Verify Docker build**

```bash
cd shastra-compute && docker build -t shastra-compute . && cd ..
```

Expected: Build succeeds. If import errors, fix import paths.

- [ ] **Step 4: Commit**

```bash
git add shastra-compute/Dockerfile shastra-compute/.env.example
git commit -m "feat: add Dockerfile and env config for shastra-compute"
```

---

## Chunk 2: Phase 2 — Convex Backend

### Task 10: Initialize Convex Project

**Files:**
- Create: `convex/convex.config.ts`
- Modify: `apps/web/package.json`

- [ ] **Step 1: Install Convex in the web app**

```bash
cd apps/web && pnpm add convex @convex-dev/polar @convex-dev/auth @auth/core && cd ../..
```

- [ ] **Step 2: Initialize Convex**

```bash
cd apps/web && npx convex init && cd ../..
```

This creates `convex/` directory. Move it if it ends up inside apps/web — Convex should be at the repo root or alongside apps/web.

- [ ] **Step 3: Write convex.config.ts**

```typescript
import { defineApp } from "convex/server";
import polar from "@convex-dev/polar/convex.config.js";

const app = defineApp();
app.use(polar);
export default app;
```

- [ ] **Step 4: Commit**

```bash
git add convex/ apps/web/package.json apps/web/pnpm-lock.yaml
git commit -m "feat: initialize Convex project with Polar component"
```

---

### Task 11: Write Convex Schema

**Files:**
- Create: `convex/schema.ts`

- [ ] **Step 1: Write schema with all tables and indexes**

```typescript
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    email: v.string(),
    name: v.optional(v.string()),
    authProvider: v.string(), // "google" | "magic_link"
    language: v.string(), // "en" | "hi"
    createdAt: v.number(),
  }).index("by_email", ["email"]),

  sessions: defineTable({
    sessionId: v.string(),
    userId: v.optional(v.id("users")),
    createdAt: v.number(),
  }).index("by_sessionId", ["sessionId"]),

  birthProfiles: defineTable({
    sessionId: v.string(),
    userId: v.optional(v.id("users")),
    dateOfBirth: v.string(),
    timeOfBirth: v.optional(v.string()),
    birthplace: v.string(),
    latitude: v.number(),
    longitude: v.number(),
    timezone: v.string(),
    birthTimeQuality: v.string(), // "exact" | "approximate" | "unknown"
    tone: v.string(), // "practical" | "emotional" | "spiritual" | "concise"
  })
    .index("by_sessionId", ["sessionId"])
    .index("by_userId", ["userId"]),

  canonicalCharts: defineTable({
    sessionId: v.string(),
    userId: v.optional(v.id("users")),
    chartData: v.string(), // JSON-serialized CanonicalChart
    computedAt: v.number(),
  })
    .index("by_sessionId", ["sessionId"])
    .index("by_userId", ["userId"]),

  readings: defineTable({
    sessionId: v.string(),
    userId: v.optional(v.id("users")),
    query: v.string(),
    method: v.string(),
    domain: v.string(),
    classification: v.string(), // JSON
    evidenceSummary: v.string(), // JSON
    reading: v.string(), // JSON
    isSaved: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_sessionId", ["sessionId", "createdAt"])
    .index("by_userId", ["userId", "createdAt"])
    .index("by_userId_saved", ["userId", "isSaved"]),

  queryUsage: defineTable({
    sessionId: v.string(),
    userId: v.optional(v.id("users")),
    queriedAt: v.number(),
  })
    .index("by_sessionId", ["sessionId", "queriedAt"])
    .index("by_userId", ["userId", "queriedAt"]),
});
```

- [ ] **Step 2: Push schema to Convex**

```bash
cd apps/web && npx convex dev --once && cd ../..
```

Expected: Schema deployed successfully.

- [ ] **Step 3: Commit**

```bash
git add convex/schema.ts
git commit -m "feat: add Convex schema with all tables and indexes"
```

---

### Task 12: Convex Auth Setup

**Files:**
- Create: `convex/auth.ts`
- Create: `convex/auth.config.ts`

- [ ] **Step 1: Write auth.config.ts**

```typescript
export default {
  providers: [
    {
      domain: "https://accounts.google.com",
      applicationID: process.env.GOOGLE_CLIENT_ID!,
      applicationSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  ],
};
```

- [ ] **Step 2: Write auth.ts**

```typescript
import { convexAuth } from "@convex-dev/auth/server";
import Google from "@auth/core/providers/google";
import Resend from "@auth/core/providers/resend";

export const { auth, signIn, signOut, store } = convexAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
    Resend({
      from: "Forsee <noreply@forsee.life>",
    }),
  ],
});
```

- [ ] **Step 3: Set Convex env vars**

```bash
npx convex env set AUTH_GOOGLE_ID <your_google_client_id>
npx convex env set AUTH_GOOGLE_SECRET <your_google_client_secret>
npx convex env set AUTH_RESEND_KEY <your_resend_api_key>
```

- [ ] **Step 4: Commit**

```bash
git add convex/auth.ts convex/auth.config.ts
git commit -m "feat: add Convex Auth with Google + magic link"
```

---

### Task 13: Session & User Functions

**Files:**
- Create: `convex/functions/sessions.ts`
- Create: `convex/functions/users.ts`

- [ ] **Step 1: Write sessions.ts**

```typescript
/**
 * Anonymous session management.
 *
 * Sessions are created client-side (UUID in localStorage) and registered
 * in Convex on first interaction. After auth, sessions are linked to userId.
 */
import { mutation, query } from "../_generated/server";
import { v } from "convex/values";

/** Register or retrieve an anonymous session. */
export const getOrCreate = mutation({
  args: { sessionId: v.string() },
  handler: async (ctx, { sessionId }) => {
    const existing = await ctx.db
      .query("sessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .first();

    if (existing) return existing._id;

    return await ctx.db.insert("sessions", {
      sessionId,
      createdAt: Date.now(),
    });
  },
});

/** Get session by sessionId. */
export const get = query({
  args: { sessionId: v.string() },
  handler: async (ctx, { sessionId }) => {
    return await ctx.db
      .query("sessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .first();
  },
});
```

- [ ] **Step 2: Write users.ts**

```typescript
/**
 * User management and session migration.
 *
 * On sign-up, migrateSession atomically links all anonymous data
 * (birth profiles, charts, readings, query usage) to the new userId.
 */
import { mutation, query } from "../_generated/server";
import { v } from "convex/values";

/** Get current user by auth identity. */
export const getCurrentUser = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    return await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .first();
  },
});

/**
 * Migrate anonymous session to authenticated user.
 *
 * This is a SINGLE ATOMIC mutation that updates all tables.
 * Called once after the user completes sign-up.
 */
export const migrateSession = mutation({
  args: {
    sessionId: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
    authProvider: v.string(),
  },
  handler: async (ctx, { sessionId, email, name, authProvider }) => {
    // Create or find user
    let user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();

    if (!user) {
      const userId = await ctx.db.insert("users", {
        email,
        name,
        authProvider,
        language: "en",
        createdAt: Date.now(),
      });
      user = await ctx.db.get(userId);
    }

    const userId = user!._id;

    // Link session
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .first();
    if (session) {
      await ctx.db.patch(session._id, { userId });
    }

    // Link birth profiles
    const profiles = await ctx.db
      .query("birthProfiles")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .collect();
    for (const profile of profiles) {
      await ctx.db.patch(profile._id, { userId });
    }

    // Link charts
    const charts = await ctx.db
      .query("canonicalCharts")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .collect();
    for (const chart of charts) {
      await ctx.db.patch(chart._id, { userId });
    }

    // Link readings
    const readings = await ctx.db
      .query("readings")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .collect();
    for (const reading of readings) {
      await ctx.db.patch(reading._id, { userId });
    }

    // Link query usage
    const usage = await ctx.db
      .query("queryUsage")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .collect();
    for (const record of usage) {
      await ctx.db.patch(record._id, { userId });
    }

    return userId;
  },
});
```

- [ ] **Step 3: Commit**

```bash
git add convex/functions/
git commit -m "feat: add session management and user migration functions"
```

---

### Task 14: Birth Profiles & Charts Functions

**Files:**
- Create: `convex/functions/birthProfiles.ts`
- Create: `convex/functions/charts.ts`

- [ ] **Step 1: Write birthProfiles.ts**

```typescript
/**
 * Birth profile CRUD operations.
 *
 * Each session/user has one birth profile containing their
 * birth details and tone preference.
 */
import { mutation, query } from "../_generated/server";
import { v } from "convex/values";

/** Get birth profile for a session. */
export const getBySession = query({
  args: { sessionId: v.string() },
  handler: async (ctx, { sessionId }) => {
    return await ctx.db
      .query("birthProfiles")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .first();
  },
});

/** Create or update birth profile. */
export const upsert = mutation({
  args: {
    sessionId: v.string(),
    dateOfBirth: v.string(),
    timeOfBirth: v.optional(v.string()),
    birthplace: v.string(),
    latitude: v.number(),
    longitude: v.number(),
    timezone: v.string(),
    birthTimeQuality: v.string(),
    tone: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("birthProfiles")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, args);
      return existing._id;
    }

    return await ctx.db.insert("birthProfiles", args);
  },
});

/** Update tone preference. */
export const updateTone = mutation({
  args: { sessionId: v.string(), tone: v.string() },
  handler: async (ctx, { sessionId, tone }) => {
    const profile = await ctx.db
      .query("birthProfiles")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .first();
    if (profile) {
      await ctx.db.patch(profile._id, { tone });
    }
  },
});
```

- [ ] **Step 2: Write charts.ts**

```typescript
/**
 * Canonical chart storage and retrieval.
 *
 * Charts are stored as JSON strings — they are opaque blobs
 * passed to the Python API for computation.
 */
import { mutation, query } from "../_generated/server";
import { v } from "convex/values";

/** Get chart for a session. */
export const getBySession = query({
  args: { sessionId: v.string() },
  handler: async (ctx, { sessionId }) => {
    return await ctx.db
      .query("canonicalCharts")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .first();
  },
});

/** Store a computed chart. */
export const store = mutation({
  args: {
    sessionId: v.string(),
    chartData: v.string(),
  },
  handler: async (ctx, { sessionId, chartData }) => {
    // Replace existing chart for this session
    const existing = await ctx.db
      .query("canonicalCharts")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        chartData,
        computedAt: Date.now(),
      });
      return existing._id;
    }

    return await ctx.db.insert("canonicalCharts", {
      sessionId,
      chartData,
      computedAt: Date.now(),
    });
  },
});
```

- [ ] **Step 3: Commit**

```bash
git add convex/functions/birthProfiles.ts convex/functions/charts.ts
git commit -m "feat: add birth profile and chart storage functions"
```

---

### Task 15: Rate Limiting & Subscription Functions

**Files:**
- Create: `convex/functions/queryUsage.ts`
- Create: `convex/functions/subscriptions.ts`
- Create: `convex/functions/readings.ts`

- [ ] **Step 1: Write queryUsage.ts**

```typescript
/**
 * Query usage tracking and rate limiting.
 *
 * Uses a rolling 7-day window. Tier limits:
 * - Maya (free): 5 queries/week
 * - Dhyan ($100/mo): 50 queries/week
 * - Moksha ($1000/mo): 500 queries/week
 */
import { mutation, query } from "../_generated/server";
import { v } from "convex/values";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const TIER_LIMITS: Record<string, number> = {
  maya: 5,
  dhyan: 50,
  moksha: 500,
};

/** Check if a query is allowed under the rate limit. */
export const checkLimit = query({
  args: {
    sessionId: v.string(),
    tier: v.string(),
  },
  handler: async (ctx, { sessionId, tier }) => {
    const limit = TIER_LIMITS[tier] ?? TIER_LIMITS.maya;
    const windowStart = Date.now() - SEVEN_DAYS_MS;

    const usageRecords = await ctx.db
      .query("queryUsage")
      .withIndex("by_sessionId", (q) =>
        q.eq("sessionId", sessionId).gte("queriedAt", windowStart)
      )
      .collect();

    const used = usageRecords.length;
    const remaining = Math.max(0, limit - used);

    // Find when the earliest query in the window expires
    let resetsAt: number | null = null;
    if (used >= limit && usageRecords.length > 0) {
      const earliest = usageRecords.reduce(
        (min, r) => (r.queriedAt < min ? r.queriedAt : min),
        usageRecords[0].queriedAt
      );
      resetsAt = earliest + SEVEN_DAYS_MS;
    }

    return {
      allowed: used < limit,
      used,
      limit,
      remaining,
      resetsAt,
    };
  },
});

/** Record a query usage event. */
export const recordUsage = mutation({
  args: {
    sessionId: v.string(),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, { sessionId, userId }) => {
    await ctx.db.insert("queryUsage", {
      sessionId,
      userId,
      queriedAt: Date.now(),
    });
  },
});
```

- [ ] **Step 2: Write subscriptions.ts**

```typescript
/**
 * Subscription tier resolution.
 *
 * Checks the user's Polar subscription to determine their tier.
 * Anonymous users are always Maya (free).
 */
import { query } from "../_generated/server";
import { v } from "convex/values";

/** Resolve the current tier for a session/user. */
export const getCurrentTier = query({
  args: {
    sessionId: v.string(),
  },
  handler: async (ctx, { sessionId }) => {
    // Check if session is linked to a user
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .first();

    if (!session?.userId) {
      return { tier: "maya", limit: 5 };
    }

    // Check Polar subscription via the Polar component
    // The @convex-dev/polar component syncs subscription data automatically.
    // We query it through the polar.getCurrentSubscription helper.
    // For now, return maya — this will be wired to Polar in Task 16.
    return { tier: "maya", limit: 5 };
  },
});
```

- [ ] **Step 3: Write readings.ts**

```typescript
/**
 * Reading history management.
 *
 * Readings are auto-saved after each query. Users can bookmark
 * readings (isSaved=true) and delete them.
 */
import { mutation, query } from "../_generated/server";
import { v } from "convex/values";

/** Store a completed reading. */
export const store = mutation({
  args: {
    sessionId: v.string(),
    userId: v.optional(v.id("users")),
    query: v.string(),
    method: v.string(),
    domain: v.string(),
    classification: v.string(),
    evidenceSummary: v.string(),
    reading: v.string(),
    isSaved: v.boolean(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("readings", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

/** Get reading history for a session. */
export const listBySession = query({
  args: { sessionId: v.string() },
  handler: async (ctx, { sessionId }) => {
    return await ctx.db
      .query("readings")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .order("desc")
      .take(50);
  },
});

/** Get saved/bookmarked readings for a user. */
export const listSaved = query({
  args: { sessionId: v.string() },
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .first();

    if (!session?.userId) return [];

    return await ctx.db
      .query("readings")
      .withIndex("by_userId_saved", (q) =>
        q.eq("userId", session.userId!).eq("isSaved", true)
      )
      .order("desc")
      .collect();
  },
});

/** Toggle bookmark on a reading. */
export const toggleSave = mutation({
  args: { readingId: v.id("readings") },
  handler: async (ctx, { readingId }) => {
    const reading = await ctx.db.get(readingId);
    if (reading) {
      await ctx.db.patch(readingId, { isSaved: !reading.isSaved });
    }
  },
});

/** Delete a reading. */
export const remove = mutation({
  args: { readingId: v.id("readings") },
  handler: async (ctx, { readingId }) => {
    await ctx.db.delete(readingId);
  },
});
```

- [ ] **Step 4: Commit**

```bash
git add convex/functions/queryUsage.ts convex/functions/subscriptions.ts convex/functions/readings.ts
git commit -m "feat: add rate limiting, subscription tier, and reading history functions"
```

---

### Task 16: Polar Integration

**Files:**
- Create: `convex/polar.ts`
- Create: `convex/http.ts`

- [ ] **Step 1: Write polar.ts**

```typescript
/**
 * Polar.sh payment integration via @convex-dev/polar.
 *
 * Products:
 * - dhyan: $100/month, 50 queries/week
 * - moksha: $1000/month, 500 queries/week
 * - maya: free tier (no Polar product, default)
 */
import { Polar } from "@convex-dev/polar";
import { api, components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";

export const polar = new Polar<DataModel>(components.polar, {
  getUserInfo: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    return { userId: identity.subject, email: identity.email! };
  },
  products: {
    dhyan: process.env.POLAR_DHYAN_PRODUCT_ID!,
    moksha: process.env.POLAR_MOKSHA_PRODUCT_ID!,
  },
});

export const {
  changeCurrentSubscription,
  cancelCurrentSubscription,
  getConfiguredProducts,
  listAllProducts,
  listAllSubscriptions,
  generateCheckoutLink,
  generateCustomerPortalUrl,
} = polar.api();
```

- [ ] **Step 2: Write http.ts**

```typescript
/**
 * HTTP routes for Convex.
 *
 * Registers the Polar webhook handler at /polar/events.
 */
import { httpRouter } from "convex/server";
import { polar } from "./polar";

const http = httpRouter();

// Register Polar webhook routes
polar.registerRoutes(http as any, {
  path: "/polar/events",
  events: {
    "subscription.canceled": async (ctx, event) => {
      console.log(
        "Subscription canceled:",
        event.data.customerCancellationReason
      );
    },
    "subscription.revoked": async (ctx, event) => {
      console.log("Subscription revoked, removing access:", event.data.id);
    },
  },
});

export default http;
```

- [ ] **Step 3: Set Polar env vars in Convex**

```bash
npx convex env set POLAR_ORGANIZATION_TOKEN <your_polar_org_token>
npx convex env set POLAR_WEBHOOK_SECRET <your_webhook_secret>
npx convex env set POLAR_DHYAN_PRODUCT_ID <dhyan_product_id>
npx convex env set POLAR_MOKSHA_PRODUCT_ID <moksha_product_id>
```

- [ ] **Step 4: Update subscriptions.ts to use Polar**

Update `convex/functions/subscriptions.ts` to check the Polar subscription via `polar.getCurrentSubscription()` instead of always returning maya.

- [ ] **Step 5: Commit**

```bash
git add convex/polar.ts convex/http.ts convex/functions/subscriptions.ts
git commit -m "feat: integrate Polar.sh for Dhyan + Moksha subscriptions"
```

---

### Task 17: Convex Actions (Python API Calls)

**Files:**
- Create: `convex/actions/computeChart.ts`
- Create: `convex/actions/askReading.ts`
- Create: `convex/actions/authorizeStream.ts`
- Create: `convex/actions/dailyBrief.ts`
- Create: `convex/actions/weeklyOutlook.ts`
- Create: `convex/actions/personalityMatch.ts`

- [ ] **Step 1: Write computeChart.ts**

```typescript
/**
 * Convex action: compute chart via Python API.
 *
 * Calls shastra-compute /v1/chart/compute, then stores
 * the result in the canonicalCharts table.
 */
import { action } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";

export const computeChart = action({
  args: {
    sessionId: v.string(),
    dateOfBirth: v.string(),
    timeOfBirth: v.optional(v.string()),
    birthplace: v.string(),
    birthTimeQuality: v.string(),
  },
  handler: async (ctx, args) => {
    const computeUrl = process.env.SHASTRA_COMPUTE_URL!;
    const apiKey = process.env.SHASTRA_COMPUTE_API_KEY!;

    const response = await fetch(`${computeUrl}/v1/chart/compute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({
        date_of_birth: args.dateOfBirth,
        time_of_birth: args.timeOfBirth,
        birthplace: args.birthplace,
        birth_time_quality: args.birthTimeQuality,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Chart computation failed: ${error}`);
    }

    const result = await response.json();

    // Store chart in Convex
    await ctx.runMutation(api.functions.charts.store, {
      sessionId: args.sessionId,
      chartData: JSON.stringify(result.chart),
    });

    // Store birth profile with geo data
    await ctx.runMutation(api.functions.birthProfiles.upsert, {
      sessionId: args.sessionId,
      dateOfBirth: args.dateOfBirth,
      timeOfBirth: args.timeOfBirth,
      birthplace: args.birthplace,
      latitude: result.geo.latitude,
      longitude: result.geo.longitude,
      timezone: result.geo.timezone,
      birthTimeQuality: args.birthTimeQuality,
      tone: "practical", // default, user changes later
    });

    return result;
  },
});
```

- [ ] **Step 2: Write askReading.ts**

```typescript
/**
 * Convex action: non-streaming reading via Python API.
 *
 * 1. Checks rate limit
 * 2. Records usage
 * 3. Calls Python /v1/reading/ask
 * 4. Stores reading in history
 * 5. Returns result with usage info
 */
import { action } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";

export const askReading = action({
  args: {
    sessionId: v.string(),
    query: v.string(),
    method: v.string(),
    tone: v.string(),
    chartData: v.string(), // JSON string
    birthTimeQuality: v.string(),
  },
  handler: async (ctx, args) => {
    // Check rate limit
    const tier = await ctx.runQuery(
      api.functions.subscriptions.getCurrentTier,
      { sessionId: args.sessionId }
    );
    const usage = await ctx.runQuery(api.functions.queryUsage.checkLimit, {
      sessionId: args.sessionId,
      tier: tier.tier,
    });

    if (!usage.allowed) {
      return {
        error: "rate_limit_exceeded",
        usage,
        message: `You've used all ${usage.limit} queries this week. ${
          tier.tier === "maya"
            ? "Upgrade to Dhyan for 50 queries/week."
            : `Your next query opens ${new Date(usage.resetsAt!).toLocaleDateString()}.`
        }`,
      };
    }

    // Record usage
    await ctx.runMutation(api.functions.queryUsage.recordUsage, {
      sessionId: args.sessionId,
    });

    // Call Python API
    const computeUrl = process.env.SHASTRA_COMPUTE_URL!;
    const apiKey = process.env.SHASTRA_COMPUTE_API_KEY!;

    const response = await fetch(`${computeUrl}/v1/reading/ask`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({
        query: args.query,
        method: args.method,
        tone: args.tone,
        chart_data: JSON.parse(args.chartData),
        birth_time_quality: args.birthTimeQuality,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Reading failed: ${error}`);
    }

    const result = await response.json();

    // Store reading
    await ctx.runMutation(api.functions.readings.store, {
      sessionId: args.sessionId,
      query: args.query,
      method: result.method_used,
      domain: result.classification?.domain ?? "general",
      classification: JSON.stringify(result.classification),
      evidenceSummary: JSON.stringify(result.evidence_summary),
      reading: JSON.stringify(result.reading),
      isSaved: false,
    });

    return {
      ...result,
      usage: {
        used: usage.used + 1,
        limit: usage.limit,
        remaining: usage.remaining - 1,
      },
    };
  },
});
```

- [ ] **Step 3: Write authorizeStream.ts**

```typescript
/**
 * Convex action: authorize a streaming reading.
 *
 * Checks rate limit, records usage, then issues a signed
 * HMAC token that the frontend uses to call the Python
 * streaming endpoint directly.
 */
import { action } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";

export const authorizeStream = action({
  args: {
    sessionId: v.string(),
  },
  handler: async (ctx, args) => {
    // Check rate limit
    const tier = await ctx.runQuery(
      api.functions.subscriptions.getCurrentTier,
      { sessionId: args.sessionId }
    );
    const usage = await ctx.runQuery(api.functions.queryUsage.checkLimit, {
      sessionId: args.sessionId,
      tier: tier.tier,
    });

    if (!usage.allowed) {
      return {
        error: "rate_limit_exceeded",
        usage,
      };
    }

    // Record usage
    await ctx.runMutation(api.functions.queryUsage.recordUsage, {
      sessionId: args.sessionId,
    });

    // Generate HMAC token
    const secret = process.env.STREAM_TOKEN_SECRET!;
    const payload = {
      sessionId: args.sessionId,
      queriedAt: Date.now(),
      exp: Math.floor(Date.now() / 1000) + 60, // 60 second expiry
    };

    const payloadB64 = btoa(JSON.stringify(payload));

    // Use Web Crypto API for HMAC (available in Convex runtime)
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signature = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(payloadB64)
    );
    const signatureHex = Array.from(new Uint8Array(signature))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const token = `${payloadB64}.${signatureHex}`;

    return {
      token,
      expiresAt: payload.exp,
      streamUrl: process.env.SHASTRA_COMPUTE_URL! + "/v1/reading/stream",
      usage: {
        used: usage.used + 1,
        limit: usage.limit,
        remaining: usage.remaining - 1,
      },
    };
  },
});
```

- [ ] **Step 4: Write dailyBrief.ts, weeklyOutlook.ts, personalityMatch.ts**

Follow same pattern as `computeChart.ts`:
- Call Python API with `X-API-Key`
- Return result to frontend
- No rate limiting on these (they don't count as "queries")

- [ ] **Step 5: Commit**

```bash
git add convex/actions/
git commit -m "feat: add Convex actions for Python API calls with rate limiting"
```

---

### Task 18: Cron Jobs

**Files:**
- Create: `convex/crons.ts`

- [ ] **Step 1: Write crons.ts**

```typescript
/**
 * Scheduled jobs for cleanup.
 *
 * - cleanupExpiredUsage: Remove queryUsage records older than 8 days
 * - cleanupStaleSessions: Remove anonymous sessions inactive for 30 days
 */
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily(
  "cleanup expired usage records",
  { hourUTC: 3, minuteUTC: 0 },
  internal.functions.queryUsage.cleanupExpired
);

crons.weekly(
  "cleanup stale anonymous sessions",
  { dayOfWeek: "sunday", hourUTC: 4, minuteUTC: 0 },
  internal.functions.sessions.cleanupStale
);

export default crons;
```

- [ ] **Step 2: Add internal cleanup functions to sessions.ts and queryUsage.ts**

Add `cleanupExpired` internal mutation to `queryUsage.ts`:
- Delete all records where `queriedAt < Date.now() - 8 * 24 * 60 * 60 * 1000`

Add `cleanupStale` internal mutation to `sessions.ts`:
- Delete sessions where `createdAt < Date.now() - 30 * 24 * 60 * 60 * 1000` and `userId` is null

- [ ] **Step 3: Commit**

```bash
git add convex/crons.ts convex/functions/queryUsage.ts convex/functions/sessions.ts
git commit -m "feat: add cron jobs for usage and session cleanup"
```

---

## Chunk 3: Phase 3 — Frontend Migration

### Task 19: Convex Client Setup

**Files:**
- Create: `apps/web/convex.ts`
- Modify: `apps/web/app/layout.tsx`
- Modify: `apps/web/package.json`
- Create: `apps/web/middleware.ts`

- [ ] **Step 1: Create Convex client**

```typescript
// apps/web/convex.ts
import { ConvexReactClient } from "convex/react";

export const convex = new ConvexReactClient(
  process.env.NEXT_PUBLIC_CONVEX_URL!
);
```

- [ ] **Step 2: Update layout.tsx with Convex providers**

Wrap the app with `ConvexAuthNextjsServerProvider` and `ConvexProvider`.

- [ ] **Step 3: Create middleware.ts for auth**

```typescript
// apps/web/middleware.ts
import {
  convexAuthNextjsMiddleware,
  createRouteMatcher,
  nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";

const isProtectedRoute = createRouteMatcher(["/settings/subscription"]);

export default convexAuthNextjsMiddleware(async (request, { convexAuth }) => {
  if (isProtectedRoute(request) && !(await convexAuth.isAuthenticated())) {
    return nextjsMiddlewareRedirect(request, "/auth/signin");
  }
});

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/convex.ts apps/web/app/layout.tsx apps/web/middleware.ts
git commit -m "feat: set up Convex client, providers, and auth middleware"
```

---

### Task 20: Session Hook & Store Migration

**Files:**
- Create: `apps/web/app/hooks/useSession.ts`
- Create: `apps/web/app/hooks/useSubscription.ts`
- Modify: `apps/web/app/store.tsx`
- Delete: `apps/web/app/api.ts`

- [ ] **Step 1: Write useSession hook**

```typescript
/**
 * Session management hook.
 *
 * Creates a sessionId in localStorage on first visit.
 * Registers the session in Convex.
 * Returns sessionId and auth state.
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

function generateSessionId(): string {
  return crypto.randomUUID();
}

export function useSession() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const registerSession = useMutation(api.functions.sessions.getOrCreate);

  useEffect(() => {
    let id = localStorage.getItem("shastra_session_id");
    if (!id) {
      id = generateSessionId();
      localStorage.setItem("shastra_session_id", id);
    }
    setSessionId(id);
    registerSession({ sessionId: id });
  }, []);

  return { sessionId };
}
```

- [ ] **Step 2: Write useSubscription hook**

```typescript
/**
 * Subscription and usage tracking hook.
 *
 * Returns current tier, usage stats, and whether
 * specific features are available.
 */
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export function useSubscription(sessionId: string | null) {
  const tier = useQuery(
    api.functions.subscriptions.getCurrentTier,
    sessionId ? { sessionId } : "skip"
  );
  const usage = useQuery(
    api.functions.queryUsage.checkLimit,
    sessionId && tier ? { sessionId, tier: tier.tier } : "skip"
  );

  return {
    tier: tier?.tier ?? "maya",
    limit: tier?.limit ?? 5,
    used: usage?.used ?? 0,
    remaining: usage?.remaining ?? 5,
    allowed: usage?.allowed ?? true,
    canCompare: (tier?.tier ?? "maya") !== "maya",
    canWeekly: (tier?.tier ?? "maya") !== "maya",
  };
}
```

- [ ] **Step 3: Rewrite store.tsx to use Convex**

Replace localStorage-based state with Convex queries:
- `profile` → `useQuery(api.functions.birthProfiles.getBySession, { sessionId })`
- `chart` → `useQuery(api.functions.charts.getBySession, { sessionId })`
- Remove all `localStorage.setItem/getItem` for profile/chart data
- Keep `sessionId` in localStorage (it's the anonymous identity anchor)

- [ ] **Step 4: Delete api.ts**

```bash
rm apps/web/app/api.ts
```

This file had direct `fetch` calls to the Python API. All calls now go through Convex.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/hooks/ apps/web/app/store.tsx
git rm apps/web/app/api.ts
git commit -m "feat: migrate state from localStorage to Convex with session hooks"
```

---

### Task 21: Update Onboarding Page

**Files:**
- Modify: `apps/web/app/onboarding/page.tsx`

- [ ] **Step 1: Replace chart computation call**

Replace the direct `fetch` to Python API with `useAction(api.actions.computeChart.computeChart)`.

The onboarding flow:
1. Step 1: Birth details form (keep existing UI)
2. Step 2: Tone preferences (keep existing UI)
3. Step 3: Computing — call Convex action instead of direct API
   - `computeChart({ sessionId, dateOfBirth, timeOfBirth, birthplace, birthTimeQuality })`
   - On success, chart is automatically stored in Convex
   - Redirect to `/chat`

- [ ] **Step 2: Commit**

```bash
git add apps/web/app/onboarding/page.tsx
git commit -m "feat: update onboarding to use Convex chart computation action"
```

---

### Task 22: Update Chat Page

**Files:**
- Modify: `apps/web/app/chat/page.tsx`
- Create: `apps/web/app/components/UsageIndicator.tsx`

- [ ] **Step 1: Write UsageIndicator component**

```tsx
/**
 * Shows remaining queries this week.
 * Displays upgrade prompt when limit is hit.
 */
export function UsageIndicator({
  used,
  limit,
  remaining,
  tier,
}: {
  used: number;
  limit: number;
  remaining: number;
  tier: string;
}) {
  return (
    <div className="flex items-center gap-2 text-sm text-neutral-400">
      <span>
        {remaining}/{limit} queries left
      </span>
      {remaining === 0 && tier === "maya" && (
        <a href="/pricing" className="text-amber-400 hover:text-amber-300">
          Upgrade
        </a>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update chat page**

Replace the chat query flow:
- Non-streaming: `useAction(api.actions.askReading.askReading)`
- Streaming: `useAction(api.actions.authorizeStream.authorizeStream)` to get token, then direct `fetch` to `streamUrl` with `Authorization: Bearer <token>`

The streaming SSE logic from the current `api.ts` (`askReadingStream`) moves into the chat page directly, using the token from `authorizeStream`.

Add `UsageIndicator` component next to the chat input.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/chat/page.tsx apps/web/app/components/UsageIndicator.tsx
git commit -m "feat: update chat to use Convex actions with rate limiting"
```

---

### Task 23: Auth UI & Pricing Page

**Files:**
- Create: `apps/web/app/auth/signin/page.tsx`
- Create: `apps/web/app/pricing/page.tsx`
- Create: `apps/web/app/components/AuthWall.tsx`
- Modify: `apps/web/app/settings/page.tsx`

- [ ] **Step 1: Write signin page**

Google OAuth button + email magic link form. Use `useAuthActions` from `@convex-dev/auth/react`.

- [ ] **Step 2: Write AuthWall component**

```tsx
/**
 * Auth gate component.
 *
 * Shows sign-in modal when triggered by:
 * - Saving a reading
 * - Subscribing to a paid tier
 * - Exceeding free query limit
 */
export function AuthWall({
  trigger,
  children,
}: {
  trigger: "save" | "subscribe" | "limit";
  children: React.ReactNode;
}) {
  // Show modal with sign-in options
  // On success, run session migration
}
```

- [ ] **Step 3: Write pricing page**

Three-column pricing page with Maya/Dhyan/Moksha cards. Use `CheckoutLink` from `@convex-dev/polar/react` for paid tiers.

```tsx
import { CheckoutLink } from "@convex-dev/polar/react";

// For each paid tier:
<CheckoutLink polarApi={api.polar} productIds={[dhyanProductId]}>
  Subscribe to Dhyan
</CheckoutLink>
```

- [ ] **Step 4: Update settings page**

Add `CustomerPortalLink` from `@convex-dev/polar/react` for subscription management.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/auth/ apps/web/app/pricing/ apps/web/app/components/AuthWall.tsx apps/web/app/settings/page.tsx
git commit -m "feat: add auth UI, pricing page, and subscription management"
```

---

### Task 24: Update Remaining Pages

**Files:**
- Modify: `apps/web/app/daily/page.tsx`
- Modify: `apps/web/app/weekly/page.tsx`
- Modify: `apps/web/app/saved/page.tsx`
- Modify: `apps/web/app/personalities/page.tsx`
- Modify: `apps/web/app/chart/page.tsx`
- Modify: `apps/web/app/chat/components/Sidebar.tsx`

- [ ] **Step 1: Update daily page**

Replace direct API call with `useAction(api.actions.dailyBrief.dailyBrief)`.

- [ ] **Step 2: Update weekly page**

Replace direct API call with `useAction(api.actions.weeklyOutlook.weeklyOutlook)`. Gate behind Dhyan/Moksha tier.

- [ ] **Step 3: Update saved page**

Replace direct API call with `useQuery(api.functions.readings.listSaved)`. Require auth.

- [ ] **Step 4: Update personalities page**

Replace direct API call with `useAction(api.actions.personalityMatch.personalityMatch)`.

- [ ] **Step 5: Update chart page**

Read chart from `useQuery(api.functions.charts.getBySession)` instead of localStorage.

- [ ] **Step 6: Update sidebar**

Add user menu (signed in: avatar + manage subscription, signed out: sign in button). Show current tier badge.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/daily/ apps/web/app/weekly/ apps/web/app/saved/ apps/web/app/personalities/ apps/web/app/chart/ apps/web/app/chat/components/Sidebar.tsx
git commit -m "feat: migrate all pages to Convex queries and actions"
```

---

## Chunk 4: Phase 4 — Cloudflare Deployment

### Task 25: Cloudflare Containers Setup (Shastra Compute)

**Files:**
- Create: `shastra-compute/wrangler.jsonc`
- Create: `shastra-compute/worker.ts`

- [ ] **Step 1: Write wrangler.jsonc**

```jsonc
{
  "name": "shastra-compute",
  "main": "worker.ts",
  "compatibility_date": "2025-01-01",
  "containers": [
    {
      "class_name": "ShastraCompute",
      "image": "./Dockerfile",
      "max_instances": 10
    }
  ],
  "durable_objects": {
    "bindings": [
      {
        "name": "SHASTRA_COMPUTE",
        "class_name": "ShastraCompute"
      }
    ]
  },
  "migrations": [
    {
      "tag": "v1",
      "new_sqlite_classes": ["ShastraCompute"]
    }
  ]
}
```

- [ ] **Step 2: Write worker.ts (request router)**

```typescript
import { Container } from "cloudflare:container";

export class ShastraCompute extends Container {
  defaultPort = 8000;
  sleepAfter = "30s"; // Scale to zero after 30s of inactivity

  override onStart() {
    console.log("Shastra Compute container started");
  }

  override onStop() {
    console.log("Shastra Compute container stopped");
  }
}

async function getRandom(
  ns: DurableObjectNamespace,
  maxInstances: number
): Promise<DurableObjectStub> {
  const id = ns.idFromName(
    String(Math.floor(Math.random() * maxInstances))
  );
  return ns.get(id);
}

export default {
  async fetch(request: Request, env: any): Promise<Response> {
    const container = await getRandom(env.SHASTRA_COMPUTE, 10);
    return container.fetch(request);
  },
};
```

- [ ] **Step 3: Deploy to Cloudflare**

```bash
cd shastra-compute && npx wrangler deploy && cd ..
```

- [ ] **Step 4: Set up api.forsee.life DNS**

In Cloudflare DNS dashboard:
- Add CNAME record: `api` → `shastra-compute.<account>.workers.dev`

- [ ] **Step 5: Commit**

```bash
git add shastra-compute/wrangler.jsonc shastra-compute/worker.ts
git commit -m "feat: add Cloudflare Containers config for shastra-compute"
```

---

### Task 26: Cloudflare Pages Setup (Frontend)

**Files:**
- Modify: `apps/web/next.config.ts`
- Modify: `apps/web/package.json`

- [ ] **Step 1: Install OpenNext adapter**

```bash
cd apps/web && pnpm add @opennextjs/cloudflare && cd ../..
```

- [ ] **Step 2: Update next.config.ts**

Remove `output: "standalone"`. Configure for Cloudflare:

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Remove output: "standalone" — incompatible with Cloudflare
  // OpenNext adapter handles the build output
};

export default nextConfig;
```

- [ ] **Step 3: Add open-next.config.ts**

```typescript
// apps/web/open-next.config.ts
import type { OpenNextConfig } from "@opennextjs/cloudflare";

const config: OpenNextConfig = {
  default: {
    override: {
      wrapper: "cloudflare-node",
      converter: "edge",
    },
  },
};

export default config;
```

- [ ] **Step 4: Deploy to Cloudflare Pages**

In Cloudflare Pages dashboard:
- Connect Git repo
- Build command: `cd apps/web && pnpm build`
- Framework preset: Next.js (OpenNext)
- Root directory: `apps/web`
- Environment variable: `NEXT_PUBLIC_CONVEX_URL=<your_convex_url>`
- Custom domain: `forsee.life`

- [ ] **Step 5: Commit**

```bash
git add apps/web/next.config.ts apps/web/open-next.config.ts apps/web/package.json
git commit -m "feat: configure Cloudflare Pages deployment with OpenNext adapter"
```

---

### Task 27: Final Wiring & Production Polar Webhook

- [ ] **Step 1: Set Convex env vars for production**

```bash
npx convex env set SHASTRA_COMPUTE_URL https://api.forsee.life
npx convex env set SHASTRA_COMPUTE_API_KEY <generate_strong_secret>
npx convex env set STREAM_TOKEN_SECRET <generate_strong_secret>
```

- [ ] **Step 2: Update Polar webhook URL**

In Polar dashboard, update webhook endpoint to:
`https://<your-convex-deployment>.convex.site/polar/events`

- [ ] **Step 3: Set Next.js env vars in Cloudflare Pages**

```
NEXT_PUBLIC_CONVEX_URL=https://<deployment>.convex.cloud
NEXT_PUBLIC_SHASTRA_STREAM_URL=https://api.forsee.life
```

- [ ] **Step 4: End-to-end test**

1. Visit forsee.life → onboarding → enter birth details → chart computes
2. Ask a question → rate limit checks → reading returns
3. Ask 5 questions → rate limit enforced → upgrade prompt shown
4. Sign in → session migrated → all data preserved
5. Subscribe to Dhyan → checkout completes → 50 queries/week
6. Stream a reading → token issued → SSE works

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: production deployment wiring for Cloudflare + Convex + Polar"
```

---

## Task Dependency Graph

```
Task 1 (Polar products) ──────────────────────────┐
                                                    │
Task 2 (Scaffold) ─→ Task 3 (Auth) ─→ Task 4-6 ─→ Task 7 (Schemas) ─→ Task 8 (Routes) ─→ Task 9 (Docker)
                                                    │
                                                    ▼
Task 10 (Convex init) ─→ Task 11 (Schema) ─→ Task 12 (Auth) ─→ Task 13-14 ─→ Task 15-16 ─→ Task 17 (Actions) ─→ Task 18 (Crons)
                                                                                                                      │
                                                                                                                      ▼
Task 19 (Client setup) ─→ Task 20 (Hooks) ─→ Task 21-22 (Onboarding/Chat) ─→ Task 23 (Auth/Pricing) ─→ Task 24 (Pages)
                                                                                                              │
                                                                                                              ▼
                                                                              Task 25 (CF Containers) ─→ Task 26 (CF Pages) ─→ Task 27 (Wire up)
```

**Parallelizable tasks:**
- Tasks 2-9 (Shastra Compute) can run in parallel with Task 1 (Polar setup)
- Tasks 4, 5, 6 can all run in parallel (copy core, engines, services)
- Tasks 13 and 14 can run in parallel (sessions/users + profiles/charts)
- Tasks 25 and 26 can run in parallel (CF Containers + CF Pages)
