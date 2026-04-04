"use node";
import { action, type ActionCtx } from "../_generated/server";
import { api } from "../_generated/api";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";

type PublicAction = ReturnType<typeof action>;
type AuthorizeStreamArgs = {
  sessionId: string;
  userId?: Id<"users">;
  usageKey: string;
  query: string;
  method: string;
};

type UsageSnapshot = {
  used: number;
  limit: number;
  remaining: number | null;
  resetsAt: number | null;
};

type AuthorizeStreamResult =
  | {
      success: false;
      error: string;
      message: string;
      usage: UsageSnapshot;
      tier: string;
      token: null;
      expiresAt: null;
      streamUrl: null;
    }
  | {
      success: true;
      token: string;
      expiresAt: number;
      streamUrl: string;
      usage: UsageSnapshot;
      tier: string;
      error: null;
      message: null;
    };

/**
 * Authorize a streaming reading connection.
 *
 * Convex actions cannot proxy SSE streams, so streaming readings use a
 * token-gated direct connection from the frontend to the Python API.
 *
 * Flow:
 * 1. Resolve the user's subscription tier
 * 2. Check message entitlement (free weekly allowance, credits, or Moksha)
 * 3. If not allowed: return error with usage info
 * 4. Record free usage or spend one paid credit
 * 5. Generate HMAC-SHA256 signed token with 60-second expiry
 * 6. Return token, expiry, stream URL, and usage stats
 *
 * The token payload is: { sessionId, userId?, queriedAt, exp }
 * Signed with STREAM_TOKEN_SECRET using Web Crypto API (HMAC-SHA256).
 *
 * Environment variables:
 * - STREAM_TOKEN_SECRET: HMAC signing key
 * - SHASTRA_COMPUTE_URL: Python API base URL (for stream URL construction)
 *
 * @param sessionId - The anonymous session UUID
 * @param userId - Optional authenticated user ID
 * @param query - The user's natural language question (for logging)
 * @param method - "vedic", "kp", "western", or "compare"
 * @returns Token, expiry, stream URL, and usage stats
 */
export const authorizeStream: PublicAction = action({
  args: {
    sessionId: v.string(),
    userId: v.optional(v.id("users")),
    usageKey: v.string(),
    query: v.string(),
    method: v.string(),
  },
  handler: async (
    ctx: ActionCtx,
    args: AuthorizeStreamArgs
  ): Promise<AuthorizeStreamResult> => {
    try {
      // 1. Resolve tier
      const tierInfo = await ctx.runQuery(
        api.functions.subscriptions.getCurrentTier,
        {
          sessionId: args.sessionId,
          userId: args.userId,
        }
      );

      // 2. Check message entitlement
      const usage = await ctx.runQuery(api.functions.queryUsage.checkLimit, {
        sessionId: args.sessionId,
        userId: args.userId,
        tier: tierInfo.tier,
      });

      // Record usage for analytics (no limits enforced) — fire and forget so
      // a transient mutation failure never blocks the stream from starting.
      ctx.runMutation(api.functions.queryUsage.recordUsage, {
        sessionId: args.sessionId,
        userId: args.userId,
        usageKey: args.usageKey,
      }).catch((err: unknown) => {
        console.error("recordUsage failed (non-blocking):", err);
      });

      // 5. Generate HMAC-SHA256 token
      const secret = process.env.STREAM_TOKEN_SECRET;
      const computeUrl = process.env.SHASTRA_COMPUTE_URL;

      if (!secret) {
        throw new Error("Missing STREAM_TOKEN_SECRET environment variable");
      }
      if (!computeUrl) {
        throw new Error("Missing SHASTRA_COMPUTE_URL environment variable");
      }

      const now = Date.now();
      const expiresAt = now + 60 * 1000; // 60 seconds

      const payload = {
        sessionId: args.sessionId,
        userId: args.userId ?? null,
        queriedAt: now,
        exp: expiresAt,
      };

      const payloadString = JSON.stringify(payload);

      // Use Web Crypto API for HMAC-SHA256 signing
      const encoder = new TextEncoder();
      const keyData = encoder.encode(secret);
      const key = await crypto.subtle.importKey(
        "raw",
        keyData,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );

      const signature = await crypto.subtle.sign(
        "HMAC",
        key,
        encoder.encode(payloadString)
      );

      // Encode as base64url: payload.signature
      const payloadB64 = btoa(payloadString)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
      const signatureB64 = btoa(
        String.fromCharCode(...new Uint8Array(signature))
      )
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

      const token = `${payloadB64}.${signatureB64}`;

      // 6. Return token and usage
      return {
        success: true,
        token,
        expiresAt,
        streamUrl: `${computeUrl}/v1/reading/stream`,
        usage: {
          used: usage.used,
          limit: usage.limit,
          remaining: null,
          resetsAt: null,
        },
        tier: tierInfo.tier,
        error: null,
        message: null,
      };
    } catch (err) {
      console.error("authorizeStream error:", err);
      return {
        success: false,
        error: "server_error",
        message: "Something went wrong. Please try again.",
        usage: { used: 0, limit: 5, remaining: null, resetsAt: null },
        tier: "maya",
        token: null,
        expiresAt: null,
        streamUrl: null,
      };
    }
  },
});
