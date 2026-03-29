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
  handler: async (ctx, { sessionId, userId, tier }) => {
    const unlimited = isUnlimitedTier(tier);
    const windowStart = Date.now() - SEVEN_DAYS_MS;

    const freeUsageRecords = userId
      ? await ctx.db
          .query("queryUsage")
          .withIndex("by_userId", (q) =>
            q.eq("userId", userId).gt("queriedAt", windowStart)
          )
          .collect()
      : await ctx.db
          .query("queryUsage")
          .withIndex("by_sessionId", (q) =>
            q.eq("sessionId", sessionId).gt("queriedAt", windowStart)
          )
          .collect();

    const used = freeUsageRecords.length;
    const freeRemaining = unlimited
      ? FREE_WEEKLY_MESSAGE_LIMIT
      : Math.max(0, FREE_WEEKLY_MESSAGE_LIMIT - used);

    let creditBalance = 0;
    if (userId && !unlimited) {
      const [grants, spends] = await Promise.all([
        ctx.db
          .query("messageCreditGrants")
          .withIndex("by_userId", (q) => q.eq("userId", userId))
          .collect(),
        ctx.db
          .query("messageCreditSpends")
          .withIndex("by_userId", (q) => q.eq("userId", userId))
          .collect(),
      ]);

      const grantedCredits = grants.reduce((sum, grant) => {
        return grant.status === "credited" ? sum + grant.credits : sum;
      }, 0);

      creditBalance = Math.max(0, grantedCredits - spends.length);
    }

    let resetsAt: number | null = null;
    if (freeRemaining === 0 && freeUsageRecords.length > 0) {
      const earliest = freeUsageRecords.reduce(
        (min, record) => (record.queriedAt < min ? record.queriedAt : min),
        freeUsageRecords[0].queriedAt
      );
      resetsAt = earliest + SEVEN_DAYS_MS;
    }

    const messagesAvailable = unlimited ? null : freeRemaining + creditBalance;
    const nextConsumeSource = unlimited
      ? "unlimited"
      : freeRemaining > 0
        ? "free"
        : creditBalance > 0
          ? "credit"
          : "none";

    return {
      allowed: unlimited || (messagesAvailable ?? 0) > 0,
      used,
      limit: FREE_WEEKLY_MESSAGE_LIMIT,
      remaining: messagesAvailable,
      resetsAt,
      freeRemaining,
      creditBalance,
      messagesAvailable,
      isUnlimited: unlimited,
      nextConsumeSource,
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
