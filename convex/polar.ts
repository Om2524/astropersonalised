import { Polar } from "@convex-dev/polar";
import { components } from "./_generated/api";
import { DataModel } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";
import type { Auth } from "convex/server";
import { BILLING_PRODUCT_IDS } from "./billingConfig";

/**
 * Polar.sh subscription component for iktara.
 *
 * Products:
 * - message bundle: one-time 50-message pack (reuses legacy Dhyan slot)
 * - moksha: recurring unlimited plan
 *
 * Maya is the default free tier with a rolling weekly allowance.
 *
 * Environment variables:
 * - POLAR_ORGANIZATION_TOKEN
 * - POLAR_WEBHOOK_SECRET
 * - POLAR_MESSAGE_BUNDLE_PRODUCT_ID
 * - POLAR_MOKSHA_PRODUCT_ID
 */
export const polar = new Polar<DataModel>(components.polar, {
  getUserInfo: async (ctx) => {
    const identity = await (ctx as unknown as { auth: Auth }).auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated — sign in to manage subscriptions");
    }
    // @convex-dev/auth stores subject as "userId|sessionId"
    // Extract just the userId (Convex document _id) for Polar customer lookup
    const [userId] = identity.subject.split("|");
    return {
      userId,
      email: identity.email!,
    };
  },
  products: {
    // Keep the legacy Dhyan key configured so existing subscribers
    // continue to resolve as premium until they migrate to Moksha.
    dhyan: BILLING_PRODUCT_IDS.messageBundle,
    moksha: BILLING_PRODUCT_IDS.moksha,
  },
});

/**
 * Exported Polar API functions for use in the frontend.
 *
 * - changeCurrentSubscription: manage the recurring Moksha subscription
 * - cancelCurrentSubscription: cancel at period end or revoke immediately
 * - getConfiguredProducts: get configured Polar product details
 * - listAllProducts: list all Polar products
 * - listAllSubscriptions: list all subscriptions for the current user
 * - generateCheckoutLink: create a checkout URL for a product
 * - generateCustomerPortalUrl: get a URL to the Polar customer portal
 */
export const {
  changeCurrentSubscription,
  cancelCurrentSubscription,
  getConfiguredProducts,
  listAllProducts,
  listAllSubscriptions,
  generateCheckoutLink,
  generateCustomerPortalUrl,
} = polar.api();

/**
 * One-off action to sync Polar product catalog into the Convex component DB.
 *
 * Products created before the webhook was registered won't appear in
 * getConfiguredProducts / listAllProducts until this runs at least once.
 *
 * Usage:
 *   npx convex run polar:syncProducts --prod '{}'
 */
export const syncProducts = internalAction({
  args: {},
  handler: async (ctx) => {
    await polar.syncProducts(ctx);
  },
});
