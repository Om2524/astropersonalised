"use client";

import Link from "next/link";

interface UsageIndicatorProps {
  used: number;
  limit: number;
  remaining: number;
  tier: string;
  resetsAt: number | null;
}

export default function UsageIndicator({
  used,
  limit,
  remaining,
  tier,
  resetsAt,
}: UsageIndicatorProps) {
  const percentage = limit > 0 ? Math.round((used / limit) * 100) : 0;
  const isExhausted = remaining <= 0;
  const isLow = remaining > 0 && remaining <= Math.ceil(limit * 0.2);

  let resetLabel = "";
  if (resetsAt) {
    const diff = resetsAt - Date.now();
    if (diff > 0) {
      const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
      resetLabel = days === 1 ? "Resets in 1 day" : `Resets in ${days} days`;
    }
  }

  return (
    <div className="flex items-center gap-2 text-[11px]">
      {/* Progress bar */}
      <div className="w-16 h-1.5 rounded-full bg-black/8 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            isExhausted
              ? "bg-red-500"
              : isLow
                ? "bg-yellow-500"
                : "bg-accent"
          }`}
          style={{ width: `${Math.min(100, percentage)}%` }}
        />
      </div>

      {/* Label */}
      <span
        className={`select-none ${
          isExhausted
            ? "text-red-500 font-medium"
            : "text-text-secondary/50"
        }`}
      >
        {remaining}/{limit} left
      </span>

      {/* Reset info */}
      {resetLabel && isExhausted && (
        <span className="text-text-secondary/40">{resetLabel}</span>
      )}

      {/* Upgrade link */}
      {isExhausted && tier === "maya" && (
        <Link
          href="/pricing"
          className="text-accent font-medium hover:underline"
        >
          Upgrade
        </Link>
      )}
    </div>
  );
}
