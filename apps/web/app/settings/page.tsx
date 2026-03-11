"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Calendar, Clock, MapPin, Briefcase, Heart, Sparkles, AlignLeft, Loader2, Trash2, AlertCircle,
} from "lucide-react";
import Link from "next/link";
import { useApp } from "@/app/store";
import { computeChart as apiComputeChart } from "@/app/api";
import { UserProfile } from "@/app/types";

const TONE_OPTIONS: { value: UserProfile["tone"]; label: string; description: string; icon: typeof Briefcase }[] = [
  { value: "practical", label: "Practical", description: "Actionable advice you can apply today", icon: Briefcase },
  { value: "emotional", label: "Emotional", description: "Warm, empathetic, and supportive guidance", icon: Heart },
  { value: "spiritual", label: "Spiritual", description: "Deeper meaning, karma, and soul purpose", icon: Sparkles },
  { value: "concise", label: "Concise", description: "Short, direct answers — no fluff", icon: AlignLeft },
];

export default function SettingsPage() {
  const router = useRouter();
  const { profile, setProfile, setChart } = useApp();

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
    e.preventDefault(); setUpdating(true); setUpdateError(null); setUpdateSuccess(false);
    const updatedProfile: UserProfile = { date_of_birth: dob, time_of_birth: tob || undefined, birthplace: birthplace.trim(), birth_time_quality: timeQuality, tone };
    try {
      const data = await apiComputeChart({ date_of_birth: updatedProfile.date_of_birth, time_of_birth: updatedProfile.time_of_birth, birthplace: updatedProfile.birthplace, birth_time_quality: updatedProfile.birth_time_quality });
      setProfile(updatedProfile); setChart(data.chart); setUpdateSuccess(true);
      setTimeout(() => setUpdateSuccess(false), 3000);
    } catch (err) { setUpdateError(err instanceof Error ? err.message : "Failed to update chart"); }
    finally { setUpdating(false); }
  }

  function handleToneChange(newTone: UserProfile["tone"]) {
    setTone(newTone);
    if (profile) setProfile({ ...profile, tone: newTone });
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
          <p className="text-xs text-text-secondary/70 mb-3">This will remove your chart and all local data.</p>
          {!confirmClear ? (
            <button type="button" onClick={() => setConfirmClear(true)} className="flex items-center gap-2 rounded-xl border border-red-400/25 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50/50 transition-colors">
              <Trash2 size={16} />Clear All Data
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
