"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

const TIER_FEATURES: Record<
  string,
  { canCompare: boolean; canWeekly: boolean }
> = {
  maya: { canCompare: false, canWeekly: false },
  moksha: { canCompare: true, canWeekly: true },
};

export function useSubscription(
  sessionId: string,
  userId?: Id<"users"> | null
) {
  const fallbackLimit = userId ? 5 : 1;
  const tierInfo = useQuery(
    api.functions.subscriptions.getCurrentTier,
    sessionId
      ? {
          sessionId,
          userId: userId ?? undefined,
        }
      : "skip"
  );

  const tier = tierInfo?.tier ?? "maya";

  const usageInfo = useQuery(
    api.functions.queryUsage.checkLimit,
    sessionId
      ? {
          sessionId,
          userId: userId ?? undefined,
          tier,
        }
      : "skip"
  );

  const features = TIER_FEATURES[tier] ?? TIER_FEATURES.maya;

  return {
    tier,
    isAuthenticated: tierInfo?.isAuthenticated ?? false,
    limit: usageInfo?.limit ?? fallbackLimit,
    used: usageInfo?.used ?? 0,
    remaining: usageInfo?.remaining ?? fallbackLimit,
    allowed: usageInfo?.allowed ?? true,
    resetsAt: usageInfo?.resetsAt ?? null,
    isUnlimited: usageInfo?.isUnlimited ?? false,
    freeRemaining: usageInfo?.freeRemaining ?? fallbackLimit,
    creditBalance: usageInfo?.creditBalance ?? 0,
    messagesAvailable: usageInfo?.messagesAvailable ?? fallbackLimit,
    canCompare: features.canCompare,
    canWeekly: features.canWeekly,
    loading: tierInfo === undefined || usageInfo === undefined,
  };
}
