"use client";

import { useAction, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { useApp } from "@/app/store";
import { useSubscription } from "@/app/hooks/useSubscription";
import { Check, ArrowLeft, Loader2, Crown, Sparkles, Star } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

/**
 * Hardcoded Polar product IDs — these match the values in convex/polar.ts.
 * Using these directly avoids relying on getConfiguredProducts (which can
 * return empty when products haven't synced yet).
 */
const PRODUCT_IDS: Record<string, string> = {
  dhyan: "458d3978-f6e2-49e3-9a1b-c1d5b2425f32",
  moksha: "25bb8519-70d3-4a1a-83b5-ae2befb2a654",
};

interface TierInfo {
  key: string;
  name: string;
  price: string;
  period: string;
  description: string;
  icon: typeof Star;
  features: string[];
  highlight?: boolean;
}

const TIERS: TierInfo[] = [
  {
    key: "maya",
    name: "Maya",
    price: "Free",
    period: "",
    description: "Begin your astrological journey",
    icon: Star,
    features: [
      "5 queries per week",
      "Daily brief (basic)",
      "3 personality matches",
      "Vedic + KP + Western",
      "Birth chart viewer",
    ],
  },
  {
    key: "dhyan",
    name: "Dhyan",
    price: "$100",
    period: "/month",
    description: "Deep personalized insights",
    icon: Sparkles,
    highlight: true,
    features: [
      "50 queries per week",
      "Daily brief (full depth)",
      "Weekly outlook",
      "10 personality matches",
      "Compare All methods",
      "Save and bookmark readings",
      "Priority support",
    ],
  },
  {
    key: "moksha",
    name: "Moksha",
    price: "$1,000",
    period: "/month",
    description: "Ultimate cosmic clarity",
    icon: Crown,
    features: [
      "500 queries per week",
      "Daily brief (full depth)",
      "Weekly outlook",
      "50 personality matches",
      "Compare All methods",
      "Save and bookmark readings",
      "Priority support",
      "Custom transit alerts",
      "Extended reading history",
    ],
  },
];

export default function PricingPage() {
  const { sessionId } = useApp();
  const currentUser = useQuery(api.functions.users.getCurrentUser);
  const subscription = useSubscription(sessionId);
  const generateCheckoutLink = useAction(api.polar.generateCheckoutLink);
  const [loadingTier, setLoadingTier] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubscribe(tierKey: string) {
    const productId = PRODUCT_IDS[tierKey];
    if (!productId) return;

    if (!currentUser) {
      setError("Sign in first to subscribe");
      return;
    }

    setLoadingTier(tierKey);
    setError(null);
    try {
      const { url } = await generateCheckoutLink({
        productIds: [productId],
        origin: window.location.origin,
        successUrl: window.location.origin + "/chat",
      });
      window.location.href = url;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Checkout failed:", msg);
      setError(msg.includes("authenticated") ? "Please sign in to subscribe" : "Checkout failed — try again");
      setLoadingTier(null);
    }
  }

  return (
    <div className="min-h-dvh px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/chat"
          className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors mb-8"
        >
          <ArrowLeft size={16} />
          Back to Chat
        </Link>

        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-text-primary mb-2">
            Choose Your Path
          </h1>
          <p className="text-text-secondary max-w-md mx-auto">
            Unlock deeper astrological insights with a premium plan
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-6">
          {TIERS.map((tier) => {
            const isCurrent = subscription.tier === tier.key;
            const Icon = tier.icon;
            const productId = PRODUCT_IDS[tier.key] ?? null;
            const isLoading = loadingTier === tier.key;

            return (
              <div
                key={tier.key}
                className={`glass-section p-6 flex flex-col transition-all ${
                  tier.highlight
                    ? "border-accent/30 shadow-lg shadow-accent/5 scale-[1.02]"
                    : ""
                }`}
              >
                {/* Header */}
                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon
                      size={20}
                      className={
                        tier.highlight ? "text-accent" : "text-text-secondary"
                      }
                    />
                    <h2 className="text-lg font-semibold text-text-primary">
                      {tier.name}
                    </h2>
                    {isCurrent && (
                      <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent">
                        Current
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-text-secondary">
                    {tier.description}
                  </p>
                </div>

                {/* Price */}
                <div className="mb-6">
                  <span className="text-3xl font-bold text-text-primary">
                    {tier.price}
                  </span>
                  {tier.period && (
                    <span className="text-sm text-text-secondary">
                      {tier.period}
                    </span>
                  )}
                </div>

                {/* Features */}
                <ul className="space-y-2.5 mb-6 flex-1">
                  {tier.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-2 text-sm text-text-secondary"
                    >
                      <Check
                        size={14}
                        className="mt-0.5 shrink-0 text-accent"
                      />
                      {feature}
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                {tier.key === "maya" ? (
                  isCurrent ? (
                    <div className="rounded-xl border border-accent/20 bg-accent/5 py-3 text-center text-sm font-medium text-accent">
                      Current Plan
                    </div>
                  ) : (
                    <div className="rounded-xl border border-white/30 bg-white/15 py-3 text-center text-sm font-medium text-text-secondary">
                      Free Forever
                    </div>
                  )
                ) : isCurrent ? (
                  <div className="rounded-xl border border-accent/20 bg-accent/5 py-3 text-center text-sm font-medium text-accent">
                    Current Plan
                  </div>
                ) : productId ? (
                  <button
                    onClick={() => handleSubscribe(tier.key)}
                    disabled={isLoading}
                    className={`flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                      tier.highlight
                        ? "bg-accent text-white hover:brightness-110"
                        : "bg-white/30 border border-white/40 text-text-primary hover:bg-white/50"
                    }`}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Redirecting...
                      </>
                    ) : (
                      <>
                        Subscribe to {tier.name} — {tier.price}
                        {tier.period}
                      </>
                    )}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>

        {error && (
          <div className="mt-6 text-center">
            <p className="text-sm text-red-400">{error}</p>
            {!currentUser && (
              <Link href="/auth/signin" className="text-sm text-accent hover:underline mt-1 inline-block">
                Sign in to get started
              </Link>
            )}
          </div>
        )}

        {/* Footer note */}
        <p className="mt-8 text-center text-xs text-text-secondary/50">
          All plans include access to Vedic, KP, and Western astrology systems.
          Payments processed securely via Polar.
        </p>
      </div>
    </div>
  );
}
