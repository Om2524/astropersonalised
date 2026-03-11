"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useApp } from "@/app/store";
import { useSubscription } from "@/app/hooks/useSubscription";
import { Bookmark, BookmarkX, Loader2, Lock } from "lucide-react";
import Link from "next/link";
import type { Id } from "../../../../convex/_generated/dataModel";
import AuthWall from "@/app/components/AuthWall";

export default function SavedReadingsPage() {
  const { sessionId } = useApp();
  const subscription = useSubscription(sessionId);
  const toggleSave = useMutation(api.functions.readings.toggleSave);

  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [showAuth, setShowAuth] = useState(false);

  // Saved readings require auth - list by session for now
  const readings = useQuery(
    api.functions.readings.listBySession,
    sessionId ? { sessionId } : "skip"
  );

  // Filter to only saved ones
  const savedReadings = readings?.filter((r) => r.isSaved) ?? [];

  // Check if user is authenticated
  if (!subscription.loading && !subscription.isAuthenticated) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-4">
        <div className="max-w-md glass-section p-8 text-center">
          <Lock className="mx-auto h-12 w-12 text-text-secondary/30 mb-4" />
          <h2 className="mb-2 text-xl font-semibold text-text-primary">
            Saved Readings
          </h2>
          <p className="mb-6 text-sm text-text-secondary">
            Sign in to save and access your bookmarked readings.
          </p>
          <button
            onClick={() => setShowAuth(true)}
            className="inline-block rounded-xl bg-accent px-6 py-2.5 text-sm font-medium text-white hover:brightness-110"
          >
            Sign In
          </button>
        </div>
        <AuthWall
          isOpen={showAuth}
          onClose={() => setShowAuth(false)}
          sessionId={sessionId}
          reason="Sign in to view saved readings"
        />
      </div>
    );
  }

  const loading = readings === undefined;

  const handleUnsave = async (readingId: string) => {
    setTogglingId(readingId);
    try {
      await toggleSave({ readingId: readingId as Id<"readings"> });
    } catch {
      /* silent */
    } finally {
      setTogglingId(null);
    }
  };

  function formatDate(timestamp: number) {
    try {
      return new Date(timestamp).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return "";
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center px-4 py-8">
      <div className="w-full max-w-2xl mb-4">
        <Link
          href="/chat"
          className="text-sm text-text-secondary hover:text-accent transition-colors"
        >
          &larr; Back to Chat
        </Link>
      </div>

      <h1 className="mb-6 text-2xl font-bold text-text-primary">
        Saved Readings
      </h1>

      {loading ? (
        <div className="flex w-full max-w-2xl flex-col items-center gap-4 glass-section p-8">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
          <p className="text-sm text-text-secondary">
            Loading your saved readings...
          </p>
          <div className="w-full space-y-3 mt-2">
            {Array.from({ length: 3 }, (_, i) => (
              <div
                key={i}
                className="h-24 w-full animate-pulse rounded-xl bg-black/5"
              />
            ))}
          </div>
        </div>
      ) : savedReadings.length === 0 ? (
        <div className="flex w-full max-w-2xl flex-col items-center gap-3 glass-section p-10 text-center">
          <Bookmark className="h-10 w-10 text-text-secondary/30" />
          <p className="text-text-secondary">
            No saved readings yet. Ask a question and bookmark it.
          </p>
          <Link
            href="/chat"
            className="mt-2 inline-block rounded-xl bg-accent px-5 py-2 text-sm font-medium text-white hover:brightness-110"
          >
            Start a Reading
          </Link>
        </div>
      ) : (
        <div className="w-full max-w-2xl space-y-3">
          {savedReadings.map((r) => {
            let readingData: { direct_answer?: string } = {};
            try {
              readingData = JSON.parse(r.reading);
            } catch {
              /* skip */
            }
            const directAnswer = readingData.direct_answer ?? "";

            return (
              <div key={r._id} className="glass-section p-5 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="mb-2 font-medium text-text-primary">
                      {r.query}
                    </p>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-accent/12 px-2.5 py-0.5 text-[11px] font-medium text-accent">
                        {r.method}
                      </span>
                      <span className="rounded-full bg-black/5 px-2.5 py-0.5 text-[11px] font-medium text-text-secondary">
                        {r.domain}
                      </span>
                    </div>
                    {directAnswer && (
                      <p className="mb-2 text-sm leading-relaxed text-text-secondary">
                        {directAnswer.length > 100
                          ? directAnswer.slice(0, 100) + "..."
                          : directAnswer}
                      </p>
                    )}
                    <p className="text-xs text-text-secondary/40">
                      Saved {formatDate(r.createdAt)}
                    </p>
                  </div>
                  <button
                    onClick={() => handleUnsave(r._id)}
                    disabled={togglingId === r._id}
                    className="shrink-0 rounded-lg p-2 text-accent transition-colors hover:bg-black/5 disabled:opacity-50"
                    aria-label="Unsave reading"
                    title="Remove from saved"
                  >
                    {togglingId === r._id ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <BookmarkX className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
