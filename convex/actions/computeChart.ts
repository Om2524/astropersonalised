import { action } from "../_generated/server";
import { api } from "../_generated/api";
import { v } from "convex/values";

/**
 * Compute a natal chart via the Python Shastra Compute API.
 *
 * Flow:
 * 1. Calls POST /v1/chart/compute with birth details
 * 2. Stores the computed chart via charts.store mutation
 * 3. Stores/updates the birth profile via birthProfiles.upsert mutation
 * 4. Returns the computed chart data
 *
 * Environment variables:
 * - SHASTRA_COMPUTE_URL: base URL of the Python API
 * - SHASTRA_COMPUTE_API_KEY: shared secret for X-API-Key header
 *
 * @param sessionId - The anonymous session UUID
 * @param userId - Optional authenticated user ID
 * @param dateOfBirth - Date in YYYY-MM-DD format
 * @param timeOfBirth - Time in HH:MM format, or undefined if unknown
 * @param birthplace - Display name of the birthplace
 * @param latitude - Geocoded latitude
 * @param longitude - Geocoded longitude
 * @param timezone - IANA timezone string
 * @param birthTimeQuality - "exact", "approximate", or "unknown"
 * @param tone - Preferred reading tone
 * @returns The computed chart data and birth profile ID
 */
export const computeChart = action({
  args: {
    sessionId: v.string(),
    userId: v.optional(v.id("users")),
    dateOfBirth: v.string(),
    timeOfBirth: v.optional(v.string()),
    birthplace: v.string(),
    latitude: v.number(),
    longitude: v.number(),
    timezone: v.string(),
    birthTimeQuality: v.string(),
    tone: v.string(),
  },
  handler: async (ctx, args) => {
    const computeUrl = process.env.SHASTRA_COMPUTE_URL;
    const apiKey = process.env.SHASTRA_COMPUTE_API_KEY;

    if (!computeUrl || !apiKey) {
      throw new Error(
        "Missing SHASTRA_COMPUTE_URL or SHASTRA_COMPUTE_API_KEY environment variable"
      );
    }

    // Call Python API to compute the chart
    let chartResponse;
    try {
      const response = await fetch(`${computeUrl}/v1/chart/compute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": apiKey,
        },
        body: JSON.stringify({
          date_of_birth: args.dateOfBirth,
          time_of_birth: args.timeOfBirth ?? null,
          birthplace: args.birthplace,
          latitude: args.latitude,
          longitude: args.longitude,
          timezone: args.timezone,
          birth_time_quality: args.birthTimeQuality,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `Shastra Compute API error (${response.status}): ${errorBody}`
        );
      }

      chartResponse = await response.json();
    } catch (error) {
      if (error instanceof Error && error.message.includes("Shastra Compute")) {
        throw error;
      }
      throw new Error(
        `Failed to connect to Shastra Compute API: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    const now = Date.now();

    // Store the computed chart
    const chartId = await ctx.runMutation(api.functions.charts.store, {
      sessionId: args.sessionId,
      userId: args.userId,
      chartData: JSON.stringify(chartResponse),
      computedAt: now,
    });

    // Store/update the birth profile
    const profileId = await ctx.runMutation(
      api.functions.birthProfiles.upsert,
      {
        sessionId: args.sessionId,
        userId: args.userId,
        dateOfBirth: args.dateOfBirth,
        timeOfBirth: args.timeOfBirth,
        birthplace: args.birthplace,
        latitude: args.latitude,
        longitude: args.longitude,
        timezone: args.timezone,
        birthTimeQuality: args.birthTimeQuality,
        tone: args.tone,
      }
    );

    return {
      chartId,
      profileId,
      chartData: chartResponse,
      computedAt: now,
    };
  },
});
