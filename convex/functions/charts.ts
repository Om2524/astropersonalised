import { mutation, query } from "../_generated/server";
import { v } from "convex/values";

/**
 * Get the canonical chart for an authenticated user.
 *
 * @param userId - The authenticated user's document ID
 * @returns The chart document or null
 */
export const getByUser = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, { userId }) => {
    return await ctx.db
      .query("canonicalCharts")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
  },
});

/**
 * Get the canonical chart for a guest session.
 *
 * @param sessionId - The anonymous session UUID
 * @returns The chart document or null
 */
export const getBySession = query({
  args: {
    sessionId: v.string(),
  },
  handler: async (ctx, { sessionId }) => {
    return await ctx.db
      .query("canonicalCharts")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .unique();
  },
});

/**
 * Store or update a canonical chart for a session.
 *
 * Uses upsert pattern: if a chart exists for the sessionId,
 * it is replaced. Otherwise, a new chart is created.
 *
 * @param sessionId - The anonymous session UUID
 * @param userId - Optional authenticated user ID
 * @param chartData - JSON-serialized CanonicalChart object
 * @returns The chart document ID
 */
export const store = mutation({
  args: {
    sessionId: v.string(),
    userId: v.optional(v.id("users")),
    chartData: v.string(),
    computedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("canonicalCharts")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        chartData: args.chartData,
        computedAt: args.computedAt,
        userId: args.userId,
      });
      return existing._id;
    }

    return await ctx.db.insert("canonicalCharts", {
      sessionId: args.sessionId,
      userId: args.userId,
      chartData: args.chartData,
      computedAt: args.computedAt,
    });
  },
});
