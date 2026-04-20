"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useMemo,
  useRef,
} from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { CanonicalChart, UserProfile } from "@/app/types";
import { syncBirthProfilePersonProperties } from "@/app/lib/posthogProfile";
import posthog from "posthog-js";

const SESSION_KEY = "shastra_session_id";

interface AppState {
  sessionId: string;
  profile: UserProfile | null;
  chart: CanonicalChart | null;
  chartRaw: string | null;
  tone: string;
  language: string;
  ready: boolean;
  dataResolved: boolean;
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
  const registerSession = useMutation(api.functions.sessions.getOrCreate);
  const migrateSession = useMutation(api.functions.users.migrateSession);
  const migrationRef = useRef<string | null>(null);

  useEffect(() => {
    const id = getOrGenerateSessionId();
    setSessionId(id);
    setHydrated(true);
    if (id) {
      registerSession({ sessionId: id }).catch(() => {
        // Session registration is best-effort and should not block the app.
      });
    }
  }, [registerSession]);

  const currentUser = useQuery(api.functions.users.getCurrentUser, {});
  const userId = currentUser?._id;

  const birthProfileByUser = useQuery(
    api.functions.birthProfiles.getByUser,
    userId ? { userId } : "skip"
  );
  const birthProfileBySession = useQuery(
    api.functions.birthProfiles.getBySession,
    sessionId ? { sessionId } : "skip"
  );

  const chartDocByUser = useQuery(
    api.functions.charts.getByUser,
    userId ? { userId } : "skip"
  );
  const chartDocBySession = useQuery(
    api.functions.charts.getBySession,
    sessionId ? { sessionId } : "skip"
  );

  const birthProfile = birthProfileByUser ?? birthProfileBySession;
  const chartDoc = chartDocByUser ?? chartDocBySession;

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
      language: (birthProfile as { language?: string }).language,
    };
  }, [birthProfile]);

  const tone = "practical";
  const language = profile?.language ?? "en";

  const profileResolved = userId
    ? birthProfileByUser !== undefined && birthProfileBySession !== undefined
    : birthProfileBySession !== undefined;
  const chartResolved = userId
    ? chartDocByUser !== undefined && chartDocBySession !== undefined
    : chartDocBySession !== undefined;
  const dataResolved = sessionId.length > 0 && profileResolved && chartResolved;

  useEffect(() => {
    if (!sessionId || !currentUser?._id) return;

    const migrationKey = `${sessionId}:${currentUser._id}`;
    if (migrationRef.current === migrationKey) return;
    migrationRef.current = migrationKey;

    migrateSession({ sessionId, userId: currentUser._id })
      .then((result) => {
        const totalMigrated = (Object.values(result.migrated) as number[]).reduce(
          (sum, count) => sum + count,
          0
        );

        if (totalMigrated > 0) {
          posthog.capture("guest_session_migrated", {
            session_id: sessionId,
            ...result.migrated,
          });
        }
      })
      .catch((error) => {
        console.error("Failed to migrate guest session:", error);
        migrationRef.current = null;
      });
  }, [currentUser?._id, migrateSession, sessionId]);

  // Identify authenticated user in PostHog
  useEffect(() => {
    if (currentUser?._id) {
      posthog.identify(currentUser._id, {
        email: currentUser.email,
        name: currentUser.name,
        authProvider: currentUser.authProvider,
        language: currentUser.language,
        createdAt: currentUser.createdAt,
      });
    }
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser?._id || !profile) return;
    syncBirthProfilePersonProperties(profile);
  }, [currentUser?._id, profile]);

  // Don't render until client-side hydration is complete
  if (!hydrated) return null;

  // Convex useQuery returns undefined while loading, null when no doc exists.
  // ready = queries finished AND data actually exists (not just "done loading").
  const ready = dataResolved && profile !== null && chart !== null;

  return (
    <AppContext.Provider
      value={{
        sessionId,
        profile,
        chart,
        chartRaw: chartDoc?.chartData ?? null,
        tone,
        language,
        ready,
        dataResolved,
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
