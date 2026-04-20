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
