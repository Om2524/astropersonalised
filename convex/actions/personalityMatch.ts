"use node";
import { action, type ActionCtx } from "../_generated/server";
import { api } from "../_generated/api";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";

type PublicAction = ReturnType<typeof action>;

type PersonalityMatchArgs = {
  sessionId: string;
  userId?: Id<"users">;
  chartData: string;
};

/**
 * Find famous personality matches via the Python Shastra Compute API.
 *
 * No message metering on personality matches — the result depth varies by
 * tier (Maya: top 3, Moksha: top 50), enforced by the Python API.
 *
 * @param chartData - JSON string of the canonical chart
 * @param tier - Current subscription tier (controls result count)
 * @returns Array of personality matches with resonance scores
 */
export const personalityMatch: PublicAction = action({
  args: {
    sessionId: v.string(),
    userId: v.optional(v.id("users")),
    chartData: v.string(),
  },
  handler: async (
    ctx: ActionCtx,
    args: PersonalityMatchArgs
  ): Promise<unknown> => {
    const tierInfo = await ctx.runQuery(
      api.functions.subscriptions.getCurrentTier,
      {
        sessionId: args.sessionId,
        userId: args.userId,
      }
    );

    const computeUrl = process.env.SHASTRA_COMPUTE_URL;
    const apiKey = process.env.SHASTRA_COMPUTE_API_KEY;

    if (!computeUrl || !apiKey) {
      throw new Error(
        "Missing SHASTRA_COMPUTE_URL or SHASTRA_COMPUTE_API_KEY environment variable"
      );
    }

    try {
      const response = await fetch(`${computeUrl}/v1/resonance/match`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": apiKey,
        },
        body: JSON.stringify({
          chart_data: JSON.parse(args.chartData).chart,
          tier: tierInfo.tier,
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
