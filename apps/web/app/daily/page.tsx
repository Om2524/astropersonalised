"use client";

import { useEffect, useState, useCallback } from "react";
import { useAction } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useApp } from "@/app/store";
import { ChevronLeft, ChevronRight, Loader2, RefreshCw } from "lucide-react";
import Link from "next/link";

interface DailyBriefData {
  title: string; mood: string; moon_sign: string; nakshatra: string;
  summary: string; focus_area: string; tip: string; active_transits: number; date: string;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function addDays(dateStr: string, days: number) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function todayStr() { return new Date().toISOString().split("T")[0]; }

export default function DailyBriefPage() {
  const { chart, chartRaw, tone } = useApp();
  const dailyBriefAction = useAction(api.actions.dailyBrief.dailyBrief);

  const [date, setDate] = useState(todayStr());
  const [brief, setBrief] = useState<DailyBriefData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBrief = useCallback(async (targetDate: string) => {
    if (!chartRaw) return;
    setLoading(true); setError(null);
    try {
      const data = await dailyBriefAction({
        chartData: chartRaw,
        tone: tone || "practical",
      });
      setBrief(data as DailyBriefData);
    } catch (err) { setError((err as Error).message || "Failed to load daily brief"); }
    finally { setLoading(false); }
  }, [chartRaw, tone, dailyBriefAction]);

  useEffect(() => { if (chartRaw) fetchBrief(date); }, [chartRaw, date, fetchBrief]);

  if (!chart) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-4">
        <div className="max-w-md glass-section p-8 text-center">
          <h2 className="mb-2 text-xl font-semibold text-text-primary">No chart found</h2>
          <p className="mb-6 text-sm text-text-secondary">Complete onboarding first to generate your birth chart.</p>
          <Link href="/onboarding" className="inline-block rounded-xl bg-accent px-6 py-2.5 text-sm font-medium text-white transition-colors hover:brightness-110">Go to Onboarding</Link>
        </div>
      </div>
    );
  }

  const isToday = date === todayStr();

  return (
    <div className="flex min-h-dvh flex-col items-center px-4 py-8">
      <div className="w-full max-w-lg mb-4">
        <Link href="/chat" className="text-sm text-text-secondary hover:text-accent transition-colors">&larr; Back to Chat</Link>
      </div>

      <div className="mb-6 flex items-center gap-4">
        <button onClick={() => setDate(addDays(date, -1))} className="rounded-xl bg-white/25 border border-white/30 p-2 text-text-secondary transition-colors hover:text-accent" aria-label="Previous day"><ChevronLeft className="h-5 w-5" /></button>
        <span className="text-sm font-medium text-text-primary">{formatDate(date)}</span>
        <button onClick={() => !isToday && setDate(addDays(date, 1))} disabled={isToday} className="rounded-xl bg-white/25 border border-white/30 p-2 text-text-secondary transition-colors hover:text-accent disabled:cursor-not-allowed disabled:opacity-30" aria-label="Next day"><ChevronRight className="h-5 w-5" /></button>
      </div>

      {loading ? (
        <div className="flex w-full max-w-lg flex-col items-center gap-4 glass-section p-8">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
          <p className="text-sm text-text-secondary">Reading the stars for you...</p>
          <div className="w-full space-y-3 mt-2">
            <div className="h-6 w-3/4 animate-pulse rounded bg-black/5" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-black/5" />
            <div className="h-20 w-full animate-pulse rounded bg-black/5" />
          </div>
        </div>
      ) : error ? (
        <div className="flex w-full max-w-lg flex-col items-center gap-4 glass-section p-8 text-center">
          <p className="text-sm text-red-600">{error}</p>
          <button onClick={() => fetchBrief(date)} className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:brightness-110"><RefreshCw className="h-4 w-4" />Retry</button>
        </div>
      ) : brief ? (
        <div className="w-full max-w-lg space-y-4">
          <div className="glass-section p-6">
            <h1 className="mb-3 text-2xl font-bold text-accent">{brief.title}</h1>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-accent/12 px-3 py-1 text-xs font-medium text-accent">{brief.mood}</span>
            </div>
            <div className="mb-4 flex items-center gap-3 rounded-lg bg-white/20 border border-white/30 px-4 py-3">
              <span className="text-lg">&#x1F319;</span>
              <div><p className="text-sm font-medium text-text-primary">Moon in {brief.moon_sign}</p><p className="text-xs text-text-secondary">Nakshatra: {brief.nakshatra}</p></div>
            </div>
            <p className="mb-4 leading-relaxed text-text-secondary">{brief.summary}</p>
            <div className="mb-4 flex items-center gap-2">
              <span className="text-xs font-medium uppercase tracking-wider text-text-secondary/60">Focus</span>
              <span className="rounded-full bg-accent/12 px-3 py-1 text-xs font-medium text-accent">{brief.focus_area}</span>
            </div>
            <p className="text-xs text-text-secondary/60">{brief.active_transits} active transit{brief.active_transits !== 1 ? "s" : ""} today</p>
          </div>
          <div className="glass-section border-accent/20 p-5">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-accent">Tip of the Day</p>
            <p className="text-sm leading-relaxed text-text-primary">{brief.tip}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
