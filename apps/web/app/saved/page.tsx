"use client";

import { useEffect, useState, useCallback } from "react";
import { getSavedReadings, toggleSaveReading } from "@/app/api";
import { Bookmark, BookmarkX, Loader2, RefreshCw } from "lucide-react";
import Link from "next/link";

interface SavedReading {
  id: string; query: string; method_used: string; domain: string;
  confidence: string; direct_answer: string; saved_at: string;
}

const SESSION_ID = "local-session";

export default function SavedReadingsPage() {
  const [readings, setReadings] = useState<SavedReading[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchSaved = useCallback(async () => {
    setLoading(true); setError(null);
    try { const data = await getSavedReadings(SESSION_ID); setReadings(Array.isArray(data) ? data : data.readings ?? []); }
    catch (err) { setError((err as Error).message || "Failed to load saved readings"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchSaved(); }, [fetchSaved]);

  const handleUnsave = async (readingId: string) => {
    setTogglingId(readingId);
    try { await toggleSaveReading(readingId); setReadings((prev) => prev.filter((r) => r.id !== readingId)); }
    catch { /* silent */ }
    finally { setTogglingId(null); }
  };

  function formatDate(dateStr: string) {
    try { return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
    catch { return dateStr; }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center px-4 py-8">
      <div className="w-full max-w-2xl mb-4">
        <Link href="/chat" className="text-sm text-text-secondary hover:text-accent transition-colors">&larr; Back to Chat</Link>
      </div>

      <h1 className="mb-6 text-2xl font-bold text-text-primary">Saved Readings</h1>

      {loading ? (
        <div className="flex w-full max-w-2xl flex-col items-center gap-4 glass-section p-8">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
          <p className="text-sm text-text-secondary">Loading your saved readings...</p>
          <div className="w-full space-y-3 mt-2">
            {Array.from({ length: 3 }, (_, i) => <div key={i} className="h-24 w-full animate-pulse rounded-xl bg-black/5" />)}
          </div>
        </div>
      ) : error ? (
        <div className="flex w-full max-w-2xl flex-col items-center gap-4 glass-section p-8 text-center">
          <p className="text-sm text-red-600">{error}</p>
          <button onClick={fetchSaved} className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white hover:brightness-110"><RefreshCw className="h-4 w-4" />Retry</button>
        </div>
      ) : readings.length === 0 ? (
        <div className="flex w-full max-w-2xl flex-col items-center gap-3 glass-section p-10 text-center">
          <Bookmark className="h-10 w-10 text-text-secondary/30" />
          <p className="text-text-secondary">No saved readings yet. Ask a question and bookmark it.</p>
          <Link href="/chat" className="mt-2 inline-block rounded-xl bg-accent px-5 py-2 text-sm font-medium text-white hover:brightness-110">Start a Reading</Link>
        </div>
      ) : (
        <div className="w-full max-w-2xl space-y-3">
          {readings.map((r) => (
            <div key={r.id} className="glass-section p-5 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="mb-2 font-medium text-text-primary">{r.query}</p>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-accent/12 px-2.5 py-0.5 text-[11px] font-medium text-accent">{r.method_used}</span>
                    <span className="rounded-full bg-black/5 px-2.5 py-0.5 text-[11px] font-medium text-text-secondary">{r.domain}</span>
                    <span className="text-[11px] text-text-secondary/60">{r.confidence} confidence</span>
                  </div>
                  <p className="mb-2 text-sm leading-relaxed text-text-secondary">{r.direct_answer.length > 100 ? r.direct_answer.slice(0, 100) + "..." : r.direct_answer}</p>
                  <p className="text-xs text-text-secondary/40">Saved {formatDate(r.saved_at)}</p>
                </div>
                <button onClick={() => handleUnsave(r.id)} disabled={togglingId === r.id} className="shrink-0 rounded-lg p-2 text-accent transition-colors hover:bg-black/5 disabled:opacity-50" aria-label="Unsave reading" title="Remove from saved">
                  {togglingId === r.id ? <Loader2 className="h-5 w-5 animate-spin" /> : <BookmarkX className="h-5 w-5" />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
