"use node";
import { action } from "../_generated/server";
import { api } from "../_generated/api";
import { v } from "convex/values";
import type { GenericActionCtx, GenericDataModel } from "convex/server";
import type { Id } from "../_generated/dataModel";

/**
 * Ask the astrology AI a question and get a structured reading.
 *
 * Flow:
 * 1. Resolve the user's subscription tier
 * 2. Check rate limit (rolling 7-day window)
 * 3. If not allowed: return error with usage info and upgrade prompt
 * 4. Record usage
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
export const askReading = action({
  args: {
    sessionId: v.string(),
    userId: v.optional(v.id("users")),
    query: v.string(),
    method: v.string(),
    chartData: v.string(),
    tone: v.optional(v.string()),
  },
  handler: async (
    ctx: GenericActionCtx<GenericDataModel>,
    args: {
      sessionId: string;
      userId?: Id<"users">;
      query: string;
      method: string;
      chartData: string;
      tone?: string;
    }
  ) => {
    // 1. Resolve tier
    const tierInfo = await ctx.runQuery(
      api.functions.subscriptions.getCurrentTier,
      {
        sessionId: args.sessionId,
        userId: args.userId,
      }
    );

    // 2. Check rate limit
    const usage = await ctx.runQuery(api.functions.queryUsage.checkLimit, {
      sessionId: args.sessionId,
      userId: args.userId,
      tier: tierInfo.tier,
    });

    // 3. If rate limited, return error
    if (!usage.allowed) {
      return {
        success: false,
        error: "rate_limit_exceeded",
        message: `You have used all ${usage.limit} queries for this week. ${
          tierInfo.tier === "maya"
            ? "Upgrade to Dhyan for 50 queries/week or Moksha for 500 queries/week."
            : tierInfo.tier === "dhyan"
              ? "Upgrade to Moksha for 500 queries/week."
              : "Your limit resets soon."
        }`,
        usage: {
          used: usage.used,
          limit: usage.limit,
          remaining: usage.remaining,
          resetsAt: usage.resetsAt,
        },
        tier: tierInfo.tier,
      };
    }

    // 4. Record usage (before API call to ensure accurate counting)
    await ctx.runMutation(api.functions.queryUsage.recordUsage, {
      sessionId: args.sessionId,
      userId: args.userId,
    });

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
          chart_data: JSON.parse(args.chartData),
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
        used: usage.used + 1,
        limit: usage.limit,
        remaining: Math.max(0, usage.remaining - 1),
        resetsAt: usage.resetsAt,
      },
      tier: tierInfo.tier,
    };
  },
});
