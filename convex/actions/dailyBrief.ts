"use node";
import { action } from "../_generated/server";
import { v } from "convex/values";

/**
 * Generate a personalized daily brief via the Python Shastra Compute API.
 *
 * No rate limiting on daily briefs — they are a retention feature
 * available to all tiers (basic for Maya, full for Dhyan/Moksha).
 *
 * @param chartData - JSON string of the canonical chart
 * @param tone - Preferred reading tone
 * @param tier - Current subscription tier (affects brief depth)
 * @returns The daily brief content
 */
export const dailyBrief = action({
  args: {
    chartData: v.string(),
    tone: v.optional(v.string()),
    tier: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const computeUrl = process.env.SHASTRA_COMPUTE_URL;
    const apiKey = process.env.SHASTRA_COMPUTE_API_KEY;

    if (!computeUrl || !apiKey) {
      throw new Error(
        "Missing SHASTRA_COMPUTE_URL or SHASTRA_COMPUTE_API_KEY environment variable"
      );
    }

    try {
      const response = await fetch(`${computeUrl}/v1/brief/daily`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": apiKey,
        },
        body: JSON.stringify({
          chart_data: args.chartData,
          tone: args.tone ?? "practical",
          tier: args.tier ?? "maya",
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
