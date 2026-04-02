"use client";

import Link from "next/link";

interface UsageIndicatorProps {
  messagesAvailable: number | null;
  freeRemaining: number;
  creditBalance: number;
  tier: string;
  isUnlimited: boolean;
  resetsAt: number | null;
}

export default function UsageIndicator({
  messagesAvailable,
  freeRemaining,
  creditBalance,
  tier,
  isUnlimited,
  resetsAt,
}: UsageIndicatorProps) {
  let resetLabel = "";
  if (resetsAt) {
    const diff = resetsAt - Date.now();
    if (diff > 0) {
      const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
      resetLabel = days === 1 ? "Free allowance resets in 1 day" : `Free allowance resets in ${days} days`;
    }
  }

  if (isUnlimited) {
    return (
      <div className="flex items-center gap-2 text-[11px]">
        <span className="rounded-full bg-yellow-500/12 px-2 py-0.5 font-medium text-yellow-600">
          Unlimited messages
        </span>
      </div>
    );
  }

  const exhausted = (messagesAvailable ?? 0) <= 0;
  const secondaryLabel = creditBalance > 0
    ? `${freeRemaining} free + ${creditBalance} bundle`
    : `${freeRemaining} free this week`;

  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span
        className={`select-none ${exhausted ? "text-red-500 font-medium" : "text-text-secondary/60"}`}
      >
        {(messagesAvailable ?? 0)} messages left
      </span>

      <span className="text-text-secondary/35">{secondaryLabel}</span>

      {resetLabel && exhausted && (
        <span className="text-text-secondary/35">{resetLabel}</span>
      )}

      {exhausted && tier === "maya" && (
        <Link href="/pricing" className="text-accent font-medium hover:underline">
          Buy pack
        </Link>
      )}
    </div>
  );
}
