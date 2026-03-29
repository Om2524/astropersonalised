import { internalMutation, mutation, query } from "../_generated/server";
import { v } from "convex/values";
import {
  FREE_WEEKLY_MESSAGE_LIMIT,
  isUnlimitedTier,
} from "../billingConfig";

/** Rolling window duration for free messages: 7 days in milliseconds. */
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Check whether a user can send another message.
 *
 * Entitlement model:
 * - `moksha`: unlimited messages
 * - everyone else: 5 free messages per rolling 7-day window
 * - authenticated users can extend that with purchased message credits
 */
export const checkLimit = query({
  args: {
    sessionId: v.string(),
    userId: v.optional(v.id("users")),
    tier: v.string(),
  },
  handler: async (_ctx, { sessionId: _s, userId: _u, tier: _t }) => {
    // All limits removed — every user gets unlimited access.
    return {
      allowed: true,
      used: 0,
      limit: FREE_WEEKLY_MESSAGE_LIMIT,
      remaining: null,
      resetsAt: null,
      freeRemaining: FREE_WEEKLY_MESSAGE_LIMIT,
      creditBalance: 0,
      messagesAvailable: null,
      isUnlimited: true,
      nextConsumeSource: "unlimited" as const,
    };
  },
});

/**
 * Record one free-message usage event.
 *
 * `usageKey` keeps the free allowance idempotent across request retries.
 */
export const recordUsage = mutation({
  args: {
    sessionId: v.string(),
    userId: v.optional(v.id("users")),
    usageKey: v.string(),
  },
  handler: async (ctx, { sessionId, userId, usageKey }) => {
    const existing = await ctx.db
      .query("queryUsage")
      .withIndex("by_usageKey", (q) => q.eq("usageKey", usageKey))
      .unique();

    if (existing) {
      return existing._id;
    }

    return await ctx.db.insert("queryUsage", {
      sessionId,
      userId,
      usageKey,
      queriedAt: Date.now(),
    });
  },
});

/**
 * Record one paid-credit spend for a message bundle.
 *
 * Bundle debits are authenticated-only by design.
 */
export const recordCreditSpend = mutation({
  args: {
    userId: v.id("users"),
    usageKey: v.string(),
  },
  handler: async (ctx, { userId, usageKey }) => {
    const existing = await ctx.db
      .query("messageCreditSpends")
      .withIndex("by_usageKey", (q) => q.eq("usageKey", usageKey))
      .unique();

    if (existing) {
      return existing._id;
    }

    return await ctx.db.insert("messageCreditSpends", {
      usageKey,
      userId,
      spentAt: Date.now(),
    });
  },
});

/**
 * Internal mutation: grant bundle credits for a paid Polar order.
 */
export const grantCreditBundle = internalMutation({
  args: {
    orderId: v.string(),
    userId: v.id("users"),
    productId: v.string(),
    credits: v.number(),
    orderModifiedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("messageCreditGrants")
      .withIndex("by_orderId", (q) => q.eq("orderId", args.orderId))
      .unique();

    if (!existing) {
      return await ctx.db.insert("messageCreditGrants", {
        orderId: args.orderId,
        userId: args.userId,
        productId: args.productId,
        credits: args.credits,
        status: "credited",
        orderModifiedAt: args.orderModifiedAt,
        grantedAt: Date.now(),
      });
    }

    if (existing.orderModifiedAt > args.orderModifiedAt) {
      return existing._id;
    }

    await ctx.db.patch(existing._id, {
      userId: args.userId,
      productId: args.productId,
      credits: args.credits,
      status: "credited",
      orderModifiedAt: args.orderModifiedAt,
    });
    return existing._id;
  },
});

/**
 * Internal mutation: revoke a bundle grant after a full refund.
 */
export const revokeCreditBundle = internalMutation({
  args: {
    orderId: v.string(),
    orderModifiedAt: v.number(),
  },
  handler: async (ctx, { orderId, orderModifiedAt }) => {
    const existing = await ctx.db
      .query("messageCreditGrants")
      .withIndex("by_orderId", (q) => q.eq("orderId", orderId))
      .unique();

    if (!existing || existing.orderModifiedAt > orderModifiedAt) {
      return existing?._id ?? null;
    }

    await ctx.db.patch(existing._id, {
      status: "revoked",
      orderModifiedAt,
    });
    return existing._id;
  },
});

/**
 * Internal mutation: clean up expired free-usage records.
 *
 * Paid credits are intentionally durable and are not part of this cleanup.
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
