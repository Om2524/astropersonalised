"use client";

import { useEffect, useState, useCallback } from "react";
import { useAction } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useApp } from "@/app/store";
import { useSubscription } from "@/app/hooks/useSubscription";
import { ChevronLeft, ChevronRight, Loader2, RefreshCw, Lock } from "lucide-react";
import Link from "next/link";

interface DayOutlook { day_name: string; date: string; highlight: string; rating: number; }
interface WeeklyData { title: string; overview: string; days: DayOutlook[]; focus_areas: string[]; advice: string; week_start: string; }

function getMondayOfWeek(d: Date): Date {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d); monday.setDate(diff); return monday;
}

function formatWeekRange(startStr: string) {
  const start = new Date(startStr + "T00:00:00");
  const end = new Date(start); end.setDate(end.getDate() + 6);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${start.toLocaleDateString("en-US", opts)} - ${end.toLocaleDateString("en-US", { ...opts, year: "numeric" })}`;
}

function addWeeks(dateStr: string, weeks: number) {
  const d = new Date(dateStr + "T00:00:00"); d.setDate(d.getDate() + weeks * 7); return d.toISOString().split("T")[0];
}

function currentWeekStart() { return getMondayOfWeek(new Date()).toISOString().split("T")[0]; }

function ratingDots(rating: number) {
  return Array.from({ length: 5 }, (_, i) => (
    <span key={i} className={`inline-block h-2 w-2 rounded-full ${i < rating ? "bg-accent" : "bg-black/8"}`} />
  ));
}

export default function WeeklyOutlookPage() {
  const { chart, chartRaw, tone, sessionId } = useApp();
  const subscription = useSubscription(sessionId);
  const weeklyOutlookAction = useAction(api.actions.weeklyOutlook.weeklyOutlook);

  const [weekStart, setWeekStart] = useState(currentWeekStart());
  const [outlook, setOutlook] = useState<WeeklyData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOutlook = useCallback(async (ws: string) => {
    if (!chartRaw) return;
    setLoading(true); setError(null);
    try {
      const data = await weeklyOutlookAction({
        chartData: chartRaw,
        tone: tone || "practical",
      });
      setOutlook(data as WeeklyData);
    }
    catch (err) { setError((err as Error).message || "Failed to load weekly outlook"); }
    finally { setLoading(false); }
  }, [chartRaw, tone, weeklyOutlookAction]);

  useEffect(() => {
    if (chartRaw && subscription.canWeekly) fetchOutlook(weekStart);
  }, [chartRaw, weekStart, fetchOutlook, subscription.canWeekly]);

  if (!chart) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-4">
        <div className="max-w-md glass-section p-8 text-center">
          <h2 className="mb-2 text-xl font-semibold text-text-primary">No chart found</h2>
          <p className="mb-6 text-sm text-text-secondary">Complete onboarding first.</p>
          <Link href="/onboarding" className="inline-block rounded-xl bg-accent px-6 py-2.5 text-sm font-medium text-white hover:brightness-110">Go to Onboarding</Link>
        </div>
      </div>
    );
  }

  // Gate behind Dhyan/Moksha tier
  if (!subscription.loading && !subscription.canWeekly) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-4">
        <div className="max-w-md glass-section p-8 text-center">
          <Lock className="mx-auto h-12 w-12 text-text-secondary/30 mb-4" />
          <h2 className="mb-2 text-xl font-semibold text-text-primary">Weekly Outlook</h2>
          <p className="mb-6 text-sm text-text-secondary">
            Weekly outlook is available on Dhyan and Moksha plans.
          </p>
          <Link href="/pricing" className="inline-block rounded-xl bg-accent px-6 py-2.5 text-sm font-medium text-white hover:brightness-110">
            View Plans
          </Link>
        </div>
      </div>
    );
  }

  const isCurrentWeek = weekStart === currentWeekStart();

  return (
    <div className="flex min-h-dvh flex-col items-center px-4 py-8">
      <div className="w-full max-w-2xl mb-4">
        <Link href="/chat" className="text-sm text-text-secondary hover:text-accent transition-colors">&larr; Back to Chat</Link>
      </div>

      <div className="mb-6 flex items-center gap-4">
        <button onClick={() => setWeekStart(addWeeks(weekStart, -1))} className="rounded-xl bg-white/25 border border-white/30 p-2 text-text-secondary hover:text-accent"><ChevronLeft className="h-5 w-5" /></button>
        <span className="text-sm font-medium text-text-primary">{formatWeekRange(weekStart)}</span>
        <button onClick={() => !isCurrentWeek && setWeekStart(addWeeks(weekStart, 1))} disabled={isCurrentWeek} className="rounded-xl bg-white/25 border border-white/30 p-2 text-text-secondary hover:text-accent disabled:cursor-not-allowed disabled:opacity-30"><ChevronRight className="h-5 w-5" /></button>
      </div>

      {loading ? (
        <div className="flex w-full max-w-2xl flex-col items-center gap-4 glass-section p-8">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
          <p className="text-sm text-text-secondary">Charting your week ahead...</p>
          <div className="w-full space-y-3 mt-2">
            <div className="h-6 w-3/4 animate-pulse rounded bg-black/5" />
            <div className="h-16 w-full animate-pulse rounded bg-black/5" />
            {Array.from({ length: 7 }, (_, i) => <div key={i} className="h-12 w-full animate-pulse rounded bg-black/5" />)}
          </div>
        </div>
      ) : error ? (
        <div className="flex w-full max-w-2xl flex-col items-center gap-4 glass-section p-8 text-center">
          <p className="text-sm text-red-600">{error}</p>
          <button onClick={() => fetchOutlook(weekStart)} className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white hover:brightness-110"><RefreshCw className="h-4 w-4" />Retry</button>
        </div>
      ) : outlook ? (
        <div className="w-full max-w-2xl space-y-4">
          <div className="glass-section p-6">
            <h1 className="mb-3 text-2xl font-bold text-text-primary">{outlook.title}</h1>
            <p className="leading-relaxed text-text-secondary">{outlook.overview}</p>
          </div>

          <div className="space-y-2">
            {outlook.days.map((day) => {
              const isBest = day.rating >= 4;
              const isChallenging = day.rating <= 2;
              return (
                <div key={day.date} className={`rounded-xl p-4 transition-colors ${isBest ? "glass-section border-accent/25" : isChallenging ? "glass-section border-red-400/20" : "glass-section"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="mb-1 flex items-center gap-2">
                        <span className="text-sm font-semibold text-text-primary">{day.day_name}</span>
                        <span className="text-xs text-text-secondary/60">{day.date}</span>
                      </div>
                      <p className="text-sm text-text-secondary">{day.highlight}</p>
                    </div>
                    <div className="flex items-center gap-1 pt-1">{ratingDots(day.rating)}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {outlook.focus_areas.length > 0 && (
            <div className="glass-section p-5">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-secondary/60">Focus Areas</p>
              <div className="flex flex-wrap gap-2">
                {outlook.focus_areas.map((area) => <span key={area} className="rounded-full bg-accent/12 px-3 py-1 text-xs font-medium text-accent">{area}</span>)}
              </div>
            </div>
          )}

          <div className="glass-section border-accent/20 p-5">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-accent">Weekly Advice</p>
            <p className="text-sm leading-relaxed text-text-primary">{outlook.advice}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
