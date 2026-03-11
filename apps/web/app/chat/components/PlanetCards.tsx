"use client";

import type { PlanetPlacement } from "@/app/types";

const SIGN_SYMBOLS: Record<string, string> = {
  Aries: "♈", Taurus: "♉", Gemini: "♊", Cancer: "♋",
  Leo: "♌", Virgo: "♍", Libra: "♎", Scorpio: "♏",
  Sagittarius: "♐", Capricorn: "♑", Aquarius: "♒", Pisces: "♓",
};

const DIGNITY_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  exalted: { color: "text-emerald-700", bg: "bg-emerald-500/15", label: "Exalted" },
  own: { color: "text-emerald-600", bg: "bg-emerald-500/10", label: "Own Sign" },
  friendly: { color: "text-blue-600", bg: "bg-blue-500/10", label: "Friendly" },
  neutral: { color: "text-text-secondary", bg: "bg-black/5", label: "Neutral" },
  enemy: { color: "text-amber-600", bg: "bg-amber-500/10", label: "Enemy" },
  debilitated: { color: "text-red-600", bg: "bg-red-500/10", label: "Debilitated" },
};

function PlanetCard({ planet }: { planet: PlanetPlacement }) {
  const dignity = DIGNITY_CONFIG[planet.dignity] || DIGNITY_CONFIG.neutral;
  const signSymbol = SIGN_SYMBOLS[planet.sign] || "";

  return (
    <div className="glass-card flex flex-col items-center gap-1.5 px-4 py-3 min-w-[100px]">
      <div className="text-lg font-medium text-text-primary">
        {planet.symbol || planet.name.slice(0, 2)}
      </div>
      <div className="text-xs font-semibold text-text-primary">{planet.name}</div>
      {planet.house != null && (
        <div className="text-[10px] text-text-secondary">
          House {planet.house}
        </div>
      )}
      <div className="text-[10px] text-text-secondary">
        {planet.sign} {signSymbol}
      </div>
      <span
        className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${dignity.bg} ${dignity.color}`}
      >
        {dignity.label}
      </span>
    </div>
  );
}

export default function PlanetCards({ planets }: { planets: PlanetPlacement[] }) {
  if (!planets?.length) return null;

  return (
    <div className="mb-4 animate-fade-in">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-text-secondary/60">
        Key Planets
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {planets.map((p) => (
          <PlanetCard key={p.name} planet={p} />
        ))}
      </div>
    </div>
  );
}
