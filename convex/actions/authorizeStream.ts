"use node";
import { action, type ActionCtx } from "../_generated/server";
import { api } from "../_generated/api";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";

const ANONYMOUS_PREVIEW_LIMIT = 1;
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

    if (args.method === "compare" && tierInfo.tier !== "moksha") {
      return {
        success: false,
        error: "feature_locked",
        message: "Compare All is part of Moksha Unlimited.",
        usage: {
          used: usage.used,
          limit: usage.limit,
          remaining: usage.remaining,
          resetsAt: usage.resetsAt,
        },
        tier: tierInfo.tier,
        token: null,
        expiresAt: null,
        streamUrl: null,
      };
    }

    // 3. If out of messages, return an upgrade / purchase prompt
    if (!usage.allowed) {
      return {
        success: false,
        error: "rate_limit_exceeded",
        message:
          "You’re out of messages. Buy a 50-message pack or go Moksha Unlimited.",
        usage: {
          used: usage.used,
          limit: usage.limit,
          remaining: usage.remaining,
          resetsAt: usage.resetsAt,
        },
        tier: tierInfo.tier,
        token: null,
        expiresAt: null,
        streamUrl: null,
      };
    }

    if (!args.userId && usage.used >= ANONYMOUS_PREVIEW_LIMIT) {
      return {
        success: false,
        error: "auth_required",
        message:
          "Sign in to continue this conversation and save your astrology profile.",
        usage: {
          used: usage.used,
          limit: usage.limit,
          remaining: usage.remaining,
          resetsAt: usage.resetsAt,
        },
        tier: tierInfo.tier,
        token: null,
        expiresAt: null,
        streamUrl: null,
      };
    }

    // 4. Record free usage or spend one paid credit
    if (usage.nextConsumeSource === "free") {
      await ctx.runMutation(api.functions.queryUsage.recordUsage, {
        sessionId: args.sessionId,
        userId: args.userId,
        usageKey: args.usageKey,
      });
    } else if (usage.nextConsumeSource === "credit") {
      if (!args.userId) {
        throw new Error("Authenticated user required to spend message credits");
      }
      await ctx.runMutation(api.functions.queryUsage.recordCreditSpend, {
        userId: args.userId,
        usageKey: args.usageKey,
      });
    }

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
        used:
          usage.nextConsumeSource === "free" ? usage.used + 1 : usage.used,
        limit: usage.limit,
        remaining:
          usage.remaining === null
            ? null
            : Math.max(0, usage.remaining - 1),
        resetsAt: usage.resetsAt,
      },
      tier: tierInfo.tier,
      error: null,
      message: null,
    };
  },
});
