"use client";

import type { YogaInfo } from "@/app/types";

const STRENGTH_CONFIG: Record<string, { color: string; bg: string; border: string }> = {
  strong: { color: "text-emerald-700", bg: "bg-emerald-500/8", border: "border-emerald-500/20" },
  moderate: { color: "text-blue-600", bg: "bg-blue-500/8", border: "border-blue-500/20" },
  weak: { color: "text-text-secondary", bg: "bg-black/3", border: "border-black/8" },
};

function YogaCard({ yoga }: { yoga: YogaInfo }) {
  const strength = STRENGTH_CONFIG[yoga.strength] || STRENGTH_CONFIG.moderate;

  return (
    <div className={`rounded-xl ${strength.bg} border ${strength.border} px-4 py-3`}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-sm">⭐</span>
        <span className="text-sm font-semibold text-text-primary">{yoga.name}</span>
        <span
          className={`ml-auto rounded-full px-2 py-0.5 text-[9px] font-semibold ${strength.color} ${strength.bg}`}
        >
          {yoga.strength.charAt(0).toUpperCase() + yoga.strength.slice(1)}
        </span>
      </div>
      <div className="flex gap-1.5 mb-1.5">
        {yoga.planets.map((p) => (
          <span
            key={p}
            className="rounded-full bg-white/40 border border-white/50 px-2 py-0.5 text-[10px] font-medium text-text-primary"
          >
            {p}
          </span>
        ))}
      </div>
      <p className="text-xs text-text-secondary leading-relaxed">{yoga.description}</p>
    </div>
  );
}

export default function YogaCards({ yogas }: { yogas: YogaInfo[] }) {
  if (!yogas?.length) return null;

  return (
    <div className="mb-4 animate-fade-in">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-text-secondary/60">
        Active Yogas
      </div>
      <div className="space-y-2">
        {yogas.map((y, i) => (
          <YogaCard key={`${y.name}-${i}`} yoga={y} />
        ))}
      </div>
    </div>
  );
}
