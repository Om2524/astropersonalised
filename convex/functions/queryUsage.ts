import { internalMutation, mutation, query } from "../_generated/server";
import { v } from "convex/values";
import {
  ADMIN_EMAILS,
  FREE_WEEKLY_MESSAGE_LIMIT,
  isUnlimitedTier,
} from "../billingConfig";

/** Rolling window duration: 7 days in milliseconds. */
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const GUEST_PREVIEW_MESSAGE_LIMIT = 1;

const UNLIMITED_RESPONSE = {
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

/**
 * Check whether a user can send another message.
 *
 * Entitlement model:
 * - Guests: 1 preview message per rolling 7-day window
 * - Admin emails or `unlimitedQueries` flag: unlimited
 * - `moksha` tier: unlimited
 * - Authenticated users: 5 free messages per rolling 7-day window
 * - Authenticated users can extend with purchased message credits
 */
export const checkLimit = query({
  args: {
    sessionId: v.string(),
    userId: v.optional(v.id("users")),
    tier: v.string(),
  },
  handler: async (ctx, { sessionId, userId, tier }) => {
    // 1. Admin / unlimitedQueries bypass
    if (userId) {
      const user = await ctx.db.get(userId);
      if (user?.email && ADMIN_EMAILS.has(user.email)) {
        return UNLIMITED_RESPONSE;
      }
      if (user?.unlimitedQueries === true) {
        return UNLIMITED_RESPONSE;
      }
    }

    // 2. Tier-based unlimited (moksha)
    if (isUnlimitedTier(tier)) {
      return UNLIMITED_RESPONSE;
    }

    // 3. Count free usage in rolling 7-day window
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

    const freeMessageLimit = userId
      ? FREE_WEEKLY_MESSAGE_LIMIT
      : GUEST_PREVIEW_MESSAGE_LIMIT;
    const used = usageRecords.length;
    const freeRemaining = Math.max(0, freeMessageLimit - used);

    // 4. Count credit balance for authenticated users
    let creditBalance = 0;
    if (userId) {
      const grants = await ctx.db
        .query("messageCreditGrants")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .collect();
      const totalGranted = grants
        .filter((g) => g.status === "credited")
        .reduce((sum, g) => sum + g.credits, 0);

      const spends = await ctx.db
        .query("messageCreditSpends")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .collect();
      creditBalance = Math.max(0, totalGranted - spends.length);
    }

    // 5. Compute derived fields
    const messagesAvailable = freeRemaining + creditBalance;
    const allowed = messagesAvailable > 0;

    let resetsAt: number | null = null;
    if (freeRemaining === 0 && usageRecords.length > 0) {
      const earliest = usageRecords.reduce(
        (min, r) => (r.queriedAt < min ? r.queriedAt : min),
        usageRecords[0].queriedAt
      );
      resetsAt = earliest + SEVEN_DAYS_MS;
    }

    const nextConsumeSource: "free" | "credit" | "none" =
      freeRemaining > 0 ? "free" : creditBalance > 0 ? "credit" : "none";

    return {
      allowed,
      used,
      limit: freeMessageLimit,
      remaining: messagesAvailable,
      resetsAt,
      freeRemaining,
      creditBalance,
      messagesAvailable,
      isUnlimited: false,
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
