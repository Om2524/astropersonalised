/**
 * Billing product configuration shared across Convex functions.
 *
 * The message bundle reuses the legacy Dhyan product slot so the existing
 * checkout wiring can evolve without introducing a brand-new product ID path.
 */
const LEGACY_MESSAGE_BUNDLE_PRODUCT_ID = "458d3978-f6e2-49e3-9a1b-c1d5b2425f32";
const LEGACY_MOKSHA_PRODUCT_ID = "25bb8519-70d3-4a1a-83b5-ae2befb2a654";

export const BILLING_PRODUCT_IDS = {
  messageBundle:
    process.env.POLAR_MESSAGE_BUNDLE_PRODUCT_ID ??
    LEGACY_MESSAGE_BUNDLE_PRODUCT_ID,
  moksha: process.env.POLAR_MOKSHA_PRODUCT_ID ?? LEGACY_MOKSHA_PRODUCT_ID,
} as const;

export const FREE_WEEKLY_MESSAGE_LIMIT = 5;
export const MESSAGE_BUNDLE_CREDITS = 50;

export function isUnlimitedTier(tier: string) {
  return tier === "moksha";
}

export function isUnlimitedSubscriptionKey(productKey?: string | null) {
  return productKey === "moksha" || productKey === "dhyan";
}

export const ADMIN_EMAILS: ReadonlySet<string> = new Set([
  "ompatil2524@gmail.com",
  "kushjain125@gmail.com",
]);
