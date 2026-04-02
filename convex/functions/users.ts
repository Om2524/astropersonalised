import { mutation, query, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

/**
 * Get the currently authenticated user.
 *
 * Returns null if the user is not authenticated (anonymous session).
 *
 * @returns The user document or null
 */
export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }
    return await ctx.db.get(userId);
  },
});

/**
 * Grant unlimited queries to a user by email.
 *
 * Sets unlimitedQueries: true on the user document, bypassing all
 * weekly rate limits. Safe to call multiple times (idempotent).
 * Internal-only — cannot be called from the browser.
 *
 * After deploy, activate via CLI:
 *   npx convex run functions/users:grantUnlimitedQueries --prod '{"email":"user@example.com"}'
 */
export const grantUnlimitedQueries = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .unique();

    if (!user) {
      throw new Error(`No user found with email: ${email}`);
    }

    await ctx.db.patch(user._id, { unlimitedQueries: true });
    return { patched: user._id, email };
  },
});

/**
 * Migrate all anonymous session data to an authenticated user.
 *
 * This is a SINGLE ATOMIC mutation that links all records created
 * during an anonymous session to the newly authenticated userId.
 *
 * Tables updated: sessions, birthProfiles, canonicalCharts, readings, queryUsage
 *
 * Edge case: if a user has multiple anonymous sessions (cleared cookies,
 * new device), only the current sessionId is migrated. Previous anonymous
 * sessions remain orphaned and are cleaned up by the weekly cron.
 *
 * @param sessionId - The anonymous session UUID from localStorage
 * @param userId - The authenticated user's document ID
 */
export const migrateSession = mutation({
  args: {
    sessionId: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, { sessionId, userId }) => {
    // 1. Link the session record
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .unique();

    if (session) {
      await ctx.db.patch(session._id, { userId });
    }

    // 2. Link birth profiles
    const birthProfiles = await ctx.db
      .query("birthProfiles")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .collect();

    for (const profile of birthProfiles) {
      await ctx.db.patch(profile._id, { userId });
    }

    // 3. Link canonical charts
    const charts = await ctx.db
      .query("canonicalCharts")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .collect();

    for (const chart of charts) {
      await ctx.db.patch(chart._id, { userId });
    }

    // 4. Link readings
    const readings = await ctx.db
      .query("readings")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .collect();

    for (const reading of readings) {
      await ctx.db.patch(reading._id, { userId });
    }

    // 5. Link query usage records
    const usageRecords = await ctx.db
      .query("queryUsage")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .collect();

    for (const usage of usageRecords) {
      await ctx.db.patch(usage._id, { userId });
    }

    return {
      migrated: {
        sessions: session ? 1 : 0,
        birthProfiles: birthProfiles.length,
        charts: charts.length,
        readings: readings.length,
        queryUsage: usageRecords.length,
      },
    };
  },
});
