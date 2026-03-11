/**
 * Cloudflare Worker entrypoint for Shastra Compute.
 *
 * Routes all incoming HTTP requests to a Cloudflare Container running
 * the FastAPI application. Containers scale to zero after 30 seconds
 * of inactivity and scale up to 10 instances under load.
 *
 * Traffic is distributed across container instances using random
 * selection from the Durable Object namespace.
 */
import { Container } from "cloudflare:container";

export class ShastraCompute extends Container {
  /** Port the FastAPI uvicorn server listens on inside the container. */
  defaultPort = 8000;

  /** Scale to zero after 30 seconds of no requests. */
  sleepAfter = "30s";

  override onStart(): void {
    console.log("[shastra-compute] Container started");
  }

  override onStop(): void {
    console.log("[shastra-compute] Container stopped");
  }
}

interface Env {
  SHASTRA_COMPUTE: DurableObjectNamespace;
}

/**
 * Get a random container instance from the Durable Object namespace.
 *
 * Distributes load across up to `maxInstances` container instances
 * using random selection. Each instance ID maps to a separate
 * container that can independently scale to zero.
 */
async function getRandomInstance(
  ns: DurableObjectNamespace,
  maxInstances: number,
): Promise<DurableObjectStub> {
  const instanceId = Math.floor(Math.random() * maxInstances);
  const id = ns.idFromName(String(instanceId));
  return ns.get(id);
}

export default {
  /**
   * Route all requests to a container instance.
   *
   * CORS headers are added for the forsee.life frontend domain
   * and localhost for development.
   */
  async fetch(request: Request, env: Env): Promise<Response> {
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(request),
      });
    }

    const container = await getRandomInstance(env.SHASTRA_COMPUTE, 10);
    const response = await container.fetch(request);

    // Clone response to add CORS headers
    const newResponse = new Response(response.body, response);
    const cors = corsHeaders(request);
    for (const [key, value] of Object.entries(cors)) {
      newResponse.headers.set(key, value);
    }

    return newResponse;
  },
};

/**
 * Generate CORS headers based on the request origin.
 *
 * Allows:
 * - forsee.life and subdomains (production)
 * - localhost:3000 (development)
 * - Convex cloud deployments (Convex actions call the API)
 */
function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("Origin") ?? "";
  const allowedOrigins = [
    "https://forsee.life",
    "https://www.forsee.life",
    "http://localhost:3000",
  ];

  // Also allow Convex cloud origins (they call from actions)
  const isAllowed =
    allowedOrigins.includes(origin) ||
    origin.endsWith(".convex.cloud") ||
    origin.endsWith(".convex.site");

  return {
    "Access-Control-Allow-Origin": isAllowed ? origin : allowedOrigins[0],
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-API-Key",
    "Access-Control-Max-Age": "86400",
  };
}
