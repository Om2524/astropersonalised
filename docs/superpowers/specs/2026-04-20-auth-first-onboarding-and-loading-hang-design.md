# Auth-First Onboarding + Loading-Hang Fix

**Date:** 2026-04-20
**Author:** Om Patil (driver), pair-designed with Claude
**Status:** Draft — awaiting review

## Context

Four issues surfaced from user testing at forsee.life:

1. Queries sometimes "load forever" and eventually display "The stars are taking longer than usual…" with no answer.
2. Sign-in prompt appears *after* a user types their first query and is dismissible, letting users slip past it.
3. On phones the glass-card borders are too faint; the direct answer is rendered beneath the planet cards instead of above.
4. Settings exposes a "Clear Local Data" button that shouldn't be there.

Commit `42fda1a` ("fix: tighten chat auth gating and stream recovery") and `8e83d5b` ("feat: add PostHog telemetry for profiles and readings") already shipped the surface-level pieces of #2, #3, #4: a `dismissible` prop on `AuthWall`, pending-query replay through `sessionStorage`, a `hideDirectAnswer` prop on `ReadingCard`, direct-answer-above-planet-cards ordering, the 1.5 px mobile border bump in `globals.css`, a 45 s → 120 s frontend stream timeout, and removal of the Data section in `settings/page.tsx`.

This spec covers what remains, which is structural, not cosmetic:

- Convert `/onboarding` to **account-first**: signup is step 0, before any birth data is collected. Every `birthProfiles` / `charts` / `readings` row is owned by a real `userId` from the moment it exists.
- Rip out the anonymous plumbing that supported the old "browse first, sign up later" flow.
- Fix the loading-hang at its actual sources (container cold start, silent Gemini thinking, dead-end timeout UX), not just by widening the frontend timeout.

## Goals

- A user cannot reach `/chat` without an authenticated account and a birth profile attached to that account.
- The first query after a fresh page load feels instant — no 10-30 s wait caused by a cold Cloudflare Container.
- During the Gemini generation window the user always sees progress (a ledger event, streaming text, or a final answer) — never a silent spinner.
- A query that does time out or fail offers a one-click retry that preserves the question and the same `usageKey` (no double-charge).
- `sessionId` remains as a device/telemetry identifier but is no longer an identity surface; no read path treats a session-only record as "the user's data."

## Non-goals

- No changes to the pricing tiers, Polar integration, or rate-limit math. Moksha/Dhyan/Maya tier logic is untouched.
- No redesign of the chat conversation view itself. The direct-answer-above-planet-cards re-ordering shipped in `42fda1a`; we don't revisit it.
- No schema migration of existing anonymous-only rows in production. The app is small enough that we accept that a handful of anonymous-session-only birth profiles (if any exist in `modest-mouse-216`) become orphaned. Test-on-prod philosophy applies.
- No switch away from Convex Auth's Google + Resend providers. Auth UI is reused, not replaced.

## Design

### 1. Account-first onboarding

`/onboarding` gains a leading authentication step and re-numbers the rest.

```
Step 0 — Create your account      (NEW)
Step 1 — Your birth details       (was Step 0)
Step 2 — Preferences              (was Step 1)
Step 3 — Computing your chart     (was Step 2)
```

**Step 0 UI.** Reuses the same auth affordances as the existing `AuthWall`: a prominent "Continue with Google" button and an "or" divider above a magic-link email form. To avoid two implementations drifting apart, the Google-button + magic-link-form JSX is extracted out of `AuthWall.tsx` into a new shared component `AuthMethods.tsx` (under `apps/web/app/components/`). `AuthWall` keeps the modal chrome and renders `AuthMethods` inside. Onboarding Step 0 renders a page-level `glass-section` card that also renders `AuthMethods`. Heading/subhead copy for Step 0 is chosen at implementation time; the existing `AuthWall` copy ("Sign in to continue" / "Your chart data will be preserved after signing in") is a safe default and can be tweaked to match the onboarding framing.

`signIn()` calls use `redirectTo: "/onboarding"`. Post-Google-OAuth or post-magic-link-click the user lands back on `/onboarding`. The guard logic below (Step 1 gate) takes them forward.

**Onboarding guard.** `OnboardingPage` inspects `currentUser`:

- `currentUser === undefined` → loading skeleton (no step rendered yet).
- `currentUser === null` → render Step 0 unconditionally, regardless of local `step` state.
- `currentUser` truthy and `birthProfile` already exists for that user → `router.replace("/chat")`; they're done.
- `currentUser` truthy and no `birthProfile` → render Step 1.

Steps 1 through 3 remain as they are today, with one write-path change: `computeChartAction({ userId: currentUser._id, ... })` is now always called with a real `userId` — the `?? undefined` fallback comes out.

**Landing-page routing.** `/` (homepage, if it exists as a separate route; otherwise the `/chat` page does this inline) routes:

- Authed, has `birthProfile` → `/chat`
- Authed, no `birthProfile` → `/onboarding` (will render Step 1)
- Not authed → `/onboarding` (will render Step 0)

### 2. Cleanup of anonymous plumbing

`sessionId` stays in the schema and continues to be generated in `store.tsx` on first visit. It is used for PostHog device correlation and as a tie-breaker for rate-limit writes. It is **no longer** a read path for `birthProfiles` or `charts`.

Concrete deletions:

| File | Change |
|---|---|
| `convex/functions/users.ts` | Delete `migrateSession` mutation. |
| `apps/web/app/store.tsx` | Delete the `useEffect` calling `migrateSession`, the `lastMigratedKeyRef`, the `birthProfileBySession` query, the `chartDocBySession` query, and the `?? birthProfileBySession` / `?? chartDocBySession` fallbacks. `birthProfileByUser` and `chartDocByUser` become the only sources. |
| `convex/functions/birthProfiles.ts` | Delete `getBySession` export if no other caller remains. Mutations continue to accept `sessionId` for the row's column but require `userId`. |
| `convex/functions/charts.ts` | Same as birthProfiles. |
| `convex/actions/authorizeStream.ts` | Delete the `ANONYMOUS_PREVIEW_LIMIT` constant and the `!args.userId && usage.used >= ANONYMOUS_PREVIEW_LIMIT` block. If `!args.userId`, return `{ success: false, error: "auth_required", ... }` immediately — there is no valid "one free anonymous query" state anymore. |
| `apps/web/app/chat/page.tsx` | Delete `hasConsumedAnonymousQuery`, `hasShownAuthPrompt`, and `requiresLoginToContinue` (all three collapse once anonymous access is impossible — `currentUser` is guaranteed truthy on `/chat`). Delete the `useEffect` that opens `AuthWall` based on those. The `authorizeStream` "auth_required" branch in `handleSubmit` stays as a defensive no-op; it should be unreachable. Rate-limit exhaustion continues to surface through its own error branch (`rate_limit_exceeded`) and is unaffected. |
| `apps/web/app/components/AuthWall.tsx` | Extract the body into `AuthMethods.tsx` (see §1). `AuthWall` keeps `isOpen`, `dismissible`, and `reason` props and just wraps the modal chrome around `<AuthMethods />`. |

### 3. Loading-hang mitigation (option E = A + B + D)

The frontend-only change in `42fda1a` (45 s → 120 s timeout) reduces false-timeouts but doesn't eliminate the silent-wait experience or fix the cold-start itself. Three coordinated mitigations:

**A. Pre-warm the container on navigation.**

- New `apps/web/app/lib/prewarm.ts`:

  ```ts
  export function prewarmCompute(): void {
    const url = process.env.NEXT_PUBLIC_SHASTRA_COMPUTE_URL;
    if (!url) return;
    fetch(`${url}/health`, { cache: "no-store", keepalive: true }).catch(() => {});
  }
  ```

  (The current `SHASTRA_COMPUTE_URL` env var is Convex-side. We expose the same URL as `NEXT_PUBLIC_SHASTRA_COMPUTE_URL` to the frontend, or we hardcode `https://api.forsee.life` if we don't want the env var. Implementation decides.)

- Call `prewarmCompute()` from a `useEffect(..., [])` in two places: `OnboardingPage` (Step 1 mount — chart compute is imminent) and `ChatPage` (mount — next interaction is a query).

- Add `GET /health` to `shastra-compute/src/main.py` (or wherever the FastAPI app is constructed) returning `{"ok": true, "ts": <epoch>}`. Zero auth, zero business logic. Mount it *outside* the `/v1/reading` router so cold startup touches as little Python as possible — ideally just FastAPI boot + the healthcheck handler.

- Cost: an extra free HTTP request per page navigation. The container is likely already warm-enough from the pre-warm by the time the user finishes typing a birth date or question. Worst case, the pre-warm coincides with a real cold start; the subsequent real query still benefits because the container is warming in parallel.

**B. Immediate "Connecting" heartbeat.**

In `shastra-compute/src/api/v1/reading.py::event_stream()`, yield a step-0 ledger event before anything else:

```python
async def event_stream():
    try:
        async with asyncio.timeout(timeout):
            yield _sse_event("ledger", {"step": 0, "message": "Connecting to Shastra..."})
            # then existing step-1 ("Analyzing your question...")
            yield _sse_event("ledger", {"step": 1, "message": LEDGER_STEPS[0]})
            ...
```

The existing `LEDGER_STEPS` list keeps its entries and keeps emitting steps 1-7; we just prepend step 0. The frontend `AnalysisLedger` renders whatever step numbers arrive, so no frontend code change is required.

This guarantees a sub-second SSE event on *every* request, even the ones that then spend 10 s inside Gemini. The user no longer sees a silent spinner.

**D. Retry-on-timeout UX.**

- New component `apps/web/app/chat/components/RetryPrompt.tsx`. Props: `{ message: string; onRetry: () => void; onCancel: () => void }`. Renders an inline card with the message, a "Try again" primary button, a "Cancel" secondary button.
- In `chat/page.tsx`, the timeout catch block and the `case "error"` SSE branch both replace the raw string with a `RetryPrompt` attached to the assistant message. The assistant message gets a new optional field `retryable?: { query: string; usageKey: string; method: string }` on `ChatMessage`. When set, the render logic prefers `RetryPrompt` over `StreamingMarkdown`.
- The "Try again" handler re-invokes `handleSubmit(retryable.query)` but threads `retryable.usageKey` in, so `authorizeStream` sees the same key. `authorizeStream` must therefore be idempotent on `usageKey` — confirm in implementation that `recordUsage` / `recordCreditSpend` no-op on duplicate `usageKey`. If they don't today, add dedupe via a unique index or existence check.
- The old `"The stars are taking longer than usual..."` string becomes the `message` prop fed into `RetryPrompt`. Same copy, better affordance.

### 4. Data model notes

No schema changes. All `sessionId` columns stay. The contract becomes:

- `birthProfiles` and `charts` rows MUST have a non-null `userId`. Writes that pass `sessionId` only are rejected at the mutation layer.
- `readings` similarly requires `userId` going forward; rows created before the cutover that have only `sessionId` remain readable by their existing history path but cannot be re-associated without manual work (which we're not doing).
- `queryUsage` continues to key on both `sessionId` and `userId` for compound-index reads; `userId` is now always present.

## Error handling

- **Auth failure at Step 0.** Existing `AuthMethods` error-display logic (the red-text line) is preserved in the extracted component.
- **Google OAuth returns an unknown user.** Convex Auth handles user creation; no change.
- **Magic-link click after token expiry.** Existing Convex Auth redirect shows an error; we add no new code path.
- **Pre-warm request fails** (network, 5xx). Swallowed silently — it's a best-effort optimization.
- **Heartbeat event already emitted, then backend crashes before any other event.** Frontend sees the Connecting ledger plus eventually the 120 s timeout; `RetryPrompt` appears with the same query.
- **Retry after hitting the per-week rate limit.** `authorizeStream` returns the existing `rate_limit_exceeded` error; the retry path hands that through to the same `RetryPrompt`, which now shows the rate-limit message instead of the timeout one.

## Testing

- **Manual, prod.** Fresh incognito profile → land on `/onboarding` → confirm Step 0 appears and has both Google and email options → sign in with Google → confirm auto-advance to Step 1 → fill birth details, finish onboarding → arrive at `/chat` → ask a question within 2 s of page load → confirm "Connecting to Shastra…" ledger appears, then the normal 1-7 flow, then the answer. All on forsee.life (no staging).
- **Cold-start path.** Wait ≥ 5 min so the container sleeps, refresh `/chat`, wait ~2 s for pre-warm to fire, submit a query. Expect the first real query to be noticeably faster than before this change.
- **Retry path.** Temporarily set `stream_timeout_seconds = 3` in the Python config, deploy, submit a query, confirm the RetryPrompt appears, click "Try again", confirm the same query fires with the same `usageKey` (check Convex `queryUsage` table — no duplicate row), confirm the second attempt completes. Revert config change.
- **Cleanup verification.** Grep the codebase for `migrateSession`, `ANONYMOUS_PREVIEW_LIMIT`, `birthProfileBySession`, `chartDocBySession`. Should return zero hits post-change.

## Deployment order

1. Land the Python `/health` endpoint and the Step 0 ledger event (backend-only change, no contract break).
2. Land the `AuthMethods` extraction from `AuthWall` (UI-only, functionally identical).
3. Land the onboarding Step 0 + guard + landing-page routing.
4. Land the anonymous-plumbing cleanup (schema contract change: writes now require `userId`). This must ship after step 3 so no new anonymous writes happen during the overlap.
5. Land the pre-warm helper and the `RetryPrompt` component.

Steps 1-2 can deploy in any order. Steps 3-4 are coupled — ideally one tag. Step 5 can ride alongside any of the others.

## Open questions / follow-ups

- **Orphaned anonymous rows.** We accept them. If operationally they're a nuisance, a future cleanup migration can delete `birthProfiles` where `userId IS NULL AND createdAt < <cutoff>`. Out of scope here.
- **`NEXT_PUBLIC_SHASTRA_COMPUTE_URL`.** Decide in implementation whether to add this env var or hardcode `https://api.forsee.life` in `prewarm.ts`. Hardcoding is simpler; env var is cleaner.
- **`usageKey` idempotency.** Verify in `queryUsage.recordUsage` / `queryUsage.recordCreditSpend` that duplicate `usageKey` is a no-op. If not, add the guard as part of step 5.
