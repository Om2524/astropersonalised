import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { polar } from "./polar";

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
 * - subscription.canceled: log cancellation for analytics
 * - subscription.revoked: immediate access removal logging
 */
polar.registerRoutes(http, {
  path: "/polar/events",
  events: {
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
