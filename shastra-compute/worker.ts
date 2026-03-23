/**
 * Cloudflare Worker entrypoint for Shastra Compute.
 *
 * Routes all incoming HTTP requests to a Cloudflare Container running
 * the FastAPI application. Worker secrets (API_KEY, GEMINI_API_KEY,
 * STREAM_TOKEN_SECRET) are passed to the container as env vars on start.
 */
import { Container, getContainer } from "@cloudflare/containers";

interface Env {
  SHASTRA_COMPUTE: DurableObjectNamespace<ShastraCompute>;
  API_KEY: string;
  GEMINI_API_KEY: string;
  STREAM_TOKEN_SECRET: string;
}

export class ShastraCompute extends Container<Env> {
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
   * Start the container with secrets passed as env vars, then proxy the request.
   */
  override async fetch(request: Request): Promise<Response> {
    try {
      await this.startAndWaitForPorts({
        ports: 8000,
        startOptions: {
          enableInternet: true,
          env: {
            API_KEY: this.env.API_KEY ?? "",
            GEMINI_API_KEY: this.env.GEMINI_API_KEY ?? "",
            STREAM_TOKEN_SECRET: this.env.STREAM_TOKEN_SECRET ?? "",
          },
        },
        cancellationOptions: {
          instanceGetTimeoutMS: 30_000,
          portReadyTimeoutMS: 60_000,
          waitInterval: 500,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[container] startup failed:", msg);
      return new Response(`Container startup failed: ${msg}`, { status: 503 });
    }

    // Proxy request to the running container
    const url = new URL(request.url);
    url.hostname = "10.0.0.1";
    url.port = "8000";
    url.protocol = "http:";

    return fetch(new Request(url.toString(), request));
  }
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
      console.error("[worker] error:", msg);
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
