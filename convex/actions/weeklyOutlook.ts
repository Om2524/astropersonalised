"use node";
import { action, type ActionCtx } from "../_generated/server";
import { api } from "../_generated/api";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";

type PublicAction = ReturnType<typeof action>;

type WeeklyOutlookArgs = {
  sessionId: string;
  userId?: Id<"users">;
  chartData: string;
  tone?: string;
  weekStart?: string;
};

/**
 * Generate a personalized weekly outlook via the Python Shastra Compute API.
 *
 * No message metering on weekly outlooks, but the feature is locked to Moksha.
 *
 * @param chartData - JSON string of the canonical chart
 * @param tone - Preferred reading tone
 * @returns The weekly outlook content
 */
export const weeklyOutlook: PublicAction = action({
  args: {
    sessionId: v.string(),
    userId: v.optional(v.id("users")),
    chartData: v.string(),
    tone: v.optional(v.string()),
    weekStart: v.optional(v.string()),
  },
  handler: async (
    ctx: ActionCtx,
    args: WeeklyOutlookArgs
  ): Promise<unknown> => {
    const tierInfo = await ctx.runQuery(
      api.functions.subscriptions.getCurrentTier,
      {
        sessionId: args.sessionId,
        userId: args.userId,
      }
    );

    if (tierInfo.tier !== "moksha") {
      throw new Error("Weekly outlook is part of Moksha Unlimited.");
    }

    const computeUrl = process.env.SHASTRA_COMPUTE_URL;
    const apiKey = process.env.SHASTRA_COMPUTE_API_KEY;

    if (!computeUrl || !apiKey) {
      throw new Error(
        "Missing SHASTRA_COMPUTE_URL or SHASTRA_COMPUTE_API_KEY environment variable"
      );
    }

    try {
      const response = await fetch(`${computeUrl}/v1/brief/weekly`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": apiKey,
        },
        body: JSON.stringify({
          chart_data: JSON.parse(args.chartData).chart,
          tone: args.tone ?? "practical",
          ...(args.weekStart ? { week_start: args.weekStart } : {}),
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `Shastra Compute API error (${response.status}): ${errorBody}`
        );
      }

      return await response.json();
    } catch (error) {
      if (error instanceof Error && error.message.includes("Shastra Compute")) {
        throw error;
      }
      throw new Error(
        `Failed to connect to Shastra Compute API: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  },
});
