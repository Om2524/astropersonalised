"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useMemo,
} from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { CanonicalChart, UserProfile } from "@/app/types";

const SESSION_KEY = "shastra_session_id";

interface AppState {
  sessionId: string;
  profile: UserProfile | null;
  chart: CanonicalChart | null;
  chartRaw: string | null;
  tone: string;
  ready: boolean;
}

const AppContext = createContext<AppState | undefined>(undefined);

function getOrGenerateSessionId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [sessionId, setSessionId] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setSessionId(getOrGenerateSessionId());
    setHydrated(true);
  }, []);

  // Fetch birth profile from Convex
  const birthProfile = useQuery(
    api.functions.birthProfiles.getBySession,
    sessionId ? { sessionId } : "skip"
  );

  // Fetch chart from Convex
  const chartDoc = useQuery(
    api.functions.charts.getBySession,
    sessionId ? { sessionId } : "skip"
  );

  // Parse chart data from JSON string stored in Convex
  const chart: CanonicalChart | null = useMemo(() => {
    if (!chartDoc?.chartData) return null;
    try {
      const raw = JSON.parse(chartDoc.chartData);
      return (raw.chart ?? raw) as CanonicalChart;
    } catch {
      return null;
    }
  }, [chartDoc?.chartData]);

  // Map birth profile to UserProfile type
  const profile: UserProfile | null = useMemo(() => {
    if (!birthProfile) return null;
    return {
      date_of_birth: birthProfile.dateOfBirth,
      time_of_birth: birthProfile.timeOfBirth,
      birthplace: birthProfile.birthplace,
      birth_time_quality: birthProfile.birthTimeQuality as
        | "exact"
        | "approximate"
        | "unknown",
      tone: birthProfile.tone as
        | "practical"
        | "emotional"
        | "spiritual"
        | "concise",
    };
  }, [birthProfile]);

  const tone = profile?.tone ?? "practical";

  // Don't render until client-side hydration is complete
  if (!hydrated) return null;

  // Convex useQuery returns undefined while loading, null when no doc exists.
  // ready = queries finished AND data actually exists (not just "done loading").
  const ready =
    sessionId.length > 0 &&
    profile !== null &&
    chart !== null;

  return (
    <AppContext.Provider
      value={{
        sessionId,
        profile,
        chart,
        chartRaw: chartDoc?.chartData ?? null,
        tone,
        ready,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return ctx;
}
