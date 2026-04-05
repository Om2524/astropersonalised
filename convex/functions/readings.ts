import { mutation, query } from "../_generated/server";
import { v } from "convex/values";

/**
 * Store a new reading result.
 *
 * @param sessionId - The anonymous session UUID
 * @param userId - Optional authenticated user ID
 * @param query - The user's natural language question
 * @param method - "vedic", "kp", "western", or "compare"
 * @param domain - Classified query domain (career, relationships, etc.)
 * @param classification - JSON string of the full query classification
 * @param evidenceSummary - JSON string of extracted chart evidence
 * @param reading - JSON string of the structured response
 * @returns The reading document ID
 */
export const store = mutation({
  args: {
    sessionId: v.string(),
    userId: v.optional(v.id("users")),
    query: v.string(),
    method: v.string(),
    domain: v.string(),
    classification: v.string(),
    evidenceSummary: v.string(),
    reading: v.string(),
    isSaved: v.optional(v.boolean()),
    createdAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("readings", {
      sessionId: args.sessionId,
      userId: args.userId,
      query: args.query,
      method: args.method,
      domain: args.domain,
      classification: args.classification,
      evidenceSummary: args.evidenceSummary,
      reading: args.reading,
      isSaved: args.isSaved ?? false,
      createdAt: args.createdAt ?? Date.now(),
    });
  },
});

/**
 * Get a single reading by ID.
 */
export const getById = query({
  args: { readingId: v.id("readings") },
  handler: async (ctx, { readingId }) => {
    return await ctx.db.get(readingId);
  },
});

/**
 * List readings for a session, most recent first.
 *
 * Uses the compound index [sessionId, createdAt] for efficient
 * descending-order retrieval without full table scan.
 *
 * @param sessionId - The anonymous session UUID
 * @returns Up to 50 most recent readings
 */
export const listBySession = query({
  args: {
    sessionId: v.string(),
  },
  handler: async (ctx, { sessionId }) => {
    return await ctx.db
      .query("readings")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .order("desc")
      .take(50);
  },
});

/**
 * List readings for an authenticated user, most recent first.
 *
 * @param userId - The authenticated user's document ID
 * @returns Up to 50 most recent readings
 */
export const listByUser = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, { userId }) => {
    return await ctx.db
      .query("readings")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .take(50);
  },
});

/**
 * List saved (bookmarked) readings for an authenticated user.
 *
 * Uses the compound index [userId, isSaved] for efficient filtering.
 *
 * @param userId - The authenticated user's document ID
 * @returns All saved readings for the user
 */
export const listSaved = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, { userId }) => {
    return await ctx.db
      .query("readings")
      .withIndex("by_userId_saved", (q) =>
        q.eq("userId", userId).eq("isSaved", true)
      )
      .collect();
  },
});

/**
 * Toggle the saved/bookmarked state of a reading.
 *
 * @param readingId - The reading document ID
 */
export const toggleSave = mutation({
  args: {
    readingId: v.id("readings"),
  },
  handler: async (ctx, { readingId }) => {
    const reading = await ctx.db.get(readingId);
    if (!reading) {
      throw new Error("Reading not found");
    }

    await ctx.db.patch(readingId, { isSaved: !reading.isSaved });
    return { isSaved: !reading.isSaved };
  },
});

/**
 * Delete a reading.
 *
 * @param readingId - The reading document ID
 */
export const remove = mutation({
  args: {
    readingId: v.id("readings"),
  },
  handler: async (ctx, { readingId }) => {
    const reading = await ctx.db.get(readingId);
    if (!reading) {
      throw new Error("Reading not found");
    }

    await ctx.db.delete(readingId);
  },
});
