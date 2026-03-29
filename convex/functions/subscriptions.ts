import { query } from "../_generated/server";
import { v } from "convex/values";
import { polar } from "../polar";
import { isUnlimitedSubscriptionKey } from "../billingConfig";

/** Default tier for unauthenticated or free users. */
const DEFAULT_TIER = "maya";

/**
 * Resolve the current subscription tier for a session or user.
 *
 * Resolution order:
 * 1. If no userId (anonymous): return "maya"
 * 2. Check Polar subscription via the Polar component
 * 3. If active premium subscription exists: return "moksha"
 * 4. If past_due: keep premium access for grace period
 * 5. If canceled but not expired: keep premium access until period end
 * 6. If revoked or no subscription: return "maya"
 *
 * @param sessionId - The anonymous session UUID
 * @param userId - Optional authenticated user ID
 * @returns Object with tier name and subscription metadata
 */
export const getCurrentTier = query({
  args: {
    sessionId: v.string(),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, { sessionId, userId }) => {
    // Anonymous users are always on the free tier
    if (!userId) {
      return {
        tier: DEFAULT_TIER,
        sessionId,
        isAuthenticated: false,
        subscription: null,
      };
    }

    try {
      // Look up the user's current subscription via Polar component
      const subscription = await polar.getCurrentSubscription(ctx, {
        userId: userId as string,
      });

      if (!subscription) {
        return {
          tier: DEFAULT_TIER,
          sessionId,
          isAuthenticated: true,
          subscription: null,
        };
      }

      // Resolve tier from productKey
      const productKey = subscription.productKey as string | undefined;
      const status = subscription.status;
      const premiumTier = isUnlimitedSubscriptionKey(productKey)
        ? "moksha"
        : DEFAULT_TIER;

      // Active or trialing subscription — premium users map to Moksha.
      if (status === "active" || status === "trialing") {
        return {
          tier: premiumTier,
          sessionId,
          isAuthenticated: true,
          subscription: {
            status,
            productKey,
            currentPeriodEnd: subscription.currentPeriodEnd,
          },
        };
      }

      // Past due — grace period, keep current tier
      if (status === "past_due") {
        return {
          tier: premiumTier,
          sessionId,
          isAuthenticated: true,
          subscription: {
            status,
            productKey,
            currentPeriodEnd: subscription.currentPeriodEnd,
          },
        };
      }

      // Canceled but not yet expired — keep tier until period end
      if (status === "canceled" && subscription.currentPeriodEnd) {
        const periodEnd = new Date(subscription.currentPeriodEnd).getTime();
        if (Date.now() < periodEnd) {
          return {
            tier: premiumTier,
            sessionId,
            isAuthenticated: true,
            subscription: {
              status,
              productKey,
              currentPeriodEnd: subscription.currentPeriodEnd,
            },
          };
        }
      }

      // Revoked or expired — fall back to free
      return {
        tier: DEFAULT_TIER,
        sessionId,
        isAuthenticated: true,
        subscription: {
          status,
          productKey,
          currentPeriodEnd: subscription.currentPeriodEnd ?? null,
        },
      };
    } catch (error) {
      // If Polar lookup fails (e.g. component not yet synced),
      // default to maya tier to avoid blocking users
      console.error("Failed to resolve subscription tier:", error);
      return {
        tier: DEFAULT_TIER,
        sessionId,
        isAuthenticated: true,
        subscription: null,
      };
    }
  },
});
