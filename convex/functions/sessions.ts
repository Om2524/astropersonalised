import { mutation, query, internalMutation } from "../_generated/server";
import { v } from "convex/values";

/**
 * Get or create an anonymous session.
 *
 * Called on first page load with a client-generated UUID.
 * If the sessionId already exists, returns the existing session.
 * Otherwise, creates a new session record.
 *
 * @param sessionId - UUID generated in localStorage on the client
 * @returns The session document ID
 */
export const getOrCreate = mutation({
  args: {
    sessionId: v.string(),
  },
  returns: v.id("sessions"),
  handler: async (ctx, { sessionId }) => {
    const existing = await ctx.db
      .query("sessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .unique();

    if (existing) {
      return existing._id;
    }

    return await ctx.db.insert("sessions", {
      sessionId,
      createdAt: Date.now(),
    });
  },
});

/**
 * Get a session by its sessionId.
 *
 * @param sessionId - The UUID stored in localStorage
 * @returns The session document or null if not found
 */
export const get = query({
  args: {
    sessionId: v.string(),
  },
  handler: async (ctx, { sessionId }) => {
    return await ctx.db
      .query("sessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .unique();
  },
});

/**
 * Internal mutation: clean up stale anonymous sessions.
 *
 * Deletes sessions older than 30 days that have no linked userId.
 * Called by the weekly cron job.
 */
export const cleanupStale = internalMutation({
  args: {},
  handler: async (ctx) => {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const staleSessions = await ctx.db
      .query("sessions")
      .filter((q) =>
        q.and(
          q.eq(q.field("userId"), undefined),
          q.lt(q.field("createdAt"), thirtyDaysAgo)
        )
      )
      .take(500);

    for (const session of staleSessions) {
      await ctx.db.delete(session._id);
    }

    return { deleted: staleSessions.length };
  },
});
