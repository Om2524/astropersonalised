/**
 * Cloudflare Worker entrypoint for Shastra Compute.
 *
 * Routes all incoming HTTP requests to a Cloudflare Container running
 * the FastAPI application.
 */
import { Container, getContainer } from "@cloudflare/containers";

export class ShastraCompute extends Container {
  defaultPort = 8000;
  sleepAfter = "5m";

  override onStart() {
    console.log("[container] started, port 8000 ready");
  }

  override onStop(stopParams: { exitCode: number; reason: string }) {
    console.log(
      `[container] stopped: exit=${stopParams.exitCode} reason=${stopParams.reason}`
    );
  }

  override onError(error: string) {
    console.error("[container] error:", error);
  }

  /**
   * Override fetch to use explicit startAndWaitForPorts with a longer timeout.
   * Python cold start (numpy, pyswisseph, timezonefinder) needs more than the default 8s.
   */
  override async fetch(request: Request): Promise<Response> {
    // Log container running state before attempting start
    console.log(`[container] running=${this.ctx.container.running}`);

    try {
      // Explicitly start with internet enabled and longer timeout
      await this.startAndWaitForPorts({
        ports: 8000,
        startOptions: {
          enableInternet: true,
        },
        cancellationOptions: {
          instanceGetTimeoutMS: 60_000,
          portReadyTimeoutMS: 120_000,
          waitInterval: 1000,
        },
      });
      console.log("[container] startAndWaitForPorts succeeded");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[container] startAndWaitForPorts failed:", msg);
      return new Response(`Container startup failed: ${msg}`, { status: 503 });
    }

    // Forward request to the running container
    const url = new URL(request.url);
    url.hostname = "10.0.0.1";
    url.port = "8000";
    url.protocol = "http:";

    const containerReq = new Request(url.toString(), request);
    return fetch(containerReq);
  }
}

interface Env {
  SHASTRA_COMPUTE: DurableObjectNamespace<ShastraCompute>;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(request),
      });
    }

    const instanceId = String(Math.floor(Math.random() * 5));
    const container = getContainer(env.SHASTRA_COMPUTE, instanceId);

    try {
      const response = await container.fetch(request);
      const newResponse = new Response(response.body, response);
      const cors = corsHeaders(request);
      for (const [key, value] of Object.entries(cors)) {
        newResponse.headers.set(key, value);
      }
      return newResponse;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[worker] container.fetch error:", msg);
      return new Response(`Error: ${msg}`, {
        status: 502,
        headers: corsHeaders(request),
      });
    }
  },
};

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("Origin") ?? "";
  const allowedOrigins = [
    "https://forsee.life",
    "https://www.forsee.life",
    "http://localhost:3000",
  ];

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
