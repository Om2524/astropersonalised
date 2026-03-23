"use node";
import { action } from "../_generated/server";
import { v } from "convex/values";

/**
 * Find famous personality matches via the Python Shastra Compute API.
 *
 * No rate limiting on personality matches — the number of results
 * varies by tier (Maya: top 3, Dhyan: top 10, Moksha: top 50),
 * enforced by the Python API based on the tier parameter.
 *
 * @param chartData - JSON string of the canonical chart
 * @param tier - Current subscription tier (controls result count)
 * @returns Array of personality matches with resonance scores
 */
export const personalityMatch = action({
  args: {
    chartData: v.string(),
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
      const response = await fetch(`${computeUrl}/v1/resonance/match`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": apiKey,
        },
        body: JSON.stringify({
          chart_data: JSON.parse(args.chartData),
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
