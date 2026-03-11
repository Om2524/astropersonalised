# Sudarshan (Shastra) — Convex + Polar.sh + Cloudflare Migration Design

**Date:** 2026-03-11
**Status:** Approved (rev.2 — post-review fixes)
**Domain:** forsee.life

## 1. Summary

Migrate Sudarshan from a FastAPI-monolith architecture to a three-layer system:

1. **Convex Cloud** — auth, database, subscriptions, rate limiting, session management
2. **Shastra Compute** (Cloudflare Containers) — stateless Python computation (Swiss Ephemeris, method engines, Gemini LLM)
3. **Next.js Frontend** (Cloudflare Pages) — presentation layer at forsee.life

Payment processing via Polar.sh integrated through the first-party `@convex-dev/polar` component (v0.8.1, verified on npm, maintained by Convex team).

**Data migration**: Fresh start. No existing user data to migrate from the PostgreSQL/Supabase prototype. The Alembic migrations and SQLAlchemy models are being replaced entirely by Convex.

**Redis**: Removed. Rate limiting moves to Convex. Geocoding caching handled in-memory in the Python container.

## 2. Pricing Tiers

| | Maya (Free) | Dhyan ($100/mo) | Moksha ($1000/mo) |
|---|---|---|---|
| Queries/week | 5 | 50 | 500 |
| Methods | 1 at a time | All + Compare | All + Compare |
| Daily Brief | Basic | Full | Full |
| Weekly Outlook | No | Yes | Yes |
| Personality Resonance | Top 3 | Top 10 | Top 50 |
| Saved Readings | Last 5 | Unlimited | Unlimited |
| Auth Required | No | Yes | Yes |

Rate limiting uses a **rolling 7-day window**: count queries where `queriedAt > (now - 7 days)`.

**Known limitation**: Anonymous rate limiting (Maya tier) uses sessionId stored in localStorage. Users can bypass by clearing storage or using incognito. This is acceptable for the free tier — 5 queries have low cost, and paid tiers require auth which cannot be bypassed.

## 3. Architecture

```
User → Next.js (Cloudflare Pages / forsee.life)
         │
         ├──[non-streaming]──→ Convex Cloud
         │                     ├── Auth (Google OAuth + Email Magic Link)
         │                     ├── Database (users, sessions, profiles, charts, readings, usage)
         │                     ├── Rate Limiting (rolling 7-day per tier)
         │                     ├── @convex-dev/polar (subscription sync)
         │                     │     └── Polar.sh webhooks → convex.site/polar/events
         │                     └── Actions (HTTP calls to Shastra Compute)
         │                             │
         │                             ▼
         │                     Shastra Compute (CF Containers / api.forsee.life)
         │                     ├── Swiss Ephemeris (chart computation)
         │                     ├── Method Engines (Vedic, KP, Western, Compare)
         │                     ├── Gemini LLM (query routing, answer composition)
         │                     └── Stateless — no database, no user state
         │
         └──[streaming]──→ Convex action (rate limit + issue token)
                              │
                              ▼ returns one-time signed token
                           Frontend calls api.forsee.life/v1/reading/stream
                           directly with token in Authorization header
```

### 3.1 Streaming Architecture (Critical Decision)

Convex actions return a single value — they cannot proxy SSE streams. Therefore streaming readings use a **token-gated direct connection**:

1. Frontend calls `useAction(api.actions.authorizeStream)` → Convex checks rate limit, records usage, returns `{ token, expiresAt }`
2. Token is a HMAC-signed payload: `{ sessionId, userId?, queriedAt, exp }` signed with shared `STREAM_TOKEN_SECRET`
3. Frontend opens SSE connection to `api.forsee.life/v1/reading/stream` with `Authorization: Bearer <token>`
4. Python API validates HMAC signature + expiry (no database call needed)
5. Token is single-use (valid for 60 seconds, one request)

Non-streaming endpoints (`/v1/reading/ask`, `/v1/chart/compute`, etc.) are called through Convex actions with `X-API-Key` header as before.

## 4. Authentication

- **Anonymous by default**: users enter birth details and use the app without signing up
- **Auth triggers**: saving readings, subscribing to Dhyan/Moksha, exceeding Maya limits
- **Providers**: Google OAuth + Email magic link (via Convex Auth)
- **Session migration**: on sign-up, all anonymous data (birth profile, chart, readings, usage) linked to new userId via a **single atomic Convex mutation**

## 5. Convex Data Model

### 5.1 users

| Field | Type | Notes |
|---|---|---|
| email | string | unique |
| name | string? | optional |
| authProvider | string | "google" or "magic_link" |
| language | string | "en" or "hi" |
| createdAt | number | timestamp |

### 5.2 sessions

| Field | Type | Notes |
|---|---|---|
| sessionId | string | UUID, stored in localStorage |
| userId | Id<"users">? | linked after sign-up |
| createdAt | number | timestamp |

**Index**: `by_sessionId` on `[sessionId]`

### 5.3 birthProfiles

| Field | Type | Notes |
|---|---|---|
| sessionId | string | always present |
| userId | Id<"users">? | linked after sign-up |
| dateOfBirth | string | YYYY-MM-DD |
| timeOfBirth | string? | HH:MM or null |
| birthplace | string | display name |
| latitude | number | geocoded |
| longitude | number | geocoded |
| timezone | string | IANA timezone |
| birthTimeQuality | string | "exact", "approximate", "unknown" |
| tone | string | "practical", "emotional", "spiritual", "concise" |

**Indexes**: `by_sessionId` on `[sessionId]`, `by_userId` on `[userId]`

### 5.4 canonicalCharts

| Field | Type | Notes |
|---|---|---|
| sessionId | string | |
| userId | Id<"users">? | |
| chartData | string | JSON-serialized CanonicalChart (intentionally opaque — charts are passed as blobs to Python API, not queried by field) |
| computedAt | number | timestamp |

**Indexes**: `by_sessionId` on `[sessionId]`, `by_userId` on `[userId]`

### 5.5 readings

| Field | Type | Notes |
|---|---|---|
| sessionId | string | |
| userId | Id<"users">? | |
| query | string | user's question |
| method | string | "vedic", "kp", "western", "compare" |
| domain | string | classified domain |
| classification | string | JSON |
| evidenceSummary | string | JSON (includes confidence as a float within the evidence object) |
| reading | string | JSON structured response |
| isSaved | boolean | bookmarked by user |
| createdAt | number | timestamp |

**Indexes**: `by_sessionId` on `[sessionId, createdAt]`, `by_userId` on `[userId, createdAt]`, `by_userId_saved` on `[userId, isSaved]`

### 5.6 queryUsage

| Field | Type | Notes |
|---|---|---|
| sessionId | string | |
| userId | Id<"users">? | |
| queriedAt | number | timestamp |

**Indexes**: `by_sessionId` on `[sessionId, queriedAt]`, `by_userId` on `[userId, queriedAt]`

These compound indexes are critical — without them, the rolling-window rate limit query becomes a full table scan. Convex has a 32,000 document scan limit per transaction.

## 6. Polar.sh Integration

### 6.1 Products to Create in Polar Dashboard

Create these in **sandbox first** (sandbox.polar.sh), then production (polar.sh):

- **dhyan** — $100/month recurring subscription
- **moksha** — $1000/month recurring subscription

Maya is the default free tier — no Polar product needed.

### 6.2 Convex Polar Component Setup

```typescript
// convex/polar.ts
import { Polar } from "@convex-dev/polar";
import { components } from "./_generated/api";
import { DataModel } from "./_generated/dataModel";

export const polar = new Polar<DataModel>(components.polar, {
  getUserInfo: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    return { userId: identity.subject, email: identity.email! };
  },
  products: {
    dhyan: "<polar_product_id_dhyan>",
    moksha: "<polar_product_id_moksha>",
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

### 6.3 Webhook Events

Endpoint: `https://<deployment>.convex.site/polar/events`

Events to enable:
- `product.created`
- `product.updated`
- `subscription.created`
- `subscription.active` — payment confirmed, grant access
- `subscription.updated`
- `subscription.canceled` — user cancelled, downgrade at period end
- `subscription.revoked` — immediate access removal
- `subscription.past_due` — failed renewal, grace period
- `order.created` — renewal tracking

### 6.4 Tier Resolution Logic

```
1. Check if user has active Polar subscription
2. If subscription.productKey === "moksha" → 500 queries/week
3. If subscription.productKey === "dhyan" → 50 queries/week
4. If subscription status is "past_due" → keep current tier for grace period (7 days)
5. If subscription status is "canceled" → keep tier until currentPeriodEnd
6. If subscription status is "revoked" → immediately downgrade to Maya
7. Else → Maya (free) → 5 queries/week
```

## 7. Rate Limiting

### 7.1 Rolling 7-Day Window

For each query attempt:
1. Resolve identity (sessionId or userId)
2. Query `queryUsage` using compound index: `by_sessionId[sessionId, queriedAt]` where `queriedAt > Date.now() - 7 * 24 * 60 * 60 * 1000`
3. Resolve tier limit (5 / 50 / 500)
4. If count >= limit: return `{ allowed: false, remaining: 0, resetsAt: <earliest expiring query + 7 days> }`
5. If allowed: insert `queryUsage` record, proceed with computation

### 7.2 Usage Response

Every query response includes:
```json
{
  "usage": {
    "used": 3,
    "limit": 5,
    "remaining": 2,
    "windowEnds": "earliest query timestamp + 7 days"
  }
}
```

## 8. Shastra Compute (Python API)

### 8.1 Endpoints

| Method | Path | Purpose | Auth |
|---|---|---|---|
| POST | /v1/chart/compute | Compute natal chart from birth details | X-API-Key |
| POST | /v1/chart/transits | Compute transits for a given chart + date | X-API-Key |
| POST | /v1/reading/ask | Synchronous reading (classify → evidence → compose) | X-API-Key |
| POST | /v1/reading/stream | Streaming reading via SSE | Bearer token (HMAC) |
| POST | /v1/brief/daily | Generate daily insight | X-API-Key |
| POST | /v1/brief/weekly | Generate weekly outlook | X-API-Key |
| POST | /v1/resonance/match | Find personality matches | X-API-Key |
| GET | /health | Health check | None |

### 8.2 Project Structure

The existing `packages/astro-core/` code is absorbed directly into `shastra-compute/src/core/` and `shastra-compute/src/engines/`. The hacky `sys.modules` import registration in `apps/api/app/astro_imports.py` is eliminated. This becomes a self-contained Python project.

```
shastra-compute/
├── Dockerfile
├── pyproject.toml
├── src/
│   ├── main.py                    # FastAPI app, CORS, health check
│   ├── config.py                  # env vars via pydantic-settings
│   ├── auth.py                    # X-API-Key + HMAC token validation
│   ├── api/
│   │   ├── v1/
│   │   │   ├── chart.py           # /v1/chart/* routes
│   │   │   ├── reading.py         # /v1/reading/* routes
│   │   │   ├── brief.py           # /v1/brief/* routes
│   │   │   └── resonance.py       # /v1/resonance/* routes
│   │   └── schemas/
│   │       ├── chart.py           # request/response models
│   │       ├── reading.py
│   │       ├── brief.py
│   │       └── resonance.py
│   ├── core/
│   │   ├── calculator.py          # Swiss Ephemeris wrapper
│   │   ├── geocoding.py           # birthplace → lat/lon/tz
│   │   └── models/
│   │       └── chart.py           # CanonicalChart, PlanetPosition, etc.
│   ├── engines/
│   │   ├── base.py                # BaseEngine, BaseEvidence
│   │   ├── vedic.py               # VedicEngine
│   │   ├── kp.py                  # KPEngine
│   │   ├── western.py             # WesternEngine
│   │   └── compare.py             # CompareEngine
│   ├── services/
│   │   ├── query_router.py        # Gemini query classification
│   │   ├── answer_composer.py     # Gemini response composition
│   │   ├── brief_service.py       # daily/weekly generation
│   │   └── resonance_service.py   # personality matching
│   └── data/
│       └── celebrities.py         # pre-computed celebrity charts
```

### 8.3 Security

- **X-API-Key**: Shared secret between Convex env vars and Python. Used for all non-streaming endpoints called from Convex actions.
- **HMAC Bearer Token**: For streaming endpoint. Token issued by Convex `authorizeStream` action, validated by Python. Contains `{ sessionId, userId?, queriedAt, exp }` signed with `STREAM_TOKEN_SECRET`. Single-use, 60-second expiry.
- **CORS**: Restricted to `forsee.life` origin (for direct streaming calls from frontend).

### 8.4 Error Handling

- All endpoints return structured error responses: `{ "error": "message", "code": "ERROR_CODE" }`
- Convex actions wrap Python calls with 30-second timeout (chart compute) or 120-second timeout (readings with Gemini)
- On Python API failure, Convex action returns error to frontend — no silent failures
- On Gemini API failure, Python returns partial response if evidence extraction succeeded, with error flag

## 9. Convex Backend Structure

```
convex/
├── convex.config.ts               # register Polar component
├── schema.ts                      # all table definitions + indexes
├── http.ts                        # Polar webhook routes
├── auth.ts                        # Convex Auth config
├── auth.config.ts                 # Google + magic link providers
│
├── functions/
│   ├── users.ts                   # user CRUD, session migration (single atomic mutation)
│   ├── sessions.ts                # create/get anonymous sessions
│   ├── birthProfiles.ts           # birth data CRUD
│   ├── charts.ts                  # chart storage + retrieval
│   ├── readings.ts                # reading history, save/unsave/delete
│   ├── queryUsage.ts              # rate limiting (rolling 7-day) + tier resolution
│   └── subscriptions.ts           # tier checks, feature gates
│
├── actions/
│   ├── computeChart.ts            # → Python /v1/chart/compute
│   ├── askReading.ts              # rate limit check → Python /v1/reading/ask → store result
│   ├── authorizeStream.ts         # rate limit check → issue HMAC token for streaming
│   ├── dailyBrief.ts              # → Python /v1/brief/daily
│   ├── weeklyOutlook.ts           # → Python /v1/brief/weekly
│   └── personalityMatch.ts        # → Python /v1/resonance/match
│
├── polar.ts                       # Polar component init, product mapping, exported API
└── crons.ts                       # scheduled jobs
```

### 9.1 Cron Jobs

| Job | Frequency | Purpose |
|---|---|---|
| cleanupExpiredUsage | Daily at 3am UTC | Delete queryUsage records older than 8 days (7-day window + 1 day buffer) |
| cleanupStaleSessions | Weekly | Delete anonymous sessions with no activity for 30 days |

## 10. Next.js Frontend Updates

### 10.1 Provider Stack

```tsx
<ConvexAuthNextjsServerProvider>
  <ConvexProvider client={convex}>
    <App />
  </ConvexProvider>
</ConvexAuthNextjsServerProvider>
```

### 10.2 Key Changes from Current Frontend

- Remove `apps/web/app/api.ts` (direct Python calls) — replace with Convex hooks
- Add `useQuery(api.functions.readings.list)` for reading history
- Add `useAction(api.actions.askReading)` for non-streaming query submission
- Add `useAction(api.actions.authorizeStream)` + direct fetch for streaming queries
- Add auth components (sign in modal, user menu)
- Add pricing page with `CheckoutLink` from `@convex-dev/polar/react`
- Add usage indicator (queries remaining this week)
- Add `CustomerPortalLink` for subscription management
- State management shifts from localStorage (profile/chart) to Convex (reactive, real-time)
- Keep localStorage only for: `sessionId` (anonymous identity)

### 10.3 New Pages

- `/pricing` — three-tier pricing with Polar checkout links
- `/auth/signin` — Google + magic link sign-in

### 10.4 Updated Pages

- `/chat` — query submission through Convex, usage indicator, streaming via direct token-gated connection
- `/settings` — subscription management via CustomerPortalLink
- All pages — auth-aware (show sign-in prompt at auth walls)

## 11. Cloudflare Deployment

### 11.1 DNS (forsee.life)

| Record | Target |
|---|---|
| forsee.life | Cloudflare Pages (Next.js) |
| api.forsee.life | Cloudflare Container Worker (Shastra Compute) |

### 11.2 Cloudflare Pages Config

- Framework: Next.js with `@opennextjs/cloudflare` adapter
- Build command: `pnpm build`
- Output directory: configured by OpenNext adapter (not raw `.next`)
- Remove `output: "standalone"` from `next.config.ts` (that's for Node.js, not Cloudflare)
- Environment variables: `NEXT_PUBLIC_CONVEX_URL`

### 11.3 Cloudflare Containers Config (wrangler.jsonc)

```jsonc
{
  "name": "shastra-compute",
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

### 11.4 Environment Variables

**Convex:**
- `POLAR_ORGANIZATION_TOKEN` — Polar.sh org token
- `POLAR_WEBHOOK_SECRET` — Polar webhook validation
- `SHASTRA_COMPUTE_URL` — Python API URL (https://api.forsee.life)
- `SHASTRA_COMPUTE_API_KEY` — shared secret for X-API-Key auth
- `STREAM_TOKEN_SECRET` — HMAC signing key for streaming tokens

**Shastra Compute (Cloudflare Container):**
- `GEMINI_API_KEY` — Google GenAI key
- `GEOCODING_API_KEY` — geocoding provider key
- `API_KEY` — shared secret (validates X-API-Key from Convex)
- `STREAM_TOKEN_SECRET` — HMAC validation key (same as Convex)

**Next.js (Cloudflare Pages):**
- `NEXT_PUBLIC_CONVEX_URL` — Convex deployment URL
- `NEXT_PUBLIC_SHASTRA_STREAM_URL` — https://api.forsee.life (for direct streaming calls)

## 12. Session Migration Flow

When an anonymous user signs up, a **single atomic Convex mutation** runs:

1. User completes auth (Google or magic link)
2. Convex Auth creates user record, returns userId
3. `migrateSession` mutation (single transaction):
   - Look up session by `sessionId` index
   - Set `userId` on: session, birthProfiles, canonicalCharts, readings, queryUsage
   - All updates in one atomic mutation (Convex guarantees transactional consistency)
4. Frontend detects auth state change, switches to userId-based queries
5. All existing data is preserved

**Edge case — multiple anonymous sessions**: If a user creates multiple sessions (cleared cookies, new device) then signs in, only the current `sessionId` (from localStorage) is migrated. Previous anonymous sessions remain orphaned and are cleaned up by the weekly cron.

## 13. Implementation Order

1. **Phase 0 — Polar Setup**: Create Dhyan + Moksha products in Polar sandbox dashboard (prerequisite for all other phases)
2. **Phase 1 — Shastra Compute**: Restructure Python API into clean domain-based `shastra-compute/` project. Absorb `astro-core`. Remove DB/auth/Redis. Add HMAC token validation for streaming. Add X-API-Key validation.
3. **Phase 2 — Convex Backend**: Schema with indexes, Convex Auth (Google + magic link), anonymous sessions, Polar component integration, rate limiting, actions that call Python API, cron jobs.
4. **Phase 3 — Frontend Migration**: Swap API calls to Convex hooks/actions, add auth UI, pricing page with CheckoutLink, usage indicator, streaming via token-gated direct connection, session migration.
5. **Phase 4 — Cloudflare Deployment**: Pages for frontend (OpenNext adapter), Containers for Python (wrangler.jsonc), DNS setup for forsee.life + api.forsee.life, production Polar webhook configuration.

## 14. Success Criteria

- Anonymous users can use Maya tier (5 queries/week) without signing up
- Auth wall appears at correct triggers (save, subscribe, limit hit)
- Polar checkout works for Dhyan and Moksha tiers
- Subscription lifecycle handled (active, canceled, revoked, past_due)
- Rate limiting accurately tracks rolling 7-day window per tier
- Streaming readings work via token-gated direct connection to Python API
- Non-streaming operations work through Convex actions
- Session migration preserves all anonymous data on sign-up
- All existing features preserved (chat, daily, weekly, resonance, saved readings)
- Deployed and accessible at forsee.life + api.forsee.life
