"use client";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { UserProfile, CanonicalChart } from "@/app/types";

interface AppState {
  profile: UserProfile | null;
  chart: CanonicalChart | null;
  setProfile: (p: UserProfile) => void;
  setChart: (c: CanonicalChart) => void;
}

const AppContext = createContext<AppState | undefined>(undefined);

const PROFILE_KEY = "shastra_profile";
const CHART_KEY = "shastra_chart";

function loadFromStorage<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function saveToStorage<T>(key: string, value: T | null) {
  if (typeof window === "undefined") return;
  try {
    if (value === null) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, JSON.stringify(value));
    }
  } catch {
    // storage full or unavailable — silently ignore
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [profile, _setProfile] = useState<UserProfile | null>(null);
  const [chart, _setChart] = useState<CanonicalChart | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage on mount
  useEffect(() => {
    _setProfile(loadFromStorage<UserProfile>(PROFILE_KEY));
    _setChart(loadFromStorage<CanonicalChart>(CHART_KEY));
    setHydrated(true);
  }, []);

  const setProfile = (p: UserProfile) => {
    _setProfile(p);
    saveToStorage(PROFILE_KEY, p);
  };

  const setChart = (c: CanonicalChart) => {
    _setChart(c);
    saveToStorage(CHART_KEY, c);
  };

  // Prevent flash of empty state before hydration
  if (!hydrated) return null;

  return (
    <AppContext.Provider value={{ profile, chart, setProfile, setChart }}>
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
