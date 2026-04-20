# Sudarshan (Shastra)

Personalized Vedic astrology AI — live at [forsee.life](https://forsee.life).

## Architecture

```
User → forsee.life (Next.js 16 on Cloudflare Pages)
        ├── Convex Cloud (auth, database, rate limiting, subscriptions)
        │   └── Actions → api.forsee.life (astrology compute + Gemini LLM)
        ├── Cloudflare Worker (transactional + inbound email routing)
        └── Streaming → HMAC-signed direct connection to api.forsee.life
```

| Layer | Stack | Runtime |
|---|---|---|
| **Frontend** | Next.js 16, React 19, Tailwind CSS 4, TypeScript | Cloudflare Pages (OpenNext) |
| **Backend** | Convex (schema, auth, Polar subscriptions, rate limiting) | Convex Cloud |
| **Compute** | FastAPI, Swiss Ephemeris, Google Gemini | Cloudflare Containers (Python 3.13) |
| **Email** | Cloudflare Email Routing + Email Service Worker | Cloudflare Workers |

## Project Structure

```
├── apps/web/              Next.js frontend
├── apps/email-service/    Cloudflare Worker for outbound + inbound email
├── convex/                Backend — schema, functions, actions, auth
│   ├── functions/         Queries and mutations
│   └── actions/           HTTP calls to shastra-compute
├── shastra-compute/       Stateless Python API
│   ├── src/engines/       Vedic, KP, Western, Compare astrology engines
│   ├── src/services/      Query router, answer composer, brief, resonance
│   └── Dockerfile
└── scripts/               Release tooling
```

## Development

### Prerequisites

- Node.js 22+, pnpm 10+
- Python 3.12+ (for shastra-compute local dev)
- Docker (for compute container builds)

### Frontend

```bash
cd apps/web
pnpm install
pnpm dev          # http://localhost:3000
```

### Shastra Compute (local)

```bash
cd shastra-compute
pip install -e .
uvicorn src.main:app --reload --port 8000
```

## Deploying

Tag-based deploys via GitHub Actions. Push a semver tag → all services deploy automatically → GitHub Release created.

```bash
./scripts/release.sh          # patch: v0.0.1 → v0.0.2
./scripts/release.sh minor    # minor: v0.0.2 → v0.1.0
./scripts/release.sh major    # major: v0.1.0 → v1.0.0
```

The latest tag is always the live deployment.

## CI

Every push to `main` and every PR runs checks:

- **Frontend**: TypeScript type check + Next.js build
- **Convex**: TypeScript type check on all functions
- **Compute**: Docker build + container smoke test

## Services

| Service | URL |
|---|---|
| Frontend | [forsee.life](https://forsee.life) |
| Compute API | [api.forsee.life](https://api.forsee.life) |
| Email Worker | `forsee-mail.<account>.workers.dev` |
| Convex | `modest-mouse-216.convex.cloud` |

## Email delivery

Daily brief email delivery is scheduled from Convex and sent through the Cloudflare email worker in [apps/email-service](apps/email-service/README.md). Inbound routed mail can also be forwarded through the same worker once Email Routing is enabled in Cloudflare.

Auth magic-link email is still wired to Resend inside [convex/auth.ts](convex/auth.ts). The new Cloudflare worker covers product email delivery and inbound routing without changing the sign-in flow yet.

## Pricing

| Tier | Price | Queries/week |
|---|---|---|
| Maya | Free | 5 |
| Dhyan | $100/mo | 50 |
| Moksha | $1000/mo | 500 |
