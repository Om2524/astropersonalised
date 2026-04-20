import { mutation, query } from "../_generated/server";
import { v } from "convex/values";

/**
 * Get the birth profile for an authenticated user.
 *
 * @param userId - The authenticated user's document ID
 * @returns The birth profile document or null
 */
export const getByUser = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, { userId }) => {
    return await ctx.db
      .query("birthProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
  },
});

/**
 * Get the birth profile for a guest session.
 *
 * @param sessionId - The anonymous session UUID
 * @returns The birth profile document or null
 */
export const getBySession = query({
  args: {
    sessionId: v.string(),
  },
  handler: async (ctx, { sessionId }) => {
    return await ctx.db
      .query("birthProfiles")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .unique();
  },
});

/**
 * Create or update the birth profile for a session.
 *
 * Uses upsert pattern: if a profile exists for the sessionId,
 * it is updated. Otherwise, a new profile is created.
 *
 * @param sessionId - The anonymous session UUID
 * @param dateOfBirth - Date in YYYY-MM-DD format
 * @param timeOfBirth - Time in HH:MM format, or undefined if unknown
 * @param birthplace - Display name of the birthplace
 * @param latitude - Geocoded latitude
 * @param longitude - Geocoded longitude
 * @param timezone - IANA timezone string
 * @param birthTimeQuality - "exact", "approximate", or "unknown"
 * @param tone - "practical", "emotional", "spiritual", or "concise"
 * @returns The birth profile document ID
 */
export const upsert = mutation({
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
    language: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("birthProfiles")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        dateOfBirth: args.dateOfBirth,
        timeOfBirth: args.timeOfBirth,
        birthplace: args.birthplace,
        latitude: args.latitude,
        longitude: args.longitude,
        timezone: args.timezone,
        birthTimeQuality: args.birthTimeQuality,
        tone: args.tone,
        language: args.language,
        userId: args.userId,
      });
      return existing._id;
    }

    return await ctx.db.insert("birthProfiles", {
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
      language: args.language,
    });
  },
});

/**
 * Update the preferred reading tone for a birth profile.
 *
 * @param sessionId - The anonymous session UUID
 * @param tone - "practical", "emotional", "spiritual", or "concise"
 */
/**
 * Update the preferred language for a birth profile.
 */
export const updateLanguage = mutation({
  args: {
    sessionId: v.optional(v.string()),
    userId: v.optional(v.id("users")),
    language: v.string(),
  },
  handler: async (ctx, { sessionId, userId, language }) => {
    let profile = null;

    if (userId) {
      profile = await ctx.db
        .query("birthProfiles")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .first();
    }

    if (!profile && sessionId) {
      profile = await ctx.db
        .query("birthProfiles")
        .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
        .unique();
    }

    if (!profile) {
      throw new Error("Birth profile not found");
    }

    await ctx.db.patch(profile._id, { language });
  },
});

export const updateTone = mutation({
  args: {
    sessionId: v.optional(v.string()),
    userId: v.optional(v.id("users")),
    tone: v.string(),
  },
  handler: async (ctx, { sessionId, userId, tone }) => {
    let profile = null;

    if (userId) {
      profile = await ctx.db
        .query("birthProfiles")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .first();
    }

    if (!profile && sessionId) {
      profile = await ctx.db
        .query("birthProfiles")
        .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
        .unique();
    }

    if (!profile) {
      throw new Error("Birth profile not found");
    }

    await ctx.db.patch(profile._id, { tone });
  },
});
