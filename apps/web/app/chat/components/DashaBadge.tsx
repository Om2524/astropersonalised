"use client";

import type { DashaContext } from "@/app/types";

const PLANET_SYMBOLS: Record<string, string> = {
  Sun: "☉", Moon: "☽", Mercury: "☿", Venus: "♀",
  Mars: "♂", Jupiter: "♃", Saturn: "♄",
  Rahu: "☊", Ketu: "☋",
};

export default function DashaBadge({ dasha }: { dasha: DashaContext }) {
  if (!dasha) return null;

  return (
    <div className="mb-4 animate-fade-in">
      <div className="rounded-xl bg-accent/6 border border-accent/15 px-4 py-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm">📅</span>
          <span className="text-xs font-semibold text-text-primary">Current Dasha Period</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-text-secondary">
          <span>
            <span className="font-medium text-text-primary">Maha:</span>{" "}
            {PLANET_SYMBOLS[dasha.maha_lord] || ""} {dasha.maha_lord}
            {dasha.maha_lord_house != null && (
              <span className="text-text-secondary/60"> (H{dasha.maha_lord_house})</span>
            )}
          </span>
          {dasha.antar_lord && (
            <span>
              <span className="font-medium text-text-primary">Antar:</span>{" "}
              {PLANET_SYMBOLS[dasha.antar_lord] || ""} {dasha.antar_lord}
              {dasha.antar_lord_house != null && (
                <span className="text-text-secondary/60"> (H{dasha.antar_lord_house})</span>
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
