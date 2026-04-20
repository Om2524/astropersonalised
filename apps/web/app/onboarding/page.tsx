"use client";
import { useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  User,
  Calendar,
  Clock,
  MapPin,
  Briefcase,
  Heart,
  Sparkles,
  AlignLeft,
  Loader2,
  ChevronRight,
  ChevronLeft,
  AlertCircle,
} from "lucide-react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { useApp } from "@/app/store";
import { UserProfile } from "@/app/types";
import { LANGUAGES } from "@/app/i18n/translations";
import {
  getBirthProfileAnalyticsProperties,
  syncBirthProfilePersonProperties,
} from "@/app/lib/posthogProfile";
import { prewarmCompute } from "@/app/lib/prewarm";
import posthog from "posthog-js";

const TONE_OPTIONS: {
  value: UserProfile["tone"];
  label: string;
  description: string;
  icon: typeof Briefcase;
}[] = [
  { value: "practical", label: "Practical", description: "Actionable advice you can apply today", icon: Briefcase },
  { value: "emotional", label: "Emotional", description: "Warm, empathetic, and supportive guidance", icon: Heart },
  { value: "spiritual", label: "Spiritual", description: "Deeper meaning, karma, and soul purpose", icon: Sparkles },
  { value: "concise", label: "Concise", description: "Short, direct answers — no fluff", icon: AlignLeft },
];

const STEPS = ["Birth Details", "Preferences", "Computing"];

export default function OnboardingPage() {
  const router = useRouter();
  const { sessionId } = useApp();
  const currentUser = useQuery(api.functions.users.getCurrentUser, {});
  const computeChartAction = useAction(api.actions.computeChart.computeChart);
  const registerSession = useMutation(api.functions.sessions.getOrCreate);

  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [tob, setTob] = useState("");
  const [unknownTime, setUnknownTime] = useState(false);
  const [timeQuality, setTimeQuality] = useState<"approximate" | "unknown">("approximate");
  const [birthplace, setBirthplace] = useState("");
  const [tone, setTone] = useState<UserProfile["tone"]>("practical");
  const [language, setLanguage] = useState("en");
  const [computing, setComputing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    prewarmCompute();
  }, []);

  const canContinueStep1 = dob.length > 0 && birthplace.trim().length > 0;

  async function computeChart() {
    setComputing(true);
    setError(null);

    const birthTimeQuality = unknownTime ? timeQuality : "exact";
    const timeOfBirth = unknownTime ? undefined : tob || undefined;

    try {
      // Ensure session is registered
      await registerSession({ sessionId });

      // Call Convex action — this computes the chart via the Python API
      // and stores both the birth profile and chart in Convex
      await computeChartAction({
        sessionId,
        userId: currentUser?._id ?? undefined,
        dateOfBirth: dob,
        timeOfBirth,
        birthplace: birthplace.trim(),
        // Geocoding is done by the Python API, so we pass placeholder coords
        // The action handles lat/lng/timezone from the compute response
        latitude: 0,
        longitude: 0,
        timezone: "UTC",
        birthTimeQuality,
        tone,
        language,
      });

      const birthProfile = {
        date_of_birth: dob,
        time_of_birth: timeOfBirth,
        birthplace: birthplace.trim(),
        birth_time_quality: birthTimeQuality,
        tone,
        language,
      } satisfies UserProfile;
      const analyticsProperties = {
        ...getBirthProfileAnalyticsProperties(birthProfile),
        source: "onboarding",
        name_provided: name.trim().length > 0,
      };

      posthog.capture("birth_profile_saved", analyticsProperties);
      posthog.capture('onboarding_completed', {
        ...analyticsProperties,
      });
      syncBirthProfilePersonProperties(birthProfile);

      router.push("/chat");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setError(message);
      setComputing(false);
    }
  }

  function handleContinue(e: FormEvent) {
    e.preventDefault();
    if (step === 0 && canContinueStep1) setStep(1);
    else if (step === 1) { setStep(2); computeChart(); }
  }

  return (
    <div className="min-h-dvh flex flex-col items-center px-4 py-8 sm:py-16">
      {/* Step indicator */}
      <div className="flex items-center gap-3 mb-10">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-3">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors duration-300 ${
                  i <= step ? "bg-accent text-white" : "bg-white/30 text-text-secondary"
                }`}
              >
                {i + 1}
              </div>
              <span className={`text-xs hidden sm:block transition-colors duration-300 ${i <= step ? "text-accent" : "text-text-secondary"}`}>
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`w-10 h-px transition-colors duration-300 ${i < step ? "bg-accent" : "bg-black/10"}`} />
            )}
          </div>
        ))}
      </div>

      {/* Card */}
      <div className="w-full max-w-lg">
        {step === 0 && (
          <form onSubmit={handleContinue} className="animate-fade-in glass-section p-6">
            <h1 className="text-2xl font-semibold text-text-primary mb-1">Your Birth Details</h1>
            <p className="text-text-secondary text-sm mb-8">We use this to compute your unique birth chart.</p>

            <label className="block mb-5">
              <span className="text-sm text-text-secondary flex items-center gap-1.5 mb-1.5">
                <User size={14} /> Name <span className="text-text-secondary/50 text-xs">(optional)</span>
              </span>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="How should we address you?" className="glass-input-field" />
            </label>

            <label className="block mb-5">
              <span className="text-sm text-text-secondary flex items-center gap-1.5 mb-1.5">
                <Calendar size={14} /> Date of Birth <span className="text-red-500 text-xs">*</span>
              </span>
              <input type="date" required value={dob} onChange={(e) => setDob(e.target.value)} className="glass-input-field" />
            </label>

            <div className="mb-5">
              <span className="text-sm text-text-secondary flex items-center gap-1.5 mb-1.5">
                <Clock size={14} /> Time of Birth
              </span>
              {!unknownTime && (
                <input type="time" value={tob} onChange={(e) => setTob(e.target.value)} className="glass-input-field mb-2" />
              )}
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={unknownTime} onChange={(e) => setUnknownTime(e.target.checked)} className="accent-accent w-4 h-4" />
                <span className="text-sm text-text-secondary">I don&apos;t know my exact birth time</span>
              </label>
              {unknownTime && (
                <div className="mt-3 ml-6 space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="timeQuality" checked={timeQuality === "approximate"} onChange={() => setTimeQuality("approximate")} className="accent-accent w-4 h-4" />
                    <span className="text-sm text-text-secondary">Approximate (within 1-2 hours)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="timeQuality" checked={timeQuality === "unknown"} onChange={() => setTimeQuality("unknown")} className="accent-accent w-4 h-4" />
                    <span className="text-sm text-text-secondary">Unknown</span>
                  </label>
                </div>
              )}
            </div>

            <label className="block mb-8">
              <span className="text-sm text-text-secondary flex items-center gap-1.5 mb-1.5">
                <MapPin size={14} /> Birthplace <span className="text-red-500 text-xs">*</span>
              </span>
              <input type="text" required value={birthplace} onChange={(e) => setBirthplace(e.target.value)} placeholder="e.g., Mumbai, India" className="glass-input-field" />
            </label>

            <button type="submit" disabled={!canContinueStep1} className="w-full flex items-center justify-center gap-2 rounded-xl bg-accent text-white font-semibold py-3 hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition">
              Continue <ChevronRight size={18} />
            </button>
          </form>
        )}

        {step === 1 && (
          <div className="animate-fade-in glass-section p-6">
            {/* Language selector */}
            <h2 className="text-lg font-semibold text-text-primary mb-1">Language</h2>
            <p className="text-text-secondary text-sm mb-4">Choose your preferred language for readings and the interface.</p>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="glass-input-field mb-8 cursor-pointer"
            >
              {LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.nativeLabel} — {lang.label}
                </option>
              ))}
            </select>

            <h2 className="text-lg font-semibold text-text-primary mb-1">Reading Tone</h2>
            <p className="text-text-secondary text-sm mb-4">Choose the style that feels right to you. You can change this anytime.</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
              {TONE_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const selected = tone === opt.value;
                return (
                  <button key={opt.value} type="button" onClick={() => setTone(opt.value)}
                    className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-all duration-200 ${
                      selected ? "border-accent bg-accent/10" : "border-white/30 bg-white/15 hover:border-white/50"
                    }`}>
                    <Icon size={20} className={`mt-0.5 shrink-0 ${selected ? "text-accent" : "text-text-secondary"}`} />
                    <div>
                      <div className={`font-medium text-sm ${selected ? "text-accent" : "text-text-primary"}`}>{opt.label}</div>
                      <div className="text-xs text-text-secondary mt-0.5">{opt.description}</div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex gap-3">
              <button type="button" onClick={() => setStep(0)} className="flex items-center justify-center gap-1 rounded-xl border border-black/10 text-text-secondary font-medium py-3 px-5 hover:bg-white/20 transition">
                <ChevronLeft size={18} /> Back
              </button>
              <button type="button" onClick={handleContinue as () => void} className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-accent text-white font-semibold py-3 hover:brightness-110 transition">
                Compute My Chart <Sparkles size={18} />
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="animate-fade-in glass-section p-6 flex flex-col items-center text-center py-16">
            {computing && !error && (
              <>
                <Loader2 size={48} className="text-accent animate-spin mb-6" />
                <h2 className="text-xl font-semibold text-text-primary mb-2">Computing your birth chart&hellip;</h2>
                <p className="text-text-secondary text-sm max-w-xs">We&apos;re calculating planetary positions for your exact moment of birth.</p>
              </>
            )}
            {error && (
              <>
                <AlertCircle size={48} className="text-red-500 mb-6" />
                <h2 className="text-xl font-semibold text-text-primary mb-2">Something went wrong</h2>
                <p className="text-text-secondary text-sm max-w-sm mb-6">{error}</p>
                <div className="flex gap-3">
                  <button type="button" onClick={() => setStep(1)} className="flex items-center gap-1 rounded-xl border border-black/10 text-text-secondary font-medium py-2.5 px-5 hover:bg-white/20 transition">
                    <ChevronLeft size={18} /> Back
                  </button>
                  <button type="button" onClick={() => computeChart()} className="flex items-center gap-2 rounded-xl bg-accent text-white font-semibold py-2.5 px-6 hover:brightness-110 transition">
                    Retry
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
