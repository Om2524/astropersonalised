"use client";

import { useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  User,
  Calendar,
  Clock,
  MapPin,
  Sparkles,
  Loader2,
  ChevronRight,
  ChevronLeft,
  AlertCircle,
} from "lucide-react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { useApp } from "@/app/store";
import { UserProfile } from "@/app/types";
import {
  getBirthProfileAnalyticsProperties,
  syncBirthProfilePersonProperties,
} from "@/app/lib/posthogProfile";
import GalaxyLogo from "@/app/components/GalaxyLogo";
import AuthMethods from "@/app/components/AuthMethods";
import BirthplaceAutocomplete from "@/app/components/BirthplaceAutocomplete";
import { prewarmCompute } from "@/app/lib/prewarm";
import posthog from "posthog-js";

const DEFAULT_TONE: UserProfile["tone"] = "practical";
const DEFAULT_LANGUAGE = "en";
const STEPS = ["Start", "Birth Details", "Computing"];

export default function OnboardingPage() {
  const router = useRouter();
  const { sessionId, ready } = useApp();
  const currentUser = useQuery(api.functions.users.getCurrentUser, {});
  const computeChartAction = useAction(api.actions.computeChart.computeChart);
  const registerSession = useMutation(api.functions.sessions.getOrCreate);

  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [tob, setTob] = useState("");
  const [timeQuality, setTimeQuality] =
    useState<UserProfile["birth_time_quality"]>("exact");
  const [birthplace, setBirthplace] = useState("");
  const [computing, setComputing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requiresBirthTime = timeQuality !== "unknown";
  const canContinueBirthDetails =
    dob.length > 0 &&
    birthplace.trim().length > 0 &&
    (!requiresBirthTime || tob.length > 0);

  useEffect(() => {
    prewarmCompute();
  }, []);

  useEffect(() => {
    if (ready) {
      router.replace("/chat");
    }
  }, [ready, router]);

  useEffect(() => {
    if (currentUser === undefined || ready) return;
    if (currentUser && step === 0) {
      setStep(1);
    }
  }, [currentUser, ready, step]);

  async function computeChart() {
    if (requiresBirthTime && !tob) {
      setError("Add a birth time or mark it as unknown.");
      return;
    }

    setComputing(true);
    setError(null);

    const timeOfBirth = timeQuality === "unknown" ? undefined : tob || undefined;

    try {
      await registerSession({ sessionId });

      await computeChartAction({
        sessionId,
        userId: currentUser?._id ?? undefined,
        dateOfBirth: dob,
        timeOfBirth,
        birthplace: birthplace.trim(),
        latitude: 0,
        longitude: 0,
        timezone: "UTC",
        birthTimeQuality: timeQuality,
        tone: DEFAULT_TONE,
        language: DEFAULT_LANGUAGE,
      });

      const birthProfile = {
        date_of_birth: dob,
        time_of_birth: timeOfBirth,
        birthplace: birthplace.trim(),
        birth_time_quality: timeQuality,
        tone: DEFAULT_TONE,
        language: DEFAULT_LANGUAGE,
      } satisfies UserProfile;

      const analyticsProperties = {
        ...getBirthProfileAnalyticsProperties(birthProfile),
        source: "onboarding",
        name_provided: name.trim().length > 0,
        auth_state: currentUser ? "authenticated" : "guest",
      };

      posthog.capture("birth_profile_saved", analyticsProperties);
      posthog.capture("onboarding_completed", analyticsProperties);
      syncBirthProfilePersonProperties(birthProfile);

      router.push("/chat");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setError(message);
      setComputing(false);
    }
  }

  function handleContinue(event: FormEvent) {
    event.preventDefault();
    if (step === 1 && canContinueBirthDetails) {
      setStep(2);
      void computeChart();
    }
  }

  function handleContinueAsGuest() {
    posthog.capture("continue_as_guest_clicked", {
      session_id: sessionId,
    });
    setError(null);
    setStep(1);
  }

  return (
    <div className="min-h-dvh flex flex-col items-center px-4 py-8 sm:py-16">
      <div className="flex items-center gap-3 mb-10">
        {STEPS.map((label, index) => (
          <div key={label} className="flex items-center gap-3">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors duration-300 ${
                  index <= step
                    ? "bg-accent text-white"
                    : "bg-white/30 text-text-secondary"
                }`}
              >
                {index + 1}
              </div>
              <span
                className={`text-xs hidden sm:block transition-colors duration-300 ${
                  index <= step ? "text-accent" : "text-text-secondary"
                }`}
              >
                {label}
              </span>
            </div>
            {index < STEPS.length - 1 && (
              <div
                className={`w-10 h-px transition-colors duration-300 ${
                  index < step ? "bg-accent" : "bg-black/10"
                }`}
              />
            )}
          </div>
        ))}
      </div>

      <div className="w-full max-w-lg">
        {step === 0 && (
          <div className="animate-fade-in glass-section p-6">
            <div className="flex flex-col items-center mb-6">
              <GalaxyLogo size={48} />
              <h1 className="mt-3 text-xl font-semibold text-text-primary">
                Start with your saved chart
              </h1>
              <p className="mt-1 text-xs text-text-secondary text-center max-w-xs">
                Sign up to keep every reading tied to your account, or preview
                one guest reading first.
              </p>
            </div>

            <AuthMethods redirectTo="/onboarding" />

            <div className="mt-5 border-t border-black/8 pt-4">
              <button
                type="button"
                onClick={handleContinueAsGuest}
                className="w-full rounded-xl border border-white/35 bg-white/15 px-4 py-3 text-sm font-medium text-text-secondary transition hover:border-white/55 hover:bg-white/25 hover:text-text-primary"
              >
                Continue as guest
              </button>
              <p className="mt-2 text-center text-[11px] text-text-secondary/80">
                Guest mode gives you one reading. Sign up is required after that.
              </p>
            </div>
          </div>
        )}

        {step === 1 && (
          <form
            onSubmit={handleContinue}
            className="animate-fade-in glass-section p-6"
          >
            <h1 className="text-2xl font-semibold text-text-primary mb-1">
              Your Birth Details
            </h1>
            <p className="text-text-secondary text-sm mb-8">
              We use this to compute your personal chart before the first answer.
            </p>

            <label className="block mb-5">
              <span className="text-sm text-text-secondary flex items-center gap-1.5 mb-1.5">
                <User size={14} /> Name{" "}
                <span className="text-text-secondary/50 text-xs">
                  (optional)
                </span>
              </span>
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="How should we address you?"
                className="glass-input-field"
              />
            </label>

            <label className="block mb-5">
              <span className="text-sm text-text-secondary flex items-center gap-1.5 mb-1.5">
                <Calendar size={14} /> Date of Birth{" "}
                <span className="text-red-500 text-xs">*</span>
              </span>
              <input
                type="date"
                required
                value={dob}
                onChange={(event) => setDob(event.target.value)}
                className="glass-input-field"
              />
            </label>

            <div className="mb-5">
              <span className="text-sm text-text-secondary flex items-center gap-1.5 mb-1.5">
                <Clock size={14} /> Time of Birth
              </span>
              <input
                type="time"
                value={tob}
                onChange={(event) => setTob(event.target.value)}
                className="glass-input-field"
              />
              <div className="mt-3 grid grid-cols-3 gap-2">
                {(["exact", "approximate", "unknown"] as const).map((quality) => (
                  <button
                    key={quality}
                    type="button"
                    onClick={() => setTimeQuality(quality)}
                    className={`rounded-xl border px-3 py-2 text-sm capitalize transition-colors ${
                      timeQuality === quality
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-white/30 text-text-secondary hover:border-white/50"
                    }`}
                  >
                    {quality}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-text-secondary">
                Use <span className="font-medium text-text-primary">approximate</span>{" "}
                if you know the time loosely. Choose{" "}
                <span className="font-medium text-text-primary">unknown</span> if
                you do not want the typed time used.
              </p>
            </div>

            <label className="block mb-8">
              <span className="text-sm text-text-secondary flex items-center gap-1.5 mb-1.5">
                <MapPin size={14} /> Birthplace{" "}
                <span className="text-red-500 text-xs">*</span>
              </span>
              <BirthplaceAutocomplete
                required
                value={birthplace}
                onChange={setBirthplace}
              />
            </label>

            <button
              type="submit"
              disabled={!canContinueBirthDetails}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-accent text-white font-semibold py-3 hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              Compute My Chart <ChevronRight size={18} />
            </button>
          </form>
        )}

        {step === 2 && (
          <div className="animate-fade-in glass-section p-6 flex flex-col items-center text-center py-16">
            {computing && !error && (
              <>
                <Loader2 size={48} className="text-accent animate-spin mb-6" />
                <h2 className="text-xl font-semibold text-text-primary mb-2">
                  Computing your birth chart&hellip;
                </h2>
                <p className="text-text-secondary text-sm max-w-xs">
                  We&apos;re locking in your birth chart so the very next screen
                  is your answer.
                </p>
              </>
            )}

            {error && (
              <>
                <AlertCircle size={48} className="text-red-500 mb-6" />
                <h2 className="text-xl font-semibold text-text-primary mb-2">
                  Something went wrong
                </h2>
                <p className="text-text-secondary text-sm max-w-sm mb-6">
                  {error}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setComputing(false);
                    setError(null);
                    setStep(1);
                  }}
                  className="flex items-center gap-1 rounded-xl border border-black/10 text-text-secondary font-medium py-2.5 px-5 hover:bg-white/20 transition"
                >
                  <ChevronLeft size={18} /> Back
                </button>
              </>
            )}

            {!computing && !error && (
              <button
                type="button"
                onClick={() => {
                  setComputing(true);
                  void computeChart();
                }}
                className="flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-white font-semibold"
              >
                <Sparkles size={18} /> Try again
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
