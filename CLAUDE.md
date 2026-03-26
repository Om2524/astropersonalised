# Sudarshan (Shastra) — Personalized Astrology AI

## Philosophy

Test on prod. Ship to prod. There is no dev environment. The latest git tag is the live deployment. Push code, tag it, see real changes at forsee.life.

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

| Service | URL |
|---|---|
| Convex | `https://modest-mouse-216.convex.cloud` |
| Convex HTTP | `https://modest-mouse-216.convex.site` |
| Frontend | `forsee.life` (Cloudflare Pages) |
| Compute API | `api.forsee.life` (Cloudflare Containers) |

## Credentials

All secrets are stored in two places. Never commit secrets to the repo.

### Convex Environment Variables

Stored in Convex dashboard. Update via CLI or MCP:

```bash
npx convex env set <NAME> <VALUE> --prod
npx convex env list --prod
```

| Variable | What | Source |
|---|---|---|
| `SHASTRA_COMPUTE_URL` | Python API URL | `https://api.forsee.life` |
| `SHASTRA_COMPUTE_API_KEY` | Shared secret between Convex and Python API | Generated: `openssl rand -hex 32` |
| `STREAM_TOKEN_SECRET` | HMAC signing key for streaming tokens | Generated: `openssl rand -hex 32` |
| `AUTH_GOOGLE_ID` | Google OAuth client ID | [Google Cloud Console → astra project → Credentials](https://console.cloud.google.com/apis/credentials?project=astra-474015) |
| `AUTH_GOOGLE_SECRET` | Google OAuth client secret | Same as above |
| `AUTH_RESEND_KEY` | Email magic link API key | [Resend dashboard](https://resend.com/api-keys) |
| `AUTH_RESEND_FROM` | Optional sender override for magic links | Defaults to `Forsee <noreply@forsee.life>` in `convex/auth.ts` |
| `GEMINI_API_KEY` | Google Gemini LLM key | [Google AI Studio](https://aistudio.google.com/apikey) |
| `POLAR_ORGANIZATION_TOKEN` | Polar API access | [Polar → Settings → API](https://polar.sh) |
| `POLAR_WEBHOOK_SECRET` | Validates Polar webhook payloads | [Polar → Webhooks](https://polar.sh) (endpoint: `https://modest-mouse-216.convex.site/polar/events`) |

### GitHub Secrets

Stored in repo Settings → Secrets and variables → Actions. Used by deploy workflow.

| Secret | What | Source |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | Deploys Workers + Pages | [Cloudflare → API Tokens](https://dash.cloudflare.com/profile/api-tokens) |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account | `2cb82847353e20a3b3d18bf81dc30449` |
| `CONVEX_DEPLOY_KEY` | Deploys Convex functions | [Convex dashboard → Settings → Deploy keys](https://dashboard.convex.dev/t/forsee/sudarshan/modest-mouse-216/settings) |
| `NEXT_PUBLIC_CONVEX_URL` | Baked into frontend build | `https://modest-mouse-216.convex.cloud` |

### Cloudflare Worker Secrets

Set in Cloudflare dashboard for the shastra-compute worker. Must match Convex values.

| Secret | Must match |
|---|---|
| `API_KEY` | Same as `SHASTRA_COMPUTE_API_KEY` in Convex |
| `STREAM_TOKEN_SECRET` | Same as `STREAM_TOKEN_SECRET` in Convex |
| `GEMINI_API_KEY` | Same as `GEMINI_API_KEY` in Convex |

### Google OAuth

Managed at [Google Cloud Console → astra project](https://console.cloud.google.com/apis/credentials?project=astra-474015).

- Authorized JS origins: `https://forsee.life`
- Authorized redirect URI: `https://modest-mouse-216.convex.site/api/auth/callback/google`

## Releasing

Tag-based deploys. Push a semver tag → GitHub Actions deploys all services → auto-creates a GitHub Release with changelog.

```bash
./scripts/release.sh          # patch: 0.0.1 → 0.0.2
./scripts/release.sh minor    # minor: 0.0.2 → 0.1.0
./scripts/release.sh major    # major: 0.1.0 → 1.0.0
```

The latest tag is always the live deployment. Versioning starts at `v0.0.1`.

Manual deploy (if needed):
```bash
npx convex deploy --cmd 'echo skip'                    # Convex
cd shastra-compute && npx wrangler deploy               # Compute
cd apps/web && pnpm exec opennextjs-cloudflare && \
  pnpm exec wrangler pages deploy .open-next --project-name=forsee-life  # Frontend
```

## Cloudflare Containers (shastra-compute)

The Python API runs as a Cloudflare Container (not a regular Worker). Key differences:

- **No time limit** — containers run as long as needed (unlike Workers' 30s CPU limit)
- **Cold start** — first request after sleep takes ~10-30s (Python loads numpy, pyswisseph, timezonefinder)
- **Warm requests** — instant while container is running
- **`sleepAfter = "5m"`** — container scales to zero after 5 minutes of inactivity
- **Startup timeout** — overridden to 60s in `worker.ts` (default 8s is too short for Python)
- **Max 10 instances** — load distributed randomly across container instances
- **Observability** — enabled in `wrangler.jsonc`, logs visible in Cloudflare Dashboard → Workers → shastra-compute → Logs

Container secrets (API_KEY, GEMINI_API_KEY, STREAM_TOKEN_SECRET) are set as Cloudflare Worker secrets, NOT passed as container env vars. The Python app reads them via pydantic-settings from the environment.

### Cloudflare API Token Requirements

The `CLOUDFLARE_API_TOKEN` in GitHub Secrets needs these permissions:
- Workers Scripts: Edit
- Workers KV Storage: Edit
- Workers Routes: Edit
- Account Settings: Read
- **Containers: Edit** (required for container image push)
- Account must be on **Workers Paid plan** ($5/month) — Containers is a beta feature

## Polar Subscriptions

Managed via `@convex-dev/polar` component. Fully configured:

| Component | File | What |
|---|---|---|
| Product IDs | `convex/polar.ts` | Dhyan + Moksha product IDs hardcoded |
| Webhooks | `convex/http.ts` | `/polar/events` endpoint handles subscription lifecycle |
| Tier resolution | `convex/functions/subscriptions.ts` | `getCurrentTier()` resolves maya/dhyan/moksha with grace periods |
| Rate limiting | `convex/functions/queryUsage.ts` | Rolling 7-day window, compound indexes |
| Frontend | `apps/web/app/hooks/useSubscription.ts` | `useSubscription()` hook for tier/limit info |
| Cleanup | `convex/crons.ts` | Daily cleanup of queryUsage records > 8 days old |

Polar webhook endpoint: `https://modest-mouse-216.convex.site/polar/events`
Polar dashboard: [polar.sh](https://polar.sh)

### Subscription Flow

1. Anonymous user → "maya" tier (5 queries/week, free)
2. User signs up → still "maya" until they subscribe
3. User subscribes via Polar checkout → webhook fires → Convex updates subscription
4. `getCurrentTier()` checks Polar subscription status → returns tier name
5. `checkLimit()` counts queries in rolling 7-day window against tier limit
6. Canceled subscriptions keep access until period end

## Conventions

- Test on prod. No staging, no dev deployments.
- Frontend uses Convex hooks (`useQuery`, `useAction`) — never calls Python API directly (except streaming)
- Streaming uses HMAC-signed tokens (60s expiry) issued by `authorizeStream` action
- Rate limiting uses rolling 7-day window with compound indexes on `queryUsage`
- Anonymous users identified by `sessionId` in localStorage; migrated atomically on sign-up
- Geocoding uses Nominatim (free, no API key) with in-memory caching
- All astrology computation is stateless — no DB in shastra-compute
- Deploy only via GitHub Actions (tag-based). Don't deploy locally with `wrangler deploy`.
