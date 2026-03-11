"use client";

import type { HouseInfo } from "@/app/types";

const PLANET_SYMBOLS: Record<string, string> = {
  Sun: "☉", Moon: "☽", Mercury: "☿", Venus: "♀",
  Mars: "♂", Jupiter: "♃", Saturn: "♄",
  Rahu: "☊", Ketu: "☋",
};

export default function HouseRelevance({ houses }: { houses: HouseInfo[] }) {
  if (!houses?.length) return null;

  return (
    <div className="mb-4 animate-fade-in">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-text-secondary/60">
        Relevant Houses
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {houses.map((h) => (
          <div
            key={h.number}
            className="glass-card flex flex-col items-center gap-1 px-3.5 py-2.5 min-w-[90px]"
          >
            <div className="flex items-baseline gap-1">
              <span className="text-base font-bold text-text-primary">H{h.number}</span>
            </div>
            <div className="text-[10px] font-medium text-accent">{h.significance}</div>
            <div className="text-[10px] text-text-secondary">{h.sign}</div>
            {h.planets_in.length > 0 && (
              <div className="flex gap-1 mt-0.5">
                {h.planets_in.map((p) => (
                  <span
                    key={p}
                    className="text-[10px] font-medium text-text-primary"
                    title={p}
                  >
                    {PLANET_SYMBOLS[p] || p.slice(0, 2)}
                  </span>
                ))}
              </div>
            )}
            <div className="text-[9px] text-text-secondary/60">Lord: {h.lord}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
