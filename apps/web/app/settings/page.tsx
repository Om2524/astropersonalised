"use client";

import { useEffect, useState, FormEvent } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import {
  ArrowLeft,
  Calendar,
  Clock,
  MapPin,
  Mail,
  Loader2,
  AlertCircle,
  Crown,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useApp } from "@/app/store";
import { useSubscription } from "@/app/hooks/useSubscription";
import { UserProfile } from "@/app/types";
import BirthplaceAutocomplete from "@/app/components/BirthplaceAutocomplete";
import {
  getBirthProfileAnalyticsProperties,
  syncBirthProfilePersonProperties,
} from "@/app/lib/posthogProfile";
import posthog from "posthog-js";

const DEFAULT_TONE: UserProfile["tone"] = "practical";

const TIER_LABELS: Record<string, string> = {
  maya: "Maya (Free)",
  moksha: "Moksha Unlimited",
};

function formatHourLabel(hour: number): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2026, 0, 1, hour)));
}

export default function SettingsPage() {
  const { profile, sessionId } = useApp();
  const currentUser = useQuery(api.functions.users.getCurrentUser, {});
  const emailPreference = useQuery(api.functions.emailBriefs.getMyPreference, {});
  const subscription = useSubscription(sessionId, currentUser?._id);
  const computeChartAction = useAction(api.actions.computeChart.computeChart);
  const generatePortalUrl = useAction(api.polar.generateCustomerPortalUrl);
  const saveEmailPreference = useMutation(
    api.functions.emailBriefs.saveMyPreference
  );

  const [portalLoading, setPortalLoading] = useState(false);
  const [dob, setDob] = useState(profile?.date_of_birth ?? "");
  const [tob, setTob] = useState(profile?.time_of_birth ?? "");
  const [birthplace, setBirthplace] = useState(profile?.birthplace ?? "");
  const [timeQuality, setTimeQuality] = useState<UserProfile["birth_time_quality"]>(
    profile?.birth_time_quality ?? "exact"
  );
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updateSuccess, setUpdateSuccess] = useState(false);
  const [briefEmailEnabled, setBriefEmailEnabled] = useState(false);
  const [briefEmail, setBriefEmail] = useState("");
  const [briefTimezone, setBriefTimezone] = useState("UTC");
  const [briefSendHour, setBriefSendHour] = useState(7);
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailSaveError, setEmailSaveError] = useState<string | null>(null);
  const [emailSaveSuccess, setEmailSaveSuccess] = useState(false);

  const requiresBirthTime = timeQuality !== "unknown";
  const canUpdate =
    Boolean(dob) &&
    birthplace.trim().length > 0 &&
    (!requiresBirthTime || Boolean(tob));

  useEffect(() => {
    if (emailPreference) {
      setBriefEmailEnabled(emailPreference.dailyBriefEnabled);
      setBriefEmail(emailPreference.email);
      setBriefTimezone(emailPreference.timezone);
      setBriefSendHour(emailPreference.localSendHour);
      return;
    }

    if (currentUser?.email) {
      setBriefEmail((value) => value || currentUser.email || "");
    }
  }, [emailPreference, currentUser?.email]);

  useEffect(() => {
    if (emailPreference) {
      return;
    }

    const browserTimezone =
      Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    setBriefTimezone((value) => (value === "UTC" ? browserTimezone : value));
  }, [emailPreference]);

  async function handleUpdateChart(event: FormEvent) {
    event.preventDefault();
    if (requiresBirthTime && !tob) {
      setUpdateError("Add a birth time or mark it as unknown.");
      return;
    }

    setUpdating(true);
    setUpdateError(null);
    setUpdateSuccess(false);

    const timeOfBirth = timeQuality === "unknown" ? undefined : tob || undefined;

    try {
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
        language: profile?.language ?? "en",
      });

      const updatedProfile = {
        date_of_birth: dob,
        time_of_birth: timeOfBirth,
        birthplace: birthplace.trim(),
        birth_time_quality: timeQuality,
        tone: DEFAULT_TONE,
        language: profile?.language ?? "en",
      } satisfies UserProfile;

      posthog.capture("birth_profile_updated", {
        ...getBirthProfileAnalyticsProperties(updatedProfile),
        source: "settings",
      });
      syncBirthProfilePersonProperties(updatedProfile);
      setUpdateSuccess(true);
      window.setTimeout(() => setUpdateSuccess(false), 3000);
    } catch (err) {
      setUpdateError(
        err instanceof Error ? err.message : "Failed to update chart"
      );
    } finally {
      setUpdating(false);
    }
  }

  async function handleManageBilling() {
    setPortalLoading(true);
    try {
      const result = await generatePortalUrl({});
      if (result?.url) {
        window.open(result.url, "_blank", "noopener,noreferrer");
      }
    } catch {
      // No-op: user may not have a portal yet.
    } finally {
      setPortalLoading(false);
    }
  }

  async function handleSaveEmailSettings(event: FormEvent) {
    event.preventDefault();

    if (!currentUser) {
      setEmailSaveError("Sign in before saving delivery settings.");
      return;
    }

    if (!briefEmail.trim()) {
      setEmailSaveError("Add an email address for daily brief delivery.");
      return;
    }

    if (!briefTimezone.trim()) {
      setEmailSaveError("Add an IANA timezone like Asia/Kolkata.");
      return;
    }

    setEmailSaving(true);
    setEmailSaveError(null);
    setEmailSaveSuccess(false);

    try {
      await saveEmailPreference({
        email: briefEmail.trim(),
        dailyBriefEnabled: briefEmailEnabled,
        timezone: briefTimezone.trim(),
        localSendHour: briefSendHour,
      });

      setEmailSaveSuccess(true);
      window.setTimeout(() => setEmailSaveSuccess(false), 3000);
    } catch (error) {
      setEmailSaveError(
        error instanceof Error ? error.message : "Failed to save email settings"
      );
    } finally {
      setEmailSaving(false);
    }
  }

  return (
    <div className="min-h-dvh px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-lg">
        <Link
          href="/chat"
          className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors mb-8"
        >
          <ArrowLeft size={16} />
          Back to Chat
        </Link>

        <h1 className="text-2xl font-semibold text-text-primary mb-8">
          Settings
        </h1>

        <section className="glass-section p-5 mb-6">
          <div className="flex items-center gap-2 mb-1">
            <Crown size={18} className="text-accent" />
            <h2 className="text-lg font-semibold text-text-primary">Billing</h2>
          </div>
          <p className="text-xs text-text-secondary mb-4">
            Manage your plan, message packs, and Polar purchases.
          </p>

          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-text-secondary">Current plan</span>
            <span className="rounded-full bg-accent/12 px-3 py-1 text-xs font-medium text-accent">
              {TIER_LABELS[subscription.tier] ?? subscription.tier}
            </span>
          </div>

          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-text-secondary">
              Messages available
            </span>
            <span className="text-sm font-medium text-text-primary">
              {subscription.isUnlimited
                ? "Unlimited"
                : subscription.messagesAvailable ?? 0}
            </span>
          </div>

          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-text-secondary">
              Allowance breakdown
            </span>
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
                {portalLoading ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <ExternalLink size={14} />
                )}
                Billing & Purchases
              </button>
            )}
          </div>
        </section>

        <section className="glass-section p-5 mb-6">
          <div className="flex items-center gap-2 mb-1">
            <Mail size={18} className="text-accent" />
            <h2 className="text-lg font-semibold text-text-primary">
              Email Delivery
            </h2>
          </div>
          <p className="text-xs text-text-secondary mb-5">
            Route your daily brief through Cloudflare and send it to the inbox
            you actually want to read in the morning.
          </p>

          {!currentUser ? (
            <div className="rounded-lg border border-white/20 bg-white/10 px-4 py-3 text-sm text-text-secondary">
              Sign in first if you want scheduled brief delivery by email.
            </div>
          ) : (
            <form onSubmit={handleSaveEmailSettings} className="space-y-4">
              <label className="block">
                <span className="text-sm text-text-secondary flex items-center gap-1.5 mb-1.5">
                  <Mail size={14} /> Delivery Email
                </span>
                <input
                  type="email"
                  required
                  value={briefEmail}
                  onChange={(event) => setBriefEmail(event.target.value)}
                  className="glass-input-field"
                  placeholder="you@example.com"
                />
              </label>

              <label className="block">
                <span className="text-sm text-text-secondary flex items-center gap-1.5 mb-1.5">
                  <Clock size={14} /> Timezone
                </span>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={briefTimezone}
                    onChange={(event) => setBriefTimezone(event.target.value)}
                    className="glass-input-field"
                    placeholder="Asia/Kolkata"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setBriefTimezone(
                        Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
                      )
                    }
                    className="rounded-xl border border-white/30 bg-white/20 px-3 py-2 text-sm font-medium text-text-primary hover:bg-white/30 transition"
                  >
                    Use Browser
                  </button>
                </div>
                <p className="mt-2 text-xs text-text-secondary">
                  Use an IANA timezone like <span className="text-text-primary">Asia/Kolkata</span> or{" "}
                  <span className="text-text-primary">America/New_York</span>.
                </p>
              </label>

              <label className="block">
                <span className="text-sm text-text-secondary flex items-center gap-1.5 mb-1.5">
                  <Calendar size={14} /> Send Time
                </span>
                <select
                  value={briefSendHour}
                  onChange={(event) => setBriefSendHour(Number(event.target.value))}
                  className="glass-input-field"
                >
                  {Array.from({ length: 24 }, (_, hour) => (
                    <option key={hour} value={hour}>
                      {formatHourLabel(hour)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex items-start gap-3 rounded-xl border border-white/20 bg-white/10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={briefEmailEnabled}
                  onChange={(event) => setBriefEmailEnabled(event.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-white/30 bg-transparent text-accent focus:ring-accent"
                />
                <div>
                  <p className="text-sm font-medium text-text-primary">
                    Send my daily brief by email
                  </p>
                  <p className="text-xs text-text-secondary mt-1">
                    We will deliver one brief per local day at the selected hour.
                  </p>
                </div>
              </label>

              {emailPreference?.lastDeliveredAt ? (
                <div className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs text-text-secondary">
                  Last sent:{" "}
                  <span className="text-text-primary">
                    {new Date(emailPreference.lastDeliveredAt).toLocaleString()}
                  </span>
                </div>
              ) : null}

              {emailPreference?.lastAttemptStatus === "error" &&
              emailPreference.lastError ? (
                <div className="flex items-center gap-2 rounded-lg bg-red-50/50 border border-red-400/20 px-3 py-2">
                  <AlertCircle size={16} className="text-red-500 shrink-0" />
                  <p className="text-sm text-red-600">{emailPreference.lastError}</p>
                </div>
              ) : null}

              {emailSaveError && (
                <div className="flex items-center gap-2 rounded-lg bg-red-50/50 border border-red-400/20 px-3 py-2">
                  <AlertCircle size={16} className="text-red-500 shrink-0" />
                  <p className="text-sm text-red-600">{emailSaveError}</p>
                </div>
              )}

              {emailSaveSuccess && (
                <div className="rounded-lg bg-green-50/50 border border-green-400/20 px-3 py-2">
                  <p className="text-sm text-green-700">
                    Email delivery settings saved.
                  </p>
                </div>
              )}

              <button
                type="submit"
                disabled={emailSaving}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-accent text-white font-semibold py-3 hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                {emailSaving ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Email Delivery"
                )}
              </button>
            </form>
          )}
        </section>

        <section className="glass-section p-5 mb-6">
          <h2 className="text-lg font-semibold text-text-primary mb-1">
            Birth Details
          </h2>
          <p className="text-xs text-text-secondary mb-5">
            Update your birth details to recompute your chart.
          </p>

          <form onSubmit={handleUpdateChart} className="space-y-4">
            <label className="block">
              <span className="text-sm text-text-secondary flex items-center gap-1.5 mb-1.5">
                <Calendar size={14} /> Date of Birth
              </span>
              <input
                type="date"
                required
                value={dob}
                onChange={(event) => setDob(event.target.value)}
                className="glass-input-field"
              />
            </label>

            <div>
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
                {(["exact", "approximate", "unknown"] as const).map(
                  (quality) => (
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
                  )
                )}
              </div>
              <p className="mt-2 text-xs text-text-secondary">
                Use <span className="font-medium text-text-primary">approximate</span>{" "}
                if the time is rough. Choose{" "}
                <span className="font-medium text-text-primary">unknown</span> if
                the typed time should be ignored.
              </p>
            </div>

            <label className="block">
              <span className="text-sm text-text-secondary flex items-center gap-1.5 mb-1.5">
                <MapPin size={14} /> Birthplace
              </span>
              <BirthplaceAutocomplete
                required
                value={birthplace}
                onChange={setBirthplace}
              />
            </label>

            {updateError && (
              <div className="flex items-center gap-2 rounded-lg bg-red-50/50 border border-red-400/20 px-3 py-2">
                <AlertCircle size={16} className="text-red-500 shrink-0" />
                <p className="text-sm text-red-600">{updateError}</p>
              </div>
            )}

            {updateSuccess && (
              <div className="rounded-lg bg-green-50/50 border border-green-400/20 px-3 py-2">
                <p className="text-sm text-green-700">
                  Chart updated successfully!
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={updating || !canUpdate}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-accent text-white font-semibold py-3 hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              {updating ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Updating...
                </>
              ) : (
                "Update Chart"
              )}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
