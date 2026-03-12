import { Polar } from "@convex-dev/polar";
import { components } from "./_generated/api";
import { DataModel } from "./_generated/dataModel";
import type { Auth } from "convex/server";

/**
 * Polar.sh subscription component for Sudarshan.
 *
 * Products:
 * - dhyan: $100/month (50 queries/week)
 * - moksha: $1000/month (500 queries/week)
 *
 * Maya (free, 5 queries/week) has no Polar product — it is the default tier.
 *
 * Environment variables:
 * - POLAR_ORGANIZATION_TOKEN
 * - POLAR_WEBHOOK_SECRET
 * - POLAR_DHYAN_PRODUCT_ID
 * - POLAR_MOKSHA_PRODUCT_ID
 */
export const polar = new Polar<DataModel>(components.polar, {
  getUserInfo: async (ctx) => {
    const identity = await (ctx as unknown as { auth: Auth }).auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated — sign in to manage subscriptions");
    }
    return {
      userId: identity.subject,
      email: identity.email!,
    };
  },
  products: {
    dhyan: "458d3978-f6e2-49e3-9a1b-c1d5b2425f32",
    moksha: "25bb8519-70d3-4a1a-83b5-ae2befb2a654",
  },
});

/**
 * Exported Polar API functions for use in the frontend.
 *
 * - changeCurrentSubscription: upgrade/downgrade between dhyan and moksha
 * - cancelCurrentSubscription: cancel at period end or revoke immediately
 * - getConfiguredProducts: get dhyan/moksha product details
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
