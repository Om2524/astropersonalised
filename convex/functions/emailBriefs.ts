import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

const DEFAULT_SEND_HOUR = 7;

export const getMyPreference = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }

    return await ctx.db
      .query("emailBriefPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
  },
});

export const saveMyPreference = mutation({
  args: {
    email: v.string(),
    dailyBriefEnabled: v.boolean(),
    timezone: v.string(),
    localSendHour: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Sign in to manage email brief settings.");
    }

    if (args.localSendHour < 0 || args.localSendHour > 23) {
      throw new Error("localSendHour must be between 0 and 23.");
    }

    const now = Date.now();
    const existing = await ctx.db
      .query("emailBriefPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        email: args.email.trim(),
        dailyBriefEnabled: args.dailyBriefEnabled,
        timezone: args.timezone,
        localSendHour: args.localSendHour,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("emailBriefPreferences", {
      userId,
      email: args.email.trim(),
      dailyBriefEnabled: args.dailyBriefEnabled,
      timezone: args.timezone,
      localSendHour: args.localSendHour,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const listEnabledDailyBriefPreferences = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("emailBriefPreferences")
      .withIndex("by_dailyBriefEnabled", (q) =>
        q.eq("dailyBriefEnabled", true)
      )
      .collect();
  },
});

export const getDeliveryContext = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, { userId }) => {
    const [user, chart, birthProfile] = await Promise.all([
      ctx.db.get(userId),
      ctx.db
        .query("canonicalCharts")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .first(),
      ctx.db
        .query("birthProfiles")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .first(),
    ]);

    return {
      user,
      chart,
      birthProfile,
    };
  },
});

export const markDailyBriefSent = internalMutation({
  args: {
    preferenceId: v.id("emailBriefPreferences"),
    localDate: v.string(),
    messageId: v.optional(v.string()),
  },
  handler: async (ctx, { preferenceId, localDate, messageId }) => {
    await ctx.db.patch(preferenceId, {
      updatedAt: Date.now(),
      lastAttemptStatus: "sent",
      lastAttemptedAt: Date.now(),
      lastDeliveredAt: Date.now(),
      lastDeliveredLocalDate: localDate,
      ...(messageId ? { lastMessageId: messageId } : {}),
    });
  },
});

export const markDailyBriefFailed = internalMutation({
  args: {
    preferenceId: v.id("emailBriefPreferences"),
    error: v.string(),
  },
  handler: async (ctx, { preferenceId, error }) => {
    await ctx.db.patch(preferenceId, {
      updatedAt: Date.now(),
      lastAttemptStatus: "error",
      lastAttemptedAt: Date.now(),
      lastError: error,
    });
  },
});

export const ensurePreferenceForUser = internalMutation({
  args: {
    userId: v.id("users"),
    email: v.string(),
    timezone: v.optional(v.string()),
    localSendHour: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("emailBriefPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        email: args.email.trim(),
        timezone: args.timezone ?? existing.timezone,
        localSendHour: args.localSendHour ?? existing.localSendHour,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("emailBriefPreferences", {
      userId: args.userId,
      email: args.email.trim(),
      dailyBriefEnabled: false,
      timezone: args.timezone ?? "UTC",
      localSendHour: args.localSendHour ?? DEFAULT_SEND_HOUR,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export type EmailBriefPreferenceId = Id<"emailBriefPreferences">;
