import { mutation, query, internalMutation } from "../_generated/server";
import { v } from "convex/values";

/** Rolling window duration: 7 days in milliseconds. */
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/** Tier query limits per rolling 7-day window. */
const TIER_LIMITS: Record<string, number> = {
  maya: 5,
  dhyan: 50,
  moksha: 500,
};

/**
 * Check if a query is allowed under the current rate limit.
 *
 * Uses a rolling 7-day window: counts queryUsage records where
 * queriedAt > (now - 7 days). Uses compound indexes to avoid
 * full table scans (Convex has a 32,000 document scan limit).
 *
 * @param sessionId - The anonymous session UUID
 * @param userId - Optional authenticated user ID
 * @param tier - "maya", "dhyan", or "moksha"
 * @returns Object with allowed flag, usage stats, and reset time
 */
export const checkLimit = query({
  args: {
    sessionId: v.string(),
    userId: v.optional(v.id("users")),
    tier: v.string(),
  },
  handler: async (ctx, { sessionId, userId, tier }) => {
    const limit = TIER_LIMITS[tier] ?? TIER_LIMITS.maya;
    const windowStart = Date.now() - SEVEN_DAYS_MS;

    let usageRecords;
    if (userId) {
      usageRecords = await ctx.db
        .query("queryUsage")
        .withIndex("by_userId", (q) =>
          q.eq("userId", userId).gt("queriedAt", windowStart)
        )
        .collect();
    } else {
      usageRecords = await ctx.db
        .query("queryUsage")
        .withIndex("by_sessionId", (q) =>
          q.eq("sessionId", sessionId).gt("queriedAt", windowStart)
        )
        .collect();
    }

    const used = usageRecords.length;
    const allowed = used < limit;
    const remaining = Math.max(0, limit - used);

    // Find when the earliest query in the window expires (rolls off)
    let resetsAt: number | null = null;
    if (!allowed && usageRecords.length > 0) {
      const earliest = usageRecords.reduce(
        (min, r) => (r.queriedAt < min ? r.queriedAt : min),
        usageRecords[0].queriedAt
      );
      resetsAt = earliest + SEVEN_DAYS_MS;
    }

    return {
      allowed,
      used,
      limit,
      remaining,
      resetsAt,
    };
  },
});

/**
 * Record a query usage event.
 *
 * Called after rate limit check passes, before the actual query
 * is sent to the Python API.
 *
 * @param sessionId - The anonymous session UUID
 * @param userId - Optional authenticated user ID
 * @returns The queryUsage document ID
 */
export const recordUsage = mutation({
  args: {
    sessionId: v.string(),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, { sessionId, userId }) => {
    return await ctx.db.insert("queryUsage", {
      sessionId,
      userId,
      queriedAt: Date.now(),
    });
  },
});

/**
 * Internal mutation: clean up expired query usage records.
 *
 * Deletes records older than 8 days (7-day window + 1 day buffer).
 * Called by the daily cron job.
 *
 * Processes in batches of 500 to stay within Convex limits.
 */
export const cleanupExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
    const expired = await ctx.db
      .query("queryUsage")
      .filter((q) => q.lt(q.field("queriedAt"), eightDaysAgo))
      .take(500);

    for (const record of expired) {
      await ctx.db.delete(record._id);
    }

    return { deleted: expired.length };
  },
});
