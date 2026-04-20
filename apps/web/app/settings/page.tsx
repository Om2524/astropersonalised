"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import {
  ArrowLeft, Calendar, Clock, MapPin, Briefcase, Heart, Sparkles, AlignLeft,
  Loader2, Trash2, AlertCircle, Crown, ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { useApp } from "@/app/store";
import { useSubscription } from "@/app/hooks/useSubscription";
import { UserProfile } from "@/app/types";
import {
  getBirthProfileAnalyticsProperties,
  syncBirthProfilePersonProperties,
} from "@/app/lib/posthogProfile";
import posthog from "posthog-js";

const TONE_OPTIONS: { value: UserProfile["tone"]; label: string; description: string; icon: typeof Briefcase }[] = [
  { value: "practical", label: "Practical", description: "Actionable advice you can apply today", icon: Briefcase },
  { value: "emotional", label: "Emotional", description: "Warm, empathetic, and supportive guidance", icon: Heart },
  { value: "spiritual", label: "Spiritual", description: "Deeper meaning, karma, and soul purpose", icon: Sparkles },
  { value: "concise", label: "Concise", description: "Short, direct answers — no fluff", icon: AlignLeft },
];

const TIER_LABELS: Record<string, string> = {
  maya: "Maya (Free)",
  moksha: "Moksha Unlimited",
};

export default function SettingsPage() {
  const router = useRouter();
  const { profile, sessionId } = useApp();
  const currentUser = useQuery(api.functions.users.getCurrentUser, {});
  const subscription = useSubscription(sessionId, currentUser?._id);
  const computeChartAction = useAction(api.actions.computeChart.computeChart);
  const updateTone = useMutation(api.functions.birthProfiles.updateTone);
  const generatePortalUrl = useAction(api.polar.generateCustomerPortalUrl);
  const [portalLoading, setPortalLoading] = useState(false);

  const [dob, setDob] = useState(profile?.date_of_birth ?? "");
  const [tob, setTob] = useState(profile?.time_of_birth ?? "");
  const [birthplace, setBirthplace] = useState(profile?.birthplace ?? "");
  const [timeQuality, setTimeQuality] = useState<UserProfile["birth_time_quality"]>(profile?.birth_time_quality ?? "exact");
  const [tone, setTone] = useState<UserProfile["tone"]>(profile?.tone ?? "practical");
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updateSuccess, setUpdateSuccess] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  async function handleUpdateChart(e: FormEvent) {
    e.preventDefault();
    setUpdating(true);
    setUpdateError(null);
    setUpdateSuccess(false);

    try {
      await computeChartAction({
        sessionId,
        userId: currentUser?._id ?? undefined,
        dateOfBirth: dob,
        timeOfBirth: tob || undefined,
        birthplace: birthplace.trim(),
        latitude: 0,
        longitude: 0,
        timezone: "UTC",
        birthTimeQuality: timeQuality,
        tone,
        language: profile?.language ?? "en",
      });

      const updatedProfile = {
        date_of_birth: dob,
        time_of_birth: tob || undefined,
        birthplace: birthplace.trim(),
        birth_time_quality: timeQuality,
        tone,
        language: profile?.language ?? "en",
      } satisfies UserProfile;

      posthog.capture("birth_profile_updated", {
        ...getBirthProfileAnalyticsProperties(updatedProfile),
        source: "settings",
      });
      syncBirthProfilePersonProperties(updatedProfile);
      setUpdateSuccess(true);
      setTimeout(() => setUpdateSuccess(false), 3000);
    } catch (err) {
      setUpdateError(err instanceof Error ? err.message : "Failed to update chart");
    } finally {
      setUpdating(false);
    }
  }

  function handleToneChange(newTone: UserProfile["tone"]) {
    setTone(newTone);
    if (sessionId) {
      updateTone({
        sessionId,
        userId: currentUser?._id ?? undefined,
        tone: newTone,
      }).catch(() => {
        /* silent - will sync on next load */
      });
    }
  }

  async function handleManageBilling() {
    setPortalLoading(true);
    try {
      const result = await generatePortalUrl({});
      if (result?.url) window.open(result.url, "_blank", "noopener,noreferrer");
    } catch {
      /* user may not have an active subscription */
    } finally {
      setPortalLoading(false);
    }
  }

  function handleClearData() {
    if (typeof window !== "undefined") localStorage.clear();
    window.location.href = "/";
  }

  return (
    <div className="min-h-dvh px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-lg">
        <Link href="/chat" className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors mb-8"><ArrowLeft size={16} />Back to Chat</Link>

        <h1 className="text-2xl font-semibold text-text-primary mb-8">Settings</h1>

        {/* Billing */}
        <section className="glass-section p-5 mb-6">
          <div className="flex items-center gap-2 mb-1">
            <Crown size={18} className="text-accent" />
            <h2 className="text-lg font-semibold text-text-primary">Billing</h2>
          </div>
          <p className="text-xs text-text-secondary mb-4">Manage your plan, message packs, and Polar purchases.</p>

          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-text-secondary">Current plan</span>
            <span className="rounded-full bg-accent/12 px-3 py-1 text-xs font-medium text-accent">
              {TIER_LABELS[subscription.tier] ?? subscription.tier}
            </span>
          </div>

          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-text-secondary">Messages available</span>
            <span className="text-sm font-medium text-text-primary">
              {subscription.isUnlimited
                ? "Unlimited"
                : subscription.messagesAvailable ?? 0}
            </span>
          </div>

          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-text-secondary">Allowance breakdown</span>
            <span className="text-sm font-medium text-text-primary">
              {subscription.isUnlimited
                ? "All premium features unlocked"
                : `${subscription.freeRemaining} free + ${subscription.creditBalance} bundle`}
            </span>
          </div>

          <div className="flex gap-3">
            {!subscription.isUnlimited && (
              <Link
                href="/pricing"
                className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white hover:brightness-110 transition"
              >
                <Sparkles size={14} /> Buy Messages
              </Link>
            )}
            {!!currentUser && (
              <button
                type="button"
                onClick={handleManageBilling}
                disabled={portalLoading}
                className="flex items-center gap-2 rounded-xl border border-white/30 bg-white/20 px-4 py-2.5 text-sm font-medium text-text-primary hover:bg-white/30 transition disabled:opacity-50"
              >
                {portalLoading ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />} Billing & Purchases
              </button>
            )}
          </div>
        </section>

        {/* Birth Details */}
        <section className="glass-section p-5 mb-6">
          <h2 className="text-lg font-semibold text-text-primary mb-1">Birth Details</h2>
          <p className="text-xs text-text-secondary mb-5">Update your birth info to recompute your chart.</p>

          <form onSubmit={handleUpdateChart} className="space-y-4">
            <label className="block">
              <span className="text-sm text-text-secondary flex items-center gap-1.5 mb-1.5"><Calendar size={14} /> Date of Birth</span>
              <input type="date" required value={dob} onChange={(e) => setDob(e.target.value)} className="glass-input-field" />
            </label>
            <label className="block">
              <span className="text-sm text-text-secondary flex items-center gap-1.5 mb-1.5"><Clock size={14} /> Time of Birth</span>
              <input type="time" value={tob} onChange={(e) => setTob(e.target.value)} className="glass-input-field" />
            </label>
            <label className="block">
              <span className="text-sm text-text-secondary flex items-center gap-1.5 mb-1.5"><MapPin size={14} /> Birthplace</span>
              <input type="text" required value={birthplace} onChange={(e) => setBirthplace(e.target.value)} placeholder="e.g., Mumbai, India" className="glass-input-field" />
            </label>
            <div>
              <span className="text-sm text-text-secondary mb-2 block">Birth Time Quality</span>
              <div className="flex gap-2">
                {(["exact", "approximate", "unknown"] as const).map((q) => (
                  <button key={q} type="button" onClick={() => setTimeQuality(q)}
                    className={`flex-1 rounded-xl border px-3 py-2 text-sm capitalize transition-colors ${timeQuality === q ? "border-accent bg-accent/10 text-accent" : "border-white/30 text-text-secondary hover:border-white/50"}`}>
                    {q}
                  </button>
                ))}
              </div>
            </div>

            {updateError && (
              <div className="flex items-center gap-2 rounded-lg bg-red-50/50 border border-red-400/20 px-3 py-2">
                <AlertCircle size={16} className="text-red-500 shrink-0" /><p className="text-sm text-red-600">{updateError}</p>
              </div>
            )}
            {updateSuccess && (
              <div className="rounded-lg bg-green-50/50 border border-green-400/20 px-3 py-2">
                <p className="text-sm text-green-700">Chart updated successfully!</p>
              </div>
            )}

            <button type="submit" disabled={updating || !dob || !birthplace.trim()} className="w-full flex items-center justify-center gap-2 rounded-xl bg-accent text-white font-semibold py-3 hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition">
              {updating ? <><Loader2 size={18} className="animate-spin" />Updating...</> : "Update Chart"}
            </button>
          </form>
        </section>

        {/* Reading Preferences */}
        <section className="glass-section p-5 mb-6">
          <h2 className="text-lg font-semibold text-text-primary mb-1">Reading Preferences</h2>
          <p className="text-xs text-text-secondary mb-5">Choose the tone for your readings.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {TONE_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const selected = tone === opt.value;
              return (
                <button key={opt.value} type="button" onClick={() => handleToneChange(opt.value)}
                  className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-all duration-200 ${selected ? "border-accent bg-accent/10" : "border-white/30 bg-white/15 hover:border-white/50"}`}>
                  <Icon size={20} className={`mt-0.5 shrink-0 ${selected ? "text-accent" : "text-text-secondary"}`} />
                  <div>
                    <div className={`font-medium text-sm ${selected ? "text-accent" : "text-text-primary"}`}>{opt.label}</div>
                    <div className="text-xs text-text-secondary mt-0.5">{opt.description}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Data */}
        <section className="glass-section p-5">
          <h2 className="text-lg font-semibold text-text-primary mb-1">Data</h2>
          <p className="text-xs text-text-secondary mb-5">Manage your local data.</p>
          <p className="text-xs text-text-secondary/70 mb-3">This will remove your local session data. Your Convex data remains intact.</p>
          {!confirmClear ? (
            <button type="button" onClick={() => setConfirmClear(true)} className="flex items-center gap-2 rounded-xl border border-red-400/25 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50/50 transition-colors">
              <Trash2 size={16} />Clear Local Data
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <button type="button" onClick={handleClearData} className="flex items-center gap-2 rounded-xl bg-red-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-600 transition-colors"><Trash2 size={16} />Confirm Clear</button>
              <button type="button" onClick={() => setConfirmClear(false)} className="rounded-xl border border-black/10 px-4 py-2.5 text-sm text-text-secondary hover:bg-white/20 transition-colors">Cancel</button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
