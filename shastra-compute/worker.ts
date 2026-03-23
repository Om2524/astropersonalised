/**
 * Cloudflare Worker entrypoint for Shastra Compute.
 *
 * Routes HTTP requests to a Cloudflare Container running FastAPI.
 * Worker secrets are passed to the container as env vars via the
 * Container class's envVars property.
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
  enableInternet = true;

  constructor(ctx: DurableObject["ctx"], env: Env) {
    super(ctx, env);
    // Pass Worker secrets to the container process as env vars
    this.envVars = {
      API_KEY: env.API_KEY ?? "",
      GEMINI_API_KEY: env.GEMINI_API_KEY ?? "",
      STREAM_TOKEN_SECRET: env.STREAM_TOKEN_SECRET ?? "",
    };
  }

  override onStart() {
    console.log("[container] started, port 8000 ready");
  }

  override onStop(stopParams: { exitCode: number; reason: string }) {
    console.log(`[container] stopped: exit=${stopParams.exitCode} reason=${stopParams.reason}`);
  }

  override onError(error: string) {
    console.error("[container] error:", error);
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
