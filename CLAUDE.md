# Sudarshan (Shastra) — Personalized Astrology AI

## Architecture

Three-layer system deployed on Cloudflare + Convex:

```
User → forsee.life (Cloudflare Pages / Next.js 16)
        ├── Non-streaming → Convex Cloud (modest-mouse-216)
        │                    ├── Auth (Google OAuth + Resend magic links)
        │                    ├── Database (users, sessions, profiles, charts, readings, usage)
        │                    ├── Rate Limiting (rolling 7-day per tier)
        │                    ├── @convex-dev/polar (subscription sync)
        │                    └── Actions → Shastra Compute
        └── Streaming → Convex action issues HMAC token
                         → Frontend connects directly to api.forsee.life/v1/reading/stream
```

## Project Structure

| Directory | What | Runtime |
|---|---|---|
| `convex/` | Backend — schema, functions, actions, auth, Polar, crons | Convex Cloud |
| `shastra-compute/` | Stateless Python API — astrology engines, Gemini LLM | Cloudflare Containers |
| `apps/web/` | Next.js frontend | Cloudflare Pages |
| `apps/api/` | **DEPRECATED** — old FastAPI monolith, replaced by shastra-compute |
| `packages/astro-core/` | **DEPRECATED** — absorbed into shastra-compute/src/ |

## Key Files

- `convex/schema.ts` — all table definitions + indexes
- `convex/functions/` — queries and mutations (sessions, users, readings, usage, subscriptions)
- `convex/actions/` — HTTP calls to shastra-compute (askReading, computeChart, authorizeStream, etc.)
- `convex/polar.ts` — Polar subscription component with Dhyan/Moksha product IDs
- `convex/auth.config.ts` — Google OAuth + Resend providers
- `convex/http.ts` — webhook routes (auth callbacks + Polar events)
- `shastra-compute/src/engines/` — Vedic, KP, Western, Compare astrology engines
- `shastra-compute/src/services/` — query_router, answer_composer, brief_service, resonance_service
- `shastra-compute/src/auth.py` — X-API-Key + HMAC token validation
- `apps/web/app/store.tsx` — client state (sessionId, profile, chart)
- `apps/web/app/chat/page.tsx` — main chat interface with streaming

## Pricing Tiers

| Tier | Price | Queries/week | Polar Product |
|---|---|---|---|
| Maya | Free | 5 | None (default) |
| Dhyan | $100/mo | 50 | `458d3978-f6e2-49e3-9a1b-c1d5b2425f32` |
| Moksha | $1000/mo | 500 | `25bb8519-70d3-4a1a-83b5-ae2befb2a654` |

## Deployments

| Service | Environment | URL |
|---|---|---|
| Convex (prod) | US East | `https://modest-mouse-216.convex.cloud` |
| Convex (dev) | US East | `https://silent-fly-721.convex.cloud` |
| Frontend | Cloudflare Pages | `forsee.life` |
| Compute API | Cloudflare Containers | `api.forsee.life` |

## Env Vars (all set on Convex prod)

`SHASTRA_COMPUTE_URL`, `SHASTRA_COMPUTE_API_KEY`, `STREAM_TOKEN_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_RESEND_KEY`, `GEMINI_API_KEY`, `POLAR_ORGANIZATION_TOKEN`, `POLAR_WEBHOOK_SECRET`

Shastra Compute uses: `API_KEY`, `STREAM_TOKEN_SECRET`, `GEMINI_API_KEY` (set in Cloudflare dashboard).

## Releasing

Tag-based deploys. Push a semver tag → GitHub Actions deploys all services → auto-creates a GitHub Release with changelog.

```bash
# Bump patch (0.0.1 → 0.0.2) — default
./scripts/release.sh

# Bump minor (0.0.2 → 0.1.0)
./scripts/release.sh minor

# Bump major (0.1.0 → 1.0.0)
./scripts/release.sh major
```

The script auto-detects the latest tag, increments, shows pending commits, and pushes.

**Versioning**: `v{major}.{minor}.{patch}` — starts at `v0.0.1`. The latest tag is always the current production deployment.

**GitHub Secrets**: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CONVEX_DEPLOY_KEY`, `NEXT_PUBLIC_CONVEX_URL`

Manual deploy (if needed):
```bash
npx convex deploy --cmd 'echo skip'                    # Convex
cd shastra-compute && npx wrangler deploy               # Compute
cd apps/web && pnpm exec opennextjs-cloudflare && \
  pnpm exec wrangler pages deploy .open-next --project-name=forsee-life  # Frontend
```

## Conventions

- Frontend uses Convex hooks (`useQuery`, `useAction`) — never calls Python API directly (except streaming)
- Streaming uses HMAC-signed tokens (60s expiry) issued by `authorizeStream` action
- Rate limiting uses rolling 7-day window with compound indexes on `queryUsage`
- Anonymous users identified by `sessionId` in localStorage; migrated atomically on sign-up
- Geocoding uses Nominatim (free, no API key) with in-memory caching
- All astrology computation is stateless — no DB in shastra-compute
