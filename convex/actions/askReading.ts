"use node";
import { action, type ActionCtx } from "../_generated/server";
import { api } from "../_generated/api";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";

type PublicAction = ReturnType<typeof action>;
type AskReadingArgs = {
  sessionId: string;
  userId?: Id<"users">;
  usageKey: string;
  query: string;
  method: string;
  chartData: string;
  tone?: string;
};

type UsageSnapshot = {
  used: number;
  limit: number;
  remaining: number | null;
  resetsAt: number | null;
};

type AskReadingResult =
  | {
      success: false;
      error: string;
      message: string;
      usage: UsageSnapshot;
      tier: string;
    }
  | {
      success: true;
      readingId: Id<"readings">;
      reading: unknown;
      usage: UsageSnapshot;
      tier: string;
    };

/**
 * Ask the astrology AI a question and get a structured reading.
 *
 * Flow:
 * 1. Resolve the user's subscription tier
 * 2. Check message entitlement
 * 3. If not allowed: return error with usage info and upgrade prompt
 * 4. Record free usage or spend one paid credit
 * 5. Call Python API POST /v1/reading/ask
 * 6. Store the reading result
 * 7. Return result with usage stats
 *
 * Environment variables:
 * - SHASTRA_COMPUTE_URL: base URL of the Python API
 * - SHASTRA_COMPUTE_API_KEY: shared secret for X-API-Key header
 *
 * @param sessionId - The anonymous session UUID
 * @param userId - Optional authenticated user ID
 * @param query - The user's natural language question
 * @param method - "vedic", "kp", "western", or "compare"
 * @param chartData - JSON string of the canonical chart
 * @param tone - Preferred reading tone
 * @returns The reading result with usage stats
 */
export const askReading: PublicAction = action({
  args: {
    sessionId: v.string(),
    userId: v.optional(v.id("users")),
    usageKey: v.string(),
    query: v.string(),
    method: v.string(),
    chartData: v.string(),
    tone: v.optional(v.string()),
  },
  handler: async (
    ctx: ActionCtx,
    args: AskReadingArgs
  ): Promise<AskReadingResult> => {
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
      };
    }

    // 3. If out of messages, return a purchase / upgrade prompt
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

    // 5. Call Python API
    const computeUrl = process.env.SHASTRA_COMPUTE_URL;
    const apiKey = process.env.SHASTRA_COMPUTE_API_KEY;

    if (!computeUrl || !apiKey) {
      throw new Error(
        "Missing SHASTRA_COMPUTE_URL or SHASTRA_COMPUTE_API_KEY environment variable"
      );
    }

    let readingResponse;
    try {
      const response = await fetch(`${computeUrl}/v1/reading/ask`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": apiKey,
        },
        body: JSON.stringify({
          query: args.query,
          method: args.method,
          chart_data: JSON.parse(args.chartData).chart,
          tone: args.tone ?? "practical",
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `Shastra Compute API error (${response.status}): ${errorBody}`
        );
      }

      readingResponse = await response.json();
    } catch (error) {
      if (error instanceof Error && error.message.includes("Shastra Compute")) {
        throw error;
      }
      throw new Error(
        `Failed to connect to Shastra Compute API: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    // 6. Store the reading
    const readingId = await ctx.runMutation(api.functions.readings.store, {
      sessionId: args.sessionId,
      userId: args.userId,
      query: args.query,
      method: args.method,
      domain: readingResponse.classification?.domain ?? "general",
      classification: JSON.stringify(readingResponse.classification ?? {}),
      evidenceSummary: JSON.stringify(readingResponse.evidence ?? {}),
      reading: JSON.stringify(readingResponse.reading ?? readingResponse),
      createdAt: Date.now(),
    });

    // 7. Return result with usage
    return {
      success: true,
      readingId,
      reading: readingResponse,
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
    };
  },
});
