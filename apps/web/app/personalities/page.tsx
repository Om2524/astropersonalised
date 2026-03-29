"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAction, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { ArrowLeft, Loader2, Users } from "lucide-react";
import Link from "next/link";
import { useApp } from "@/app/store";
import { useSubscription } from "@/app/hooks/useSubscription";

interface PersonalityMatch {
  name: string; category: string; match_percentage: number;
  birth_date: string; description: string; shared_features: string[];
}

const CATEGORY_COLORS: Record<string, string> = {
  Science: "#4CAF50", Music: "#9C27B0", Film: "#FF9800", Sports: "#2196F3",
  Literature: "#795548", Business: "#607D8B", Activism: "#F44336", Art: "#E91E63",
};

function getCategoryColor(category: string): string { return CATEGORY_COLORS[category] || "#607D8B"; }

function SkeletonCard() {
  return (
    <div className="glass-section p-5 animate-pulse">
      <div className="h-6 w-40 rounded bg-black/5 mb-3" />
      <div className="h-5 w-20 rounded-full bg-black/5 mb-4" />
      <div className="h-3 w-full rounded bg-black/5 mb-2" />
      <div className="h-2 w-full rounded-full bg-black/5 mb-4"><div className="h-full w-3/4 rounded-full bg-black/8" /></div>
      <div className="h-4 w-full rounded bg-black/5 mb-2" />
      <div className="h-4 w-3/4 rounded bg-black/5 mb-4" />
      <div className="flex gap-2"><div className="h-5 w-20 rounded-full bg-black/5" /><div className="h-5 w-24 rounded-full bg-black/5" /></div>
    </div>
  );
}

function MatchBar({ percentage }: { percentage: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 rounded-full bg-black/5 overflow-hidden">
        <div className="h-full rounded-full bg-accent transition-all duration-700" style={{ width: `${percentage}%` }} />
      </div>
      <span className="text-sm font-semibold text-accent tabular-nums">{percentage}%</span>
    </div>
  );
}

function PersonalityCard({ person }: { person: PersonalityMatch }) {
  const color = getCategoryColor(person.category);
  return (
    <div className="glass-section p-5 transition-all hover:shadow-lg hover:shadow-black/5">
      <h3 className="text-lg font-semibold text-text-primary mb-2">{person.name}</h3>
      <span className="inline-block rounded-full px-3 py-0.5 text-xs font-medium mb-4" style={{ backgroundColor: `${color}15`, color }}>{person.category}</span>
      <MatchBar percentage={person.match_percentage} />
      <p className="text-xs text-text-secondary mt-3 mb-2">Born: {person.birth_date}</p>
      <p className="text-sm text-text-secondary leading-relaxed mb-4">{person.description}</p>
      {person.shared_features.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {person.shared_features.map((feature) => <span key={feature} className="rounded-full bg-accent/10 px-2.5 py-0.5 text-xs text-accent">{feature}</span>)}
        </div>
      )}
    </div>
  );
}

export default function PersonalitiesPage() {
  const router = useRouter();
  const { chart, chartRaw, sessionId } = useApp();
  const currentUser = useQuery(api.functions.users.getCurrentUser, {});
  const subscription = useSubscription(sessionId, currentUser?._id);
  const personalityMatchAction = useAction(api.actions.personalityMatch.personalityMatch);

  const [matches, setMatches] = useState<PersonalityMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!chart || !chartRaw) { router.replace("/onboarding"); return; }
    let cancelled = false;
    (async () => {
      try {
        const data = await personalityMatchAction({
          chartData: chartRaw,
          tier: subscription.tier,
        });
        if (!cancelled) {
          const result = data as Record<string, unknown>;
          setMatches(
            (result.matches ?? result.personalities ?? data) as PersonalityMatch[]
          );
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Something went wrong");
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [chart, chartRaw, router, personalityMatchAction, subscription.tier]);

  if (!chart) return null;

  return (
    <div className="min-h-dvh px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <Link href="/chat" className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors mb-8"><ArrowLeft size={16} />Back to Chat</Link>

        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Users size={24} className="text-accent" />
            <h1 className="text-2xl font-semibold text-text-primary">Similar Personalities</h1>
          </div>
          <p className="text-text-secondary text-sm">People whose charts resonate with yours</p>
        </div>

        {error && (
          <div className="rounded-xl border border-red-400/20 bg-red-50/50 p-4 mb-6">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {loading ? Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />) : matches.map((person) => <PersonalityCard key={person.name} person={person} />)}
        </div>

        {!loading && !error && matches.length === 0 && (
          <div className="text-center py-16">
            <Users size={48} className="mx-auto text-text-secondary/30 mb-4" />
            <p className="text-text-secondary">No personality matches found. Try again later.</p>
          </div>
        )}
      </div>
    </div>
  );
}
