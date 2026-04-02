import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { polar } from "./polar";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  BILLING_PRODUCT_IDS,
  MESSAGE_BUNDLE_CREDITS,
} from "./billingConfig";

const http = httpRouter();

/**
 * Register Convex Auth HTTP routes.
 * Handles OAuth callbacks and magic link verification.
 */
auth.addHttpRoutes(http);

/**
 * Register Polar webhook routes at /polar/events.
 *
 * Built-in handling:
 * - product.created / product.updated: sync product catalog
 * - subscription.created / subscription.updated: sync subscription state
 *
 * Custom handlers:
 * - order.paid: grant one-time message bundle credits
 * - order.updated: revoke bundle credits after a full refund
 * - subscription.canceled: log cancellation for analytics
 * - subscription.revoked: immediate access removal logging
 */
polar.registerRoutes(http, {
  path: "/polar/events",
  events: {
    "order.paid": async (ctx, event) => {
      const userId = event.data.customer?.metadata?.userId;
      if (
        typeof userId !== "string" ||
        event.data.productId !== BILLING_PRODUCT_IDS.messageBundle
      ) {
        return;
      }

      await ctx.runMutation(internal.functions.queryUsage.grantCreditBundle, {
        orderId: event.data.id,
        userId: userId as Id<"users">,
        productId: event.data.productId,
        credits: MESSAGE_BUNDLE_CREDITS,
        orderModifiedAt: (
          event.data.modifiedAt ?? event.timestamp
        ).getTime(),
      });
    },
    "order.updated": async (ctx, event) => {
      if (
        event.data.productId !== BILLING_PRODUCT_IDS.messageBundle ||
        event.data.totalAmount <= 0 ||
        event.data.refundedAmount < event.data.totalAmount
      ) {
        return;
      }

      await ctx.runMutation(internal.functions.queryUsage.revokeCreditBundle, {
        orderId: event.data.id,
        orderModifiedAt: (
          event.data.modifiedAt ?? event.timestamp
        ).getTime(),
      });
    },
    "subscription.canceled": async (_ctx, event) => {
      console.log(
        `Subscription canceled: userId=${event.data.customer?.metadata?.userId}, ` +
          `productId=${event.data.productId}, ` +
          `cancelAtPeriodEnd=${event.data.cancelAtPeriodEnd}`
      );
    },
    "subscription.revoked": async (_ctx, event) => {
      console.log(
        `Subscription revoked (immediate): userId=${event.data.customer?.metadata?.userId}, ` +
          `productId=${event.data.productId}`
      );
    },
  },
});

export default http;
