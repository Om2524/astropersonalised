# Auth-First Onboarding + Loading-Hang Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship account-first onboarding (signup as step 0 before birth details), rip out anonymous-session plumbing, and fix the "stars taking long" loading hang at its roots (immediate SSE heartbeat + container prewarm + retry-on-timeout UX).

**Architecture:** Five independent work streams mapped to the spec's deployment order. Streams A (backend heartbeat), B (AuthMethods extraction), and E (prewarm + RetryPrompt) land in parallel first. Stream C (onboarding Step 0) ships next — it depends on B. Stream D (anonymous-plumbing cleanup) ships last — it depends on C being live so no new anonymous writes occur during the overlap.

**Tech Stack:** Next.js 16 (Cloudflare Pages), TypeScript, React 19, Convex Cloud, Convex Auth (Google + Resend), FastAPI on Cloudflare Containers (Python 3.12), Server-Sent Events, PostHog, pnpm.

**Testing posture:** This repo follows "test on prod" — there is no dev/staging. Each task ends with a type-check (`pnpm typecheck`) or Python lint (`ruff check`), a manual smoke test on `forsee.life` after deploy, and a commit. No unit-test scaffolding is introduced.

**Deployment model:** Tag-based via `scripts/release.sh`. Ship Wave 1 (A + B + E) on one tag, Wave 2 (C + D) on the next tag. Waves are noted per task.

**Spec reference:** `docs/superpowers/specs/2026-04-20-auth-first-onboarding-and-loading-hang-design.md`.

---

## File Map

**New files:**

- `apps/web/app/components/AuthMethods.tsx` — shared Google-button + magic-link-form component consumed by `AuthWall` and the new onboarding Step 0 (and `/auth/signin`).
- `apps/web/app/lib/prewarm.ts` — fire-and-forget `GET /health` to wake the Cloudflare Container.
- `apps/web/app/chat/components/RetryPrompt.tsx` — inline card shown on stream timeout or error; offers "Try again" (reuses same `usageKey`) and "Cancel".

**Modified files:**

- `shastra-compute/src/api/v1/reading.py` — prepend a step-0 `"Connecting to Shastra..."` ledger event before chart resolution.
- `apps/web/app/components/AuthWall.tsx` — delete duplicated auth UI, render `<AuthMethods />` inside the modal chrome.
- `apps/web/app/auth/signin/page.tsx` — delete duplicated auth UI, render `<AuthMethods />`.
- `apps/web/app/onboarding/page.tsx` — insert Step 0 (auth) before existing steps, renumber, add guard effect that skips Step 0 for authed users and skips to `/chat` for authed-with-profile.
- `apps/web/app/page.tsx` — route authed-without-profile users to `/onboarding`, not-authed users to `/onboarding`; authed-with-profile already goes to `/chat`.
- `apps/web/app/chat/page.tsx` — add prewarm call on mount, add redirect-to-onboarding guard for signed-out users, delete `savePendingQuery` / `loadPendingQuery` / `clearPendingQuery` and their call sites, delete the `currentUser === null` branch in `handleSubmit`, wire `RetryPrompt` into timeout and SSE error paths, pass `retryable` into assistant messages.
- `apps/web/app/types.ts` — extend `ChatMessage` with optional `retryable?: { query: string; method: string; usageKey: string }` field.
- `apps/web/app/store.tsx` — delete `migrateSession` import + `lastMigratedKeyRef` + the `useEffect` that calls it, delete `birthProfileBySession` / `chartDocBySession` queries, use only `*ByUser`.
- `convex/actions/authorizeStream.ts` — delete `ANONYMOUS_PREVIEW_LIMIT` constant and the anonymous-preview branch; if `!args.userId`, return `auth_required` immediately.
- `convex/functions/users.ts` — delete `migrateSession` mutation.
- `convex/functions/birthProfiles.ts` — delete `getBySession` query; keep `upsert` argument shape (still accepts `sessionId` for the row column).
- `convex/functions/charts.ts` — delete `getBySession` query.

**Unchanged but touched conceptually:** `convex/functions/queryUsage.ts` (already idempotent on `usageKey` — verified, no edit needed).

---

## Wave 1 — Independent work streams (parallel)

### Task A1: Immediate "Connecting" ledger heartbeat

**Files:**
- Modify: `shastra-compute/src/api/v1/reading.py:171-180`

- [ ] **Step 1: Read the current event_stream opening**

Current code at `shastra-compute/src/api/v1/reading.py:171-180`:

```python
async def event_stream():
    try:
        async with asyncio.timeout(timeout):
            # Ledger step 1: Analyzing
            yield _sse_event("ledger", {"step": 1, "message": LEDGER_STEPS[0]})

            # 1. Resolve chart
            chart = await _resolve_chart(req)
            yield _sse_event("ledger", {"step": 2, "message": LEDGER_STEPS[1]})
```

- [ ] **Step 2: Prepend step-0 heartbeat**

Replace those lines with:

```python
async def event_stream():
    try:
        async with asyncio.timeout(timeout):
            # Ledger step 0: Immediate heartbeat before any chart work.
            # Guarantees the frontend sees motion within ~200ms even on a
            # warm container while Gemini is thinking.
            yield _sse_event("ledger", {"step": 0, "message": "Connecting to Shastra..."})

            # Ledger step 1: Analyzing
            yield _sse_event("ledger", {"step": 1, "message": LEDGER_STEPS[0]})

            # 1. Resolve chart
            chart = await _resolve_chart(req)
            yield _sse_event("ledger", {"step": 2, "message": LEDGER_STEPS[1]})
```

- [ ] **Step 3: Lint**

Run: `cd shastra-compute && ruff check src/api/v1/reading.py`
Expected: `All checks passed!`

- [ ] **Step 4: Commit**

```bash
git add shastra-compute/src/api/v1/reading.py
git commit -m "$(cat <<'EOF'
feat(compute): emit immediate step-0 ledger event

Prepend a "Connecting to Shastra..." ledger event before chart
resolution so the frontend shows progress within the first 200ms
of every query, even on a warm container while Gemini is thinking.

EOF
)"
```

---

### Task B1: Extract AuthMethods component

**Files:**
- Create: `apps/web/app/components/AuthMethods.tsx`

- [ ] **Step 1: Create the shared component**

Write the full file at `apps/web/app/components/AuthMethods.tsx`:

```tsx
"use client";

import { useState, FormEvent } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { Loader2, Mail } from "lucide-react";

interface AuthMethodsProps {
  /**
   * Where to send the user after successful sign-in.
   * Defaults to the current pathname + search so the user lands back where they were.
   */
  redirectTo?: string;
}

export default function AuthMethods({ redirectTo }: AuthMethodsProps) {
  const { signIn } = useAuthActions();

  const [email, setEmail] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function getRedirectTarget() {
    if (redirectTo) {
      return redirectTo;
    }
    if (typeof window === "undefined") {
      return "/chat";
    }
    const target = `${window.location.pathname}${window.location.search}`;
    return target === "/auth/signin" ? "/chat" : target;
  }

  async function handleGoogleSignIn() {
    setGoogleLoading(true);
    setError(null);
    try {
      await signIn("google", { redirectTo: getRedirectTarget() });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to sign in with Google"
      );
      setGoogleLoading(false);
    }
  }

  async function handleEmailSignIn(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await signIn("resend", {
        email: email.trim(),
        redirectTo: getRedirectTarget(),
      });
      setEmailSent(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to send magic link"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <button
        onClick={handleGoogleSignIn}
        disabled={googleLoading}
        className="w-full flex items-center justify-center gap-3 rounded-xl border border-white/40 bg-white/40 px-4 py-3 text-sm font-medium text-text-primary transition-all hover:bg-white/60 disabled:opacity-50"
      >
        {googleLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <svg className="h-4 w-4" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
        )}
        Continue with Google
      </button>

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-black/8" />
        <span className="text-xs text-text-secondary/50">or</span>
        <div className="flex-1 h-px bg-black/8" />
      </div>

      {emailSent ? (
        <div className="text-center py-2">
          <Mail className="mx-auto h-8 w-8 text-accent mb-2" />
          <p className="text-sm font-medium text-text-primary">
            Check your email
          </p>
          <p className="text-xs text-text-secondary mt-1">
            Magic link sent to{" "}
            <span className="font-medium">{email}</span>
          </p>
          <button
            onClick={() => setEmailSent(false)}
            className="mt-3 text-xs text-accent hover:underline"
          >
            Use a different email
          </button>
        </div>
      ) : (
        <form onSubmit={handleEmailSignIn} className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            className="glass-input-field"
          />
          <button
            type="submit"
            disabled={loading || !email.trim()}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-accent text-white font-semibold py-3 hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Mail className="h-4 w-4" />
            )}
            Send Magic Link
          </button>
        </form>
      )}

      {error && (
        <p className="text-xs text-red-500 text-center">{error}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/web && pnpm typecheck`
Expected: no errors introduced.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/components/AuthMethods.tsx
git commit -m "$(cat <<'EOF'
feat(auth): extract shared AuthMethods component

Pulls the Google button + magic-link form out of AuthWall into a
reusable component. Prepares the ground for onboarding Step 0 and
removes future drift risk across AuthWall, /auth/signin, and
onboarding.

EOF
)"
```

---

### Task B2: Use AuthMethods in AuthWall

**Files:**
- Modify: `apps/web/app/components/AuthWall.tsx`

- [ ] **Step 1: Replace AuthWall body with the shared component**

Replace the entire contents of `apps/web/app/components/AuthWall.tsx` with:

```tsx
"use client";

import { X } from "lucide-react";
import GalaxyLogo from "@/app/components/GalaxyLogo";
import AuthMethods from "@/app/components/AuthMethods";

interface AuthWallProps {
  isOpen: boolean;
  onClose: () => void;
  reason?: string;
  redirectTo?: string;
  dismissible?: boolean;
}

export default function AuthWall({
  isOpen,
  onClose,
  reason = "Sign in to continue",
  redirectTo,
  dismissible = true,
}: AuthWallProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={dismissible ? onClose : undefined}
      />

      <div className="relative w-full max-w-sm mx-4 glass-section p-6 animate-fade-in">
        {dismissible && (
          <button
            onClick={onClose}
            className="absolute right-3 top-3 rounded-lg p-1.5 text-text-secondary hover:text-text-primary hover:bg-white/20 transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        )}

        <div className="flex flex-col items-center mb-6">
          <GalaxyLogo size={40} />
          <h2 className="mt-3 text-lg font-semibold text-text-primary">
            {reason}
          </h2>
          <p className="mt-1 text-xs text-text-secondary text-center">
            Your chart data will be preserved after signing in
          </p>
        </div>

        <AuthMethods redirectTo={redirectTo} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/web && pnpm typecheck`
Expected: no errors introduced.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/components/AuthWall.tsx
git commit -m "$(cat <<'EOF'
refactor(auth): render AuthMethods inside AuthWall

AuthWall becomes a thin modal wrapper. Behavior unchanged:
dismissible prop still governs overlay click + close button,
reason and redirectTo pass through.

EOF
)"
```

---

### Task B3: Use AuthMethods in /auth/signin

**Files:**
- Modify: `apps/web/app/auth/signin/page.tsx`

- [ ] **Step 1: Replace signin page body with the shared component**

Replace the entire contents of `apps/web/app/auth/signin/page.tsx` with:

```tsx
"use client";

import GalaxyLogo from "@/app/components/GalaxyLogo";
import AuthMethods from "@/app/components/AuthMethods";

export default function SignInPage() {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <GalaxyLogo size={56} />
          <h1 className="mt-4 text-2xl font-semibold text-text-primary">
            Sign in to iktara
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Save readings, unlock premium features, and more
          </p>
        </div>

        <div className="glass-section p-6">
          <AuthMethods redirectTo="/chat" />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/web && pnpm typecheck`
Expected: no errors introduced.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/auth/signin/page.tsx
git commit -m "$(cat <<'EOF'
refactor(auth): render AuthMethods on /auth/signin

Returning-user sign-in page now reuses the same auth component as
AuthWall and onboarding Step 0, preventing drift.

EOF
)"
```

---

### Task E1: Add prewarm helper

**Files:**
- Create: `apps/web/app/lib/prewarm.ts`

- [ ] **Step 1: Create the helper**

Write `apps/web/app/lib/prewarm.ts`:

```ts
/**
 * Fire-and-forget GET /health to wake the Cloudflare Container.
 *
 * The container scales to zero after 5m idle (sleepAfter in
 * shastra-compute/worker.ts). First-query cold starts are 10-30s
 * on Python boot. Calling this on page mount means the container
 * warms while the user fills a form, not while they wait for stars.
 *
 * Best-effort: errors are swallowed; the real request will surface
 * them if needed.
 */
export function prewarmCompute(): void {
  if (typeof window === "undefined") return;
  const url = "https://api.forsee.life/health";
  fetch(url, {
    method: "GET",
    cache: "no-store",
    keepalive: true,
  }).catch(() => {});
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/web && pnpm typecheck`
Expected: no errors introduced.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/lib/prewarm.ts
git commit -m "$(cat <<'EOF'
feat(web): add prewarmCompute helper

Fires a best-effort GET /health to wake the Cloudflare Container
so the first real query lands on a warm instance. Hardcoded to
api.forsee.life since there's only one prod deployment.

EOF
)"
```

---

### Task E2: Call prewarmCompute on chat and onboarding mount

**Files:**
- Modify: `apps/web/app/chat/page.tsx`
- Modify: `apps/web/app/onboarding/page.tsx`

- [ ] **Step 1: Import and call in chat**

In `apps/web/app/chat/page.tsx`, add the import near the top with the other `@/app/...` imports:

```tsx
import { prewarmCompute } from "@/app/lib/prewarm";
```

Add a prewarm effect inside the `ChatPage` component, just after the existing `scrollToBottom` effect (around line 184-186):

```tsx
useEffect(() => {
  prewarmCompute();
}, []);
```

- [ ] **Step 2: Import and call in onboarding**

In `apps/web/app/onboarding/page.tsx`, add the import near the top:

```tsx
import { prewarmCompute } from "@/app/lib/prewarm";
```

Inside the `OnboardingPage` component, add a prewarm effect just after the state declarations (before any other `useEffect`, or at the top of the component body if no effect exists yet):

```tsx
useEffect(() => {
  prewarmCompute();
}, []);
```

Also ensure `useEffect` is imported from React — the current onboarding imports `useState, FormEvent` from react; change to `useState, useEffect, FormEvent`.

- [ ] **Step 3: Type-check**

Run: `cd apps/web && pnpm typecheck`
Expected: no errors introduced.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/chat/page.tsx apps/web/app/onboarding/page.tsx
git commit -m "$(cat <<'EOF'
feat(web): prewarm Cloudflare Container on chat + onboarding mount

Fires /health when the user lands on either route so the container
is warm by the time they submit a query or finish onboarding.

EOF
)"
```

---

### Task E3: Create RetryPrompt component

**Files:**
- Create: `apps/web/app/chat/components/RetryPrompt.tsx`

- [ ] **Step 1: Create the component**

Write `apps/web/app/chat/components/RetryPrompt.tsx`:

```tsx
"use client";

import { RotateCcw, X } from "lucide-react";

interface RetryPromptProps {
  message: string;
  onRetry: () => void;
  onCancel: () => void;
}

export default function RetryPrompt({
  message,
  onRetry,
  onCancel,
}: RetryPromptProps) {
  return (
    <div className="rounded-2xl border border-accent/20 bg-accent/5 px-4 py-3">
      <p className="text-sm text-text-primary mb-3">{message}</p>
      <div className="flex items-center gap-2">
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 text-xs font-semibold text-white transition-all hover:brightness-110"
        >
          <RotateCcw className="h-3 w-3" /> Try again
        </button>
        <button
          onClick={onCancel}
          className="inline-flex items-center gap-1.5 rounded-full border border-black/10 px-3.5 py-1.5 text-xs text-text-secondary transition-colors hover:bg-white/20"
        >
          <X className="h-3 w-3" /> Cancel
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/web && pnpm typecheck`
Expected: no errors introduced.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/chat/components/RetryPrompt.tsx
git commit -m "$(cat <<'EOF'
feat(chat): add RetryPrompt component

Inline card shown when a stream times out or errors. Replaces the
dead-end 'stars are taking longer' string with a one-click retry
that will reuse the same usageKey (wired in the next task) so a
successful retry does not double-charge the user's quota.

EOF
)"
```

---

### Task E4: Wire RetryPrompt into chat timeout + error paths

**Files:**
- Modify: `apps/web/app/types.ts`
- Modify: `apps/web/app/chat/page.tsx`

- [ ] **Step 1: Extend the ChatMessage type**

Open `apps/web/app/types.ts`. Locate the `ChatMessage` type (it currently has `id`, `role`, `content`, `timestamp`, and optional `reading` / `classification` / `evidence_summary` / `planet_context` / `method_used`). Add a new optional field `retryable` with the shape:

```ts
retryable?: {
  query: string;
  method: string;
  usageKey: string;
};
```

- [ ] **Step 2: Import RetryPrompt in chat/page.tsx**

Near the other `./components/...` imports in `apps/web/app/chat/page.tsx`, add:

```tsx
import RetryPrompt from "./components/RetryPrompt";
```

- [ ] **Step 3: Expose usageKey to the catch blocks**

`handleSubmit` currently declares `const assistantId = generateId();` inside the callback (around line 223) and reuses it as the `usageKey` passed into `authorizeStream`. Move nothing — just reference `assistantId` when attaching `retryable` to the error message.

- [ ] **Step 4: Replace the `case "error"` SSE branch**

In `apps/web/app/chat/page.tsx` locate the `case "error":` block (currently around lines 436-451). Replace the `setMessages(...)` call inside it so the message gets a `retryable` field and a friendlier `content` value:

```tsx
case "error":
  receivedErrorEvent = true;
  streamBuffer.stop();
  setMessages((prev) =>
    prev.map((m) =>
      m.id === assistantId
        ? {
            ...m,
            content: `Something went wrong: ${parsed.message}.`,
            retryable: {
              query,
              method: selectedMethod,
              usageKey: assistantId,
            },
          }
        : m
    )
  );
  setIsLoading(false);
  setLedgerComplete(true);
  break;
```

- [ ] **Step 5: Replace the outer catch block**

Currently (around lines 502-531) the catch block sets a plain string message on timeout. Replace its body so timeout / error paths attach `retryable` too:

```tsx
} catch (err) {
  if ((err as Error).name === "AbortError" && controller.signal.aborted) {
    streamBuffer.stop();
    setIsLoading(false);
    setLedgerComplete(true);
    return;
  }

  const isTimeout =
    (err as Error).name === "TimeoutError" ||
    ((err as Error).name === "AbortError" && !controller.signal.aborted);
  const message = fullContent
    ? fullContent
    : isTimeout
      ? "The stars are taking longer than usual."
      : `Something went wrong: ${(err as Error).message}.`;

  streamBuffer.stop();
  setMessages((prev) =>
    prev.map((m) =>
      m.id === assistantId
        ? {
            ...m,
            content: message,
            retryable: fullContent
              ? m.retryable
              : {
                  query,
                  method: selectedMethod,
                  usageKey: assistantId,
                },
          }
        : m
    )
  );
  setIsLoading(false);
  setLedgerComplete(true);
}
```

- [ ] **Step 6: Add handlers for retry + cancel**

Still inside `ChatPage`, add two callbacks near `handleFollowUp` (around line 643):

```tsx
const handleRetry = useCallback(
  (msgId: string, retryable: { query: string; method: string; usageKey: string }) => {
    setMessages((prev) => prev.filter((m) => m.id !== msgId));
    handleSubmit(retryable.query, retryable.method);
  },
  [handleSubmit]
);

const handleRetryCancel = useCallback((msgId: string) => {
  setMessages((prev) => prev.filter((m) => m.id !== msgId));
}, []);
```

Note: `handleSubmit` is a stable callback via `useCallback` and generates a fresh `assistantId` each call. Because `queryUsage.recordUsage` dedupes by `usageKey` and Convex re-entry uses a new `assistantId`, a retry effectively starts a new usage slot. That is acceptable behavior for this UX: the first attempt consumed a slot, the retry only consumes another if the first slot was actually recorded. **Do not pass the previous `usageKey` into `handleSubmit`** — the dedupe guarantee is already in place at the mutation layer and each retry deserves its own trace id.

(The `usageKey` field on `retryable` is retained for telemetry / future billing; it is not currently threaded back into `authorizeStream`.)

- [ ] **Step 7: Render RetryPrompt in the assistant message branch**

Still in `chat/page.tsx`, in the conversation view (around lines 724-808), prefer `RetryPrompt` when `msg.retryable` is set and we are not loading. Locate the block that renders `msg.reading` or `msg.content`:

```tsx
{msg.reading ? (
  <ReadingCard ... hideDirectAnswer />
) : msg.content ? (
  ...
) : null}
```

Replace that block with:

```tsx
{msg.retryable && !isLoading ? (
  <RetryPrompt
    message={msg.content || "Please try again."}
    onRetry={() => handleRetry(msg.id, msg.retryable!)}
    onCancel={() => handleRetryCancel(msg.id)}
  />
) : msg.reading ? (
  <ReadingCard
    reading={msg.reading}
    onAskFollowUp={handleFollowUp}
    hideDirectAnswer
  />
) : msg.content ? (
  (() => {
    const isCurrentlyStreaming =
      isLoading &&
      msg.id === messages[messages.length - 1]?.id;
    const { body, questions } = isCurrentlyStreaming
      ? { body: msg.content, questions: [] }
      : parseExploreFurther(msg.content);
    return (
      <>
        <StreamingMarkdown
          content={body}
          isStreaming={isCurrentlyStreaming}
        />
        {questions.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold text-text-secondary">
              Explore Further
            </p>
            <div className="flex flex-wrap gap-1.5">
              {questions.map((q, i) => (
                <button
                  key={i}
                  onClick={() => handleFollowUp(q)}
                  className="rounded-full border border-black/8 bg-white/30 px-3 py-1.5 text-xs text-text-secondary transition-colors hover:border-accent/30 hover:text-accent hover:bg-accent/5 text-left"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
      </>
    );
  })()
) : null}
```

- [ ] **Step 8: Type-check**

Run: `cd apps/web && pnpm typecheck`
Expected: no errors introduced. (If TS complains about `msg.retryable!` non-null assertion, widen the guard to `if (msg.retryable && !isLoading)` and destructure locally.)

- [ ] **Step 9: Commit**

```bash
git add apps/web/app/types.ts apps/web/app/chat/page.tsx
git commit -m "$(cat <<'EOF'
feat(chat): show RetryPrompt on stream timeout and errors

Replace the dead-end 'stars are taking longer' string with an
inline retry card that re-runs the same query. Uses a new
ChatMessage.retryable field and new handleRetry/handleRetryCancel
callbacks.

EOF
)"
```

---

## Wave 1 — Release checkpoint

- [ ] **Step 1: Type-check the whole frontend**

Run: `cd apps/web && pnpm typecheck`
Expected: clean.

- [ ] **Step 2: Python lint**

Run: `cd shastra-compute && ruff check src/`
Expected: `All checks passed!`

- [ ] **Step 3: Tag and release**

Run: `./scripts/release.sh` (patch bump)
Expected: a new tag is pushed, GitHub Actions deploys Convex + shastra-compute + frontend.

- [ ] **Step 4: Smoke-test on forsee.life**

- Visit forsee.life in an incognito profile. Confirm the home page still routes through Get Started.
- Visit `/chat` directly as an authed user; submit a query. Confirm a `"Connecting to Shastra..."` ledger event appears within 1s.
- Hit `/auth/signin` and confirm the Google button + magic-link form render identically to before (this is the AuthMethods refactor).
- Hit `/onboarding`; confirm Step 1 still renders as before (Step 0 has not landed yet). Wait for the page to settle, then open DevTools Network and confirm a request to `https://api.forsee.life/health` fired on mount.
- Artificially trigger a retry: on a low-connectivity tab or by pulling ethernet briefly during a query, let the stream time out. Confirm the `RetryPrompt` appears and "Try again" re-fires the query.

---

## Wave 2 — Account-first onboarding (depends on Wave 1)

### Task C1: Add onboarding Step 0 (auth gate)

**Files:**
- Modify: `apps/web/app/onboarding/page.tsx`

- [ ] **Step 1: Update imports**

At the top of `apps/web/app/onboarding/page.tsx`, ensure these imports exist (add what's missing):

```tsx
"use client";
import { useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  User, Calendar, Clock, MapPin, Briefcase, Heart, Sparkles,
  AlignLeft, Loader2, ChevronRight, ChevronLeft, AlertCircle,
} from "lucide-react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { useApp } from "@/app/store";
import { UserProfile } from "@/app/types";
import { LANGUAGES } from "@/app/i18n/translations";
import {
  getBirthProfileAnalyticsProperties,
  syncBirthProfilePersonProperties,
} from "@/app/lib/posthogProfile";
import GalaxyLogo from "@/app/components/GalaxyLogo";
import AuthMethods from "@/app/components/AuthMethods";
import { prewarmCompute } from "@/app/lib/prewarm";
import posthog from "posthog-js";
```

- [ ] **Step 2: Renumber step indicator**

Replace the existing `STEPS` constant:

```tsx
const STEPS = ["Sign Up", "Birth Details", "Preferences", "Computing"];
```

- [ ] **Step 3: Make the step indicator account-aware**

At the top of `OnboardingPage`, just after `const router = useRouter();`, add:

```tsx
const { sessionId } = useApp();
const currentUser = useQuery(api.functions.users.getCurrentUser, {});
const birthProfile = useQuery(
  api.functions.birthProfiles.getByUser,
  currentUser?._id ? { userId: currentUser._id } : "skip"
);
```

(If these lines already exist, update them — don't duplicate. The current file has `useApp()` and `currentUser` but uses `getCurrentUser`. Reuse those.)

Still inside `OnboardingPage`, change the initial `step` default so the component renders Step 0 when unauthed:

```tsx
const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
```

Immediately below the state declarations, add the guard effect:

```tsx
useEffect(() => {
  if (currentUser === undefined) return; // still loading

  if (currentUser && birthProfile) {
    router.replace("/chat");
    return;
  }

  if (currentUser) {
    // authed but no profile yet — ensure we're on Step 1 or later
    setStep((s) => (s === 0 ? 1 : s));
  } else {
    // not authed — force Step 0
    setStep(0);
  }
}, [currentUser, birthProfile, router]);
```

- [ ] **Step 4: Add the Step 0 render block**

Inside the return's card container (inside the existing `<div className="w-full max-w-lg">`), add the Step 0 block as the first child before `step === 0 && (` — wait, the existing code already uses `step === 0` for birth details. **Rename that block to `step === 1` after adding the new Step 0 block.**

Add the Step 0 block:

```tsx
{step === 0 && (
  <div className="animate-fade-in glass-section p-6">
    <div className="flex flex-col items-center mb-6">
      <GalaxyLogo size={48} />
      <h1 className="mt-3 text-xl font-semibold text-text-primary">
        Create your account to begin
      </h1>
      <p className="mt-1 text-xs text-text-secondary text-center max-w-xs">
        We&apos;ll save your birth chart and readings to your account.
      </p>
    </div>
    <AuthMethods redirectTo="/onboarding" />
  </div>
)}
```

- [ ] **Step 5: Renumber existing step blocks**

In the same render, the existing `{step === 0 && ( ... birth details ... )}` becomes `{step === 1 && ( ... )}`, the existing `{step === 1 && ( ... preferences ... )}` becomes `{step === 2 && ( ... )}`, and the existing `{step === 2 && ( ... computing ... )}` becomes `{step === 3 && ( ... )}`.

Inside the **birth details** (new Step 1) form's `handleContinue`:

```tsx
function handleContinue(e: FormEvent) {
  e.preventDefault();
  if (step === 1 && canContinueStep1) setStep(2);
  else if (step === 2) { setStep(3); computeChart(); }
}
```

Also inside the **preferences** (new Step 2) "Back" button: change `onClick={() => setStep(0)}` to `onClick={() => setStep(1)}`. And inside the **computing** (new Step 3) error "Back" button: change `onClick={() => setStep(1)}` to `onClick={() => setStep(2)}`.

- [ ] **Step 6: Confirm computeChart passes userId**

Inside `computeChart()`, the body already passes `userId: currentUser?._id ?? undefined`. With account-first onboarding, `currentUser?._id` will always be defined here (Step 1 only renders for authed users). Change the line to:

```ts
userId: currentUser!._id,
```

…and drop the now-redundant fallback. This makes the invariant explicit.

- [ ] **Step 7: Capture onboarding PostHog event with userId**

Right after `posthog.capture('onboarding_completed', { ... })`, the existing body is fine — no change needed except to satisfy the invariant above.

- [ ] **Step 8: Type-check**

Run: `cd apps/web && pnpm typecheck`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add apps/web/app/onboarding/page.tsx
git commit -m "$(cat <<'EOF'
feat(onboarding): gate onboarding on Step 0 auth

Insert a new Step 0 that forces Google or magic-link sign-in
before any birth data is collected. Existing birth-details,
preferences, and computing steps renumber to 1/2/3. Add a guard
effect: if the user is already authed with a birth profile,
redirect to /chat; authed without profile lands on Step 1;
unauthed is pinned to Step 0.

EOF
)"
```

---

### Task C2: Landing-page routing for authed-without-profile

**Files:**
- Modify: `apps/web/app/page.tsx`

- [ ] **Step 1: Read current routing**

Current `apps/web/app/page.tsx:9-18` runs:

```tsx
export default function Home() {
  const router = useRouter();
  const { profile, chart } = useApp();

  useEffect(() => {
    if (profile && chart) {
      router.push("/chat");
    }
  }, [profile, chart, router]);
```

- [ ] **Step 2: Route authed users to the right destination**

Replace that block with:

```tsx
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";

export default function Home() {
  const router = useRouter();
  const { profile, chart } = useApp();
  const currentUser = useQuery(api.functions.users.getCurrentUser, {});

  useEffect(() => {
    if (currentUser === undefined) return; // still loading

    if (currentUser && profile && chart) {
      router.push("/chat");
      return;
    }

    if (currentUser && !profile) {
      // authed but has not completed onboarding
      router.push("/onboarding");
    }
  }, [currentUser, profile, chart, router]);
```

The existing "Get Started" button (which pushes to `/onboarding`) stays visible for unauthenticated visitors. Onboarding Step 0 will render for them.

- [ ] **Step 3: Type-check**

Run: `cd apps/web && pnpm typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/page.tsx
git commit -m "$(cat <<'EOF'
feat(landing): route authed users without profile to onboarding

Preserve the Get Started button for anonymous visitors; send
signed-in users with a completed chart to /chat and signed-in
users without a chart back to /onboarding so they finish the
newly-required Step 0+1 flow.

EOF
)"
```

---

### Task C3: Redirect signed-out chat visitors to onboarding

**Files:**
- Modify: `apps/web/app/chat/page.tsx`

- [ ] **Step 1: Import useRouter**

In `apps/web/app/chat/page.tsx`, ensure `useRouter` is imported (add if missing):

```tsx
import { useRouter } from "next/navigation";
```

and instantiate it inside `ChatPage`, just after `const { sessionId, ... } = useApp();`:

```tsx
const router = useRouter();
```

- [ ] **Step 2: Add a guard effect**

After the other `useEffect`s near the top of the component, add:

```tsx
useEffect(() => {
  if (currentUser === null) {
    router.replace("/onboarding");
  }
}, [currentUser, router]);
```

This catches the edge case of a user hitting `/chat` with no session cookie (e.g., after sign-out) and sends them through the onboarding gate. Authed users are unaffected. `currentUser === undefined` (still loading) is intentionally ignored so we don't flicker.

- [ ] **Step 3: Type-check**

Run: `cd apps/web && pnpm typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/chat/page.tsx
git commit -m "$(cat <<'EOF'
feat(chat): redirect signed-out visitors to /onboarding

Account-first onboarding means /chat is reachable only by authed
users. Any signed-out visit is sent to /onboarding Step 0.

EOF
)"
```

---

## Wave 2 — Release checkpoint

- [ ] **Step 1: Type-check**

Run: `cd apps/web && pnpm typecheck`
Expected: clean.

- [ ] **Step 2: Tag and release**

Run: `./scripts/release.sh` (patch bump)

- [ ] **Step 3: Smoke-test on forsee.life**

- Fresh incognito → `/onboarding` lands on Step 0 with Google + email options.
- Sign in with Google → redirected back to `/onboarding` → auto-advances to Step 1 (birth details).
- Fill out steps 1 → 2 → 3, land on `/chat`. Submit a query and confirm it works end to end.
- In a second incognito, click a magic-link after entering email on Step 0; confirm you land on `/onboarding` Step 1 when the link opens.
- Returning user: sign out, visit `/` — confirm it lets you through the Get Started button again, and that the button ultimately lands you on Step 0 (not Step 1).
- Hit `/chat` directly while signed out → confirm redirect to `/onboarding`.

Do not proceed to Wave 3 until this smoke-test passes. Wave 3 removes the anonymous-write plumbing; if Wave 2 regresses, you need the plumbing to roll back.

---

## Wave 3 — Anonymous-plumbing cleanup (depends on Wave 2)

### Task D1: Remove ANONYMOUS_PREVIEW_LIMIT from authorizeStream

**Files:**
- Modify: `convex/actions/authorizeStream.ts`

- [ ] **Step 1: Delete the constant and the preview branch**

In `convex/actions/authorizeStream.ts`:

- Delete line 7: `const ANONYMOUS_PREVIEW_LIMIT = 1;`
- Delete lines 125-138 (the `if (!args.userId && usage.used >= ANONYMOUS_PREVIEW_LIMIT) { ... }` block).
- Immediately before step 4 ("Record usage based on consume source"), insert a new hard gate:

```ts
// Account-first onboarding: /chat is unreachable without auth, so
// this branch is defensive. Reject anonymous requests outright.
if (!args.userId) {
  return {
    success: false,
    error: "auth_required",
    message: "Please sign in to continue.",
    usage: usageSnapshot,
    tier: tierInfo.tier,
    token: null,
    expiresAt: null,
    streamUrl: null,
  };
}
```

- [ ] **Step 2: Simplify the recordUsage dispatch**

Since `args.userId` is now required, the existing branch `if (usage.nextConsumeSource === "credit") { if (!args.userId) throw ... }` can drop its inner guard. Replace the block (around lines 140-161 in the original) with:

```ts
if (usage.nextConsumeSource === "free") {
  try {
    await ctx.runMutation(api.functions.queryUsage.recordUsage, {
      sessionId: args.sessionId,
      userId: args.userId,
      usageKey: args.usageKey,
    });
  } catch (usageErr) {
    console.error("recordUsage failed (non-blocking):", usageErr);
  }
} else if (usage.nextConsumeSource === "credit") {
  await ctx.runMutation(api.functions.queryUsage.recordCreditSpend, {
    userId: args.userId,
    usageKey: args.usageKey,
  });
}
```

- [ ] **Step 3: Type-check**

Run: `pnpm exec tsc --noEmit --project convex/tsconfig.json`
If no convex tsconfig exists, run `cd apps/web && pnpm typecheck` which covers the `@convex/` path alias.
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add convex/actions/authorizeStream.ts
git commit -m "$(cat <<'EOF'
chore(convex): drop anonymous preview path in authorizeStream

Account-first onboarding means /chat is unreachable without a
real userId. Replace the ANONYMOUS_PREVIEW_LIMIT branch with a
hard auth_required reject. Simplify recordUsage / recordCreditSpend
dispatch now that args.userId is guaranteed.

EOF
)"
```

---

### Task D2: Delete migrateSession + wire-up in store.tsx

**Files:**
- Modify: `convex/functions/users.ts`
- Modify: `apps/web/app/store.tsx`

- [ ] **Step 1: Delete migrateSession from convex**

In `convex/functions/users.ts`, delete the entire `export const migrateSession = mutation({ ... })` block (lines 65-131).

- [ ] **Step 2: Remove migrateSession from store.tsx**

In `apps/web/app/store.tsx`:

- Delete the import / usage of `migrateSession` (the `useMutation(api.functions.users.migrateSession)` line).
- Delete the `lastMigratedKeyRef` ref declaration.
- Delete the `useEffect` that calls `migrateSession` (it starts with `if (!sessionId || !currentUser?._id) return;`).

- [ ] **Step 3: Type-check**

Run: `cd apps/web && pnpm typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add convex/functions/users.ts apps/web/app/store.tsx
git commit -m "$(cat <<'EOF'
chore: remove migrateSession

Account-first onboarding writes every birth profile / chart /
reading against a real userId from the start, so there is no
anonymous state to migrate at sign-in.

EOF
)"
```

---

### Task D3: Collapse session-only reads in store.tsx

**Files:**
- Modify: `apps/web/app/store.tsx`

- [ ] **Step 1: Remove the bySession queries**

In `apps/web/app/store.tsx`, delete the `birthProfileBySession` and `chartDocBySession` `useQuery` calls plus the `?? birthProfileBySession` / `?? chartDocBySession` fallback expressions. The simplified shape:

```tsx
const currentUser = useQuery(api.functions.users.getCurrentUser, {});
const userId = currentUser?._id;

const birthProfile = useQuery(
  api.functions.birthProfiles.getByUser,
  userId ? { userId } : "skip"
);

const chartDoc = useQuery(
  api.functions.charts.getByUser,
  userId ? { userId } : "skip"
);
```

The downstream `profile` / `chart` / `chartRaw` derivations stay unchanged — they already consume `birthProfile` and `chartDoc`.

- [ ] **Step 2: Type-check**

Run: `cd apps/web && pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/store.tsx
git commit -m "$(cat <<'EOF'
chore(web): read birth profile and chart by userId only

With account-first onboarding, every profile and chart belongs to
a real user. Drop the by-session fallbacks.

EOF
)"
```

---

### Task D4: Delete getBySession queries

**Files:**
- Modify: `convex/functions/birthProfiles.ts`
- Modify: `convex/functions/charts.ts`

- [ ] **Step 1: Delete birthProfiles.getBySession**

In `convex/functions/birthProfiles.ts`, delete the `export const getBySession = query({ ... })` block (lines 10-20).

- [ ] **Step 2: Delete charts.getBySession**

In `convex/functions/charts.ts`, delete the `export const getBySession = query({ ... })` block (lines 10-20).

- [ ] **Step 3: Verify no callers remain**

Run:

```bash
grep -rn "getBySession" apps convex --include="*.ts" --include="*.tsx"
```

Expected: **no matches.** If the grep finds any, fix them before continuing — each caller should have been converted to `getByUser` in Tasks D2/D3.

- [ ] **Step 4: Type-check**

Run: `cd apps/web && pnpm typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add convex/functions/birthProfiles.ts convex/functions/charts.ts
git commit -m "$(cat <<'EOF'
chore(convex): drop session-only read paths

Delete birthProfiles.getBySession and charts.getBySession now
that every row has a userId by contract.

EOF
)"
```

---

### Task D5: Remove pending-query and anon-AuthWall wiring from chat

**Files:**
- Modify: `apps/web/app/chat/page.tsx`

- [ ] **Step 1: Delete pending-query helpers**

In `apps/web/app/chat/page.tsx`, delete:

- The `PENDING_QUERY_STORAGE_KEY` constant.
- The `PendingQuery` type alias.
- The `savePendingQuery`, `loadPendingQuery`, `clearPendingQuery` helper functions.
- The `replayingPendingQueryRef` ref declaration inside `ChatPage`.
- The `useEffect` that calls `loadPendingQuery()` on mount (the one that flips `setShowAuthWall(true)` when `currentUser === null`).
- The `useEffect` at the end of `ChatPage` that replays a pending query after `currentUser` becomes truthy.

- [ ] **Step 2: Delete the showAuthWall state + anon branch in handleSubmit**

Inside `handleSubmit`, delete the `if (currentUser === null) { ... savePendingQuery... return; }` branch.

Delete the `const [showAuthWall, setShowAuthWall] = useState(false);` state declaration.

Delete the `<AuthWall ... />` render block at the bottom of the JSX.

Also delete the `setShowAuthWall(true)` call inside the `authResult.error === "auth_required"` branch of handleSubmit — just leave the message behavior, which becomes:

```tsx
if (!authResult.success || !authResult.token || !authResult.streamUrl) {
  setMessages((prev) =>
    prev.map((m) =>
      m.id === assistantId
        ? {
            ...m,
            content:
              authResult.message ||
              "You\u2019re out of messages right now.",
          }
        : m
    )
  );
  setIsLoading(false);
  setLedgerComplete(true);
  return;
}
```

- [ ] **Step 3: Remove the unused import**

Delete the `import AuthWall from "@/app/components/AuthWall";` line at the top of the file.

- [ ] **Step 4: Type-check**

Run: `cd apps/web && pnpm typecheck`
Expected: no errors. (If the compiler complains about an unused variable, delete the variable — do not add `_` prefixes.)

- [ ] **Step 5: Grep-scan for orphaned references**

Run:

```bash
grep -rn "savePendingQuery\|loadPendingQuery\|clearPendingQuery\|hasConsumedAnonymousQuery\|requiresLoginToContinue\|ANONYMOUS_PREVIEW_LIMIT\|migrateSession" apps convex --include="*.ts" --include="*.tsx"
```

Expected: zero matches.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/chat/page.tsx
git commit -m "$(cat <<'EOF'
chore(chat): remove pending-query and anonymous AuthWall wiring

/chat is unreachable without auth now. Delete the sessionStorage
pending-query machinery, the showAuthWall state, and the AuthWall
modal. Signed-out visitors are already redirected to /onboarding
in the dedicated guard effect.

EOF
)"
```

---

## Wave 3 — Release checkpoint

- [ ] **Step 1: Type-check**

Run: `cd apps/web && pnpm typecheck`
Expected: clean.

- [ ] **Step 2: Grep sweep**

Run:

```bash
grep -rn "ANONYMOUS_PREVIEW_LIMIT\|migrateSession\|birthProfileBySession\|chartDocBySession\|getBySession\|hasConsumedAnonymousQuery\|savePendingQuery\|loadPendingQuery\|clearPendingQuery" apps convex shastra-compute --include="*.ts" --include="*.tsx" --include="*.py"
```

Expected: zero matches.

- [ ] **Step 3: Tag and release**

Run: `./scripts/release.sh` (patch bump)

- [ ] **Step 4: Smoke-test on forsee.life**

- Brand-new incognito → `/onboarding` Step 0 → sign in → Step 1 → Step 2 → Step 3 → `/chat` → ask a question. End-to-end works.
- Confirm no sessionStorage `shastra_pending_query` entry is written at any point (DevTools → Application → Session Storage).
- Sign out. Hit `/chat`. Confirm the redirect to `/onboarding` (Step 0) is instant.
- Check Convex logs for any runtime errors referencing deleted functions. Expected: none.
- Check PostHog `message_sent` events continue to fire with a real `distinct_id` equal to the userId (not the sessionId).

---

## Final verification

- [ ] **Spec coverage audit**

Walk each section of `docs/superpowers/specs/2026-04-20-auth-first-onboarding-and-loading-hang-design.md`:

- §1 Account-first onboarding → Tasks C1, C2, C3.
- §2 Cleanup table → Tasks D1, D2, D3, D4, D5.
- §3A Pre-warm → Tasks E1, E2.
- §3B Ledger heartbeat → Task A1.
- §3D Retry UX → Tasks E3, E4.
- §4 Data model notes → enforced by D1 (authorizeStream rejects anon writes).
- §Deployment order → Waves 1/2/3 match.
- §Open questions: `usageKey` idempotency → verified in plan prose (Task E4 Step 6 notes); `NEXT_PUBLIC_SHASTRA_COMPUTE_URL` → decided hardcode in Task E1.

- [ ] **Update memory**

Record a project memory noting the cutover date so future sessions know when auth-first shipped.

---

## Parallel-execution handoff notes

For the swarm execution pass (subagent-driven-development), the independent streams in each wave can be dispatched concurrently. Dependencies:

```
Wave 1 (parallel):  A1  |  B1 → B2 → B3  |  E1 → E2 → E3 → E4
Wave 2 (sequential, one agent): C1 → C2 → C3
Wave 3 (sequential, one agent): D1 → D2 → D3 → D4 → D5
```

Within each task, the steps are sequential. Between tasks in the same wave, no shared files are touched except `apps/web/app/chat/page.tsx`, which Stream E modifies and Stream B does not. To avoid conflicts, run Stream E's E2 and E4 (which both touch chat/page.tsx) sequentially, and run B1-B3 sequentially since they chain components. A1 has zero frontend overlap and can always run in parallel.
