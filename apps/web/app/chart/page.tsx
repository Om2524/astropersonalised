"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/app/store";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import type { PlanetPosition, HouseCusp, Aspect } from "@/app/types";

const PLANET_COLORS: Record<string, string> = {
  Sun: "#FFD700", Moon: "#8B8BAE", Mercury: "#4CAF50", Venus: "#E91E63",
  Mars: "#FF5722", Jupiter: "#FF9800", Saturn: "#4682B4", Rahu: "#607D8B", Ketu: "#795548",
};

const ASPECT_COLORS: Record<string, string> = {
  conjunction: "#FFD700", trine: "#22C55E", square: "#EF4444",
  opposition: "#EF4444", sextile: "#3B82F6",
};

function formatDegree(deg: number): string {
  const d = Math.floor(deg);
  const m = Math.round((deg - d) * 60);
  return `${d}\u00B0${m}\u2032`;
}

function qualityBadge(quality: string) {
  const colors: Record<string, string> = {
    exact: "bg-green-500/15 text-green-700",
    approximate: "bg-yellow-500/15 text-yellow-700",
    unknown: "bg-red-500/15 text-red-700",
  };
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${colors[quality] ?? "bg-black/5 text-text-secondary"}`}>
      {quality}
    </span>
  );
}

function signOfDegree(deg: number): { sign: string; degree: number } {
  const signs = ["Aries","Taurus","Gemini","Cancer","Leo","Virgo","Libra","Scorpio","Sagittarius","Capricorn","Aquarius","Pisces"];
  const idx = Math.floor(deg / 30) % 12;
  return { sign: signs[idx], degree: deg % 30 };
}

export default function ChartPage() {
  const router = useRouter();
  const { chart } = useApp();
  const [vedic, setVedic] = useState(true);

  useEffect(() => { if (!chart) router.replace("/onboarding"); }, [chart, router]);
  if (!chart) return null;

  const planets: PlanetPosition[] = vedic ? chart.sidereal_planets : chart.tropical_planets;
  const houses: HouseCusp[] = vedic ? chart.houses_whole_sign : chart.houses_placidus;
  const aspects: Aspect[] = chart.aspects;
  const ascDeg = vedic ? chart.ascendant_sidereal : chart.ascendant_tropical;
  const ascInfo = signOfDegree(ascDeg);
  const sun = planets.find((p) => p.name === "Sun");
  const moon = planets.find((p) => p.name === "Moon");

  const housePlanets: Record<number, PlanetPosition[]> = {};
  for (const p of planets) {
    if (p.house != null) {
      if (!housePlanets[p.house]) housePlanets[p.house] = [];
      housePlanets[p.house].push(p);
    }
  }

  let dashaProgress: number | null = null;
  if (chart.vimshottari_dasha) {
    const d = chart.vimshottari_dasha;
    const start = new Date(d.maha_start).getTime();
    const end = new Date(d.maha_end).getTime();
    const now = Date.now();
    if (end > start) dashaProgress = Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
  }

  return (
    <div className="min-h-dvh">
      {/* Top bar */}
      <div className="sticky top-0 z-10 glass-panel border-b border-white/20">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <Link href="/chat" className="rounded-lg p-1.5 text-text-secondary transition-colors hover:bg-white/20 hover:text-text-primary">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <h1 className="flex-1 text-lg font-semibold text-text-primary">My Birth Chart</h1>
          {qualityBadge(chart.birth_time_quality)}
        </div>
      </div>

      <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
        {/* View toggle */}
        <div className="flex items-center justify-center">
          <div className="inline-flex rounded-xl bg-white/25 p-0.5 border border-white/30">
            <button onClick={() => setVedic(true)} className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${vedic ? "bg-accent text-white" : "text-text-secondary hover:text-text-primary"}`}>
              Vedic (Sidereal)
            </button>
            <button onClick={() => setVedic(false)} className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${!vedic ? "bg-accent text-white" : "text-text-secondary hover:text-text-primary"}`}>
              Western (Tropical)
            </button>
          </div>
        </div>

        {/* Chart Summary */}
        <section className="glass-section p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-accent">Chart Summary</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <SummaryItem label="Ascendant" value={`${ascInfo.sign} ${formatDegree(ascInfo.degree)}`} />
            <SummaryItem label="Sun Sign" value={sun ? sun.sign : "\u2014"} sub={sun?.nakshatra} />
            <SummaryItem label="Moon Sign" value={moon ? moon.sign : "\u2014"} sub={moon?.nakshatra} />
            {chart.vimshottari_dasha && <SummaryItem label="Current Dasha" value={`${chart.vimshottari_dasha.maha_lord} Maha`} sub={chart.vimshottari_dasha.antar_lord ? `${chart.vimshottari_dasha.antar_lord} Antar` : undefined} />}
            <SummaryItem label="Ayanamsa" value={`${chart.ayanamsa.toFixed(4)}\u00B0`} />
          </div>
        </section>

        {/* Planetary Positions */}
        <section className="glass-section p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-accent">Planetary Positions</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-black/5 text-left text-xs uppercase tracking-wider text-text-secondary">
                  <th className="pb-2 pr-3">Planet</th><th className="pb-2 pr-3">Sign</th><th className="pb-2 pr-3">Degree</th>
                  <th className="pb-2 pr-3">Nakshatra</th><th className="pb-2 pr-3">House</th><th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {planets.map((p) => (
                  <tr key={p.name} className="text-text-primary">
                    <td className="py-2 pr-3"><span className="flex items-center gap-2"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PLANET_COLORS[p.name] ?? "#888" }} />{p.name}</span></td>
                    <td className="py-2 pr-3 text-text-secondary">{p.sign}</td>
                    <td className="py-2 pr-3 font-mono text-xs text-text-secondary">{formatDegree(p.sign_degree)}</td>
                    <td className="py-2 pr-3 text-text-secondary">{p.nakshatra ? `${p.nakshatra}${p.nakshatra_pada != null ? ` P${p.nakshatra_pada}` : ""}` : "\u2014"}</td>
                    <td className="py-2 pr-3 text-text-secondary">{p.house ?? "\u2014"}</td>
                    <td className="py-2">{p.retrograde && <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-xs font-medium text-red-600">R</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Houses */}
        <section className="glass-section p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-accent">Houses</h2>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {houses.map((h) => (
              <div key={h.house_number} className="rounded-lg bg-white/20 border border-white/30 p-3">
                <div className="mb-1 text-xs font-medium text-accent">House {h.house_number}</div>
                <div className="text-sm font-medium text-text-primary">{h.sign}</div>
                {h.lord && <div className="text-xs text-text-secondary">Lord: {h.lord}</div>}
                {housePlanets[h.house_number] && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {housePlanets[h.house_number].map((p) => (
                      <span key={p.name} className="inline-flex items-center gap-1 rounded-full bg-black/5 px-1.5 py-0.5 text-[10px] text-text-secondary">
                        <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: PLANET_COLORS[p.name] ?? "#888" }} />{p.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Aspects */}
        {aspects.length > 0 && (
          <section className="glass-section p-5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-accent">Aspects</h2>
            <div className="space-y-1.5">
              {aspects.map((a, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg bg-white/15 px-3 py-2 text-sm">
                  <span className="font-medium text-text-primary">{a.planet1}</span>
                  <span className="rounded px-1.5 py-0.5 text-xs font-medium capitalize" style={{ backgroundColor: (ASPECT_COLORS[a.aspect_type] ?? "#888") + "18", color: ASPECT_COLORS[a.aspect_type] ?? "#888" }}>{a.aspect_type}</span>
                  <span className="font-medium text-text-primary">{a.planet2}</span>
                  <span className="ml-auto font-mono text-xs text-text-secondary">{a.orb.toFixed(1)}&deg;</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${a.applying ? "bg-blue-500/12 text-blue-600" : "bg-black/5 text-text-secondary"}`}>{a.applying ? "Applying" : "Separating"}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Dasha Timeline */}
        {chart.vimshottari_dasha && (
          <section className="glass-section p-5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-accent">Dasha Timeline</h2>
            <div className="space-y-4">
              <div>
                <div className="mb-1 flex items-baseline justify-between">
                  <span className="text-sm font-medium text-text-primary">Maha Dasha &mdash; {chart.vimshottari_dasha.maha_lord}</span>
                  <span className="text-xs text-text-secondary">{new Date(chart.vimshottari_dasha.maha_start).toLocaleDateString()} &ndash; {new Date(chart.vimshottari_dasha.maha_end).toLocaleDateString()}</span>
                </div>
                {dashaProgress != null && (
                  <div className="h-2 overflow-hidden rounded-full bg-black/5">
                    <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${dashaProgress}%` }} />
                  </div>
                )}
              </div>
              {chart.vimshottari_dasha.antar_lord && chart.vimshottari_dasha.antar_start && chart.vimshottari_dasha.antar_end && (
                <div>
                  <div className="mb-1 flex items-baseline justify-between">
                    <span className="text-sm font-medium text-text-primary">Antar Dasha &mdash; {chart.vimshottari_dasha.antar_lord}</span>
                    <span className="text-xs text-text-secondary">{new Date(chart.vimshottari_dasha.antar_start).toLocaleDateString()} &ndash; {new Date(chart.vimshottari_dasha.antar_end).toLocaleDateString()}</span>
                  </div>
                  {(() => {
                    const s = new Date(chart.vimshottari_dasha.antar_start!).getTime();
                    const e = new Date(chart.vimshottari_dasha.antar_end!).getTime();
                    const pct = e > s ? Math.min(100, Math.max(0, ((Date.now() - s) / (e - s)) * 100)) : 0;
                    return (
                      <div className="h-2 overflow-hidden rounded-full bg-black/5">
                        <div className="h-full rounded-full bg-indigo transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function SummaryItem({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="text-xs text-text-secondary">{label}</div>
      <div className="text-sm font-medium text-text-primary">{value}</div>
      {sub && <div className="text-xs text-text-secondary">{sub}</div>}
    </div>
  );
}
