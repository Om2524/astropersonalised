"use client";

import { useAction, useQuery } from "convex/react";
import { useConvexAuth } from "convex/react";
import { api } from "@convex/_generated/api";
import { useApp } from "@/app/store";
import { useSubscription } from "@/app/hooks/useSubscription";
import AuthWall from "@/app/components/AuthWall";
import {
  Check,
  ArrowLeft,
  Loader2,
  Crown,
  Sparkles,
  Star,
  MessageCircle,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

interface OfferInfo {
  key: "maya" | "messageBundle" | "moksha";
  name: string;
  badge: string;
  description: string;
  icon: typeof Star;
  highlight?: boolean;
  features: string[];
}

const OFFERS: OfferInfo[] = [
  {
    key: "maya",
    name: "Maya",
    badge: "Free",
    description: "A gentle weekly allowance to explore your chart.",
    icon: Star,
    features: [
      "5 free messages per week",
      "Daily brief",
      "Birth chart viewer",
      "Top 3 personality matches",
    ],
  },
  {
    key: "messageBundle",
    name: "Message Pack",
    badge: "One-time",
    description: "Buy 50 additional messages whenever you need them.",
    icon: MessageCircle,
    highlight: true,
    features: [
      "50 message credits",
      "Works with Vedic, KP, and Western readings",
      "Uses local pricing at checkout",
      "Great for occasional deep dives",
    ],
  },
  {
    key: "moksha",
    name: "Moksha Unlimited",
    badge: "Premium",
    description: "Unlimited messages and the full premium experience.",
    icon: Crown,
    features: [
      "Unlimited messages",
      "Compare All method access",
      "Weekly outlook",
      "Expanded personality matches",
      "Priority billing support",
    ],
  },
];

export default function PricingPage() {
  const { sessionId } = useApp();
  const { isAuthenticated } = useConvexAuth();
  const currentUser = useQuery(api.functions.users.getCurrentUser, {});
  const subscription = useSubscription(sessionId, currentUser?._id);
  const configuredProducts = useQuery(api.polar.getConfiguredProducts, {});
  const generateCheckoutLink = useAction(api.polar.generateCheckoutLink);
  const [loadingOffer, setLoadingOffer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAuthWall, setShowAuthWall] = useState(false);

  async function handleCheckout(productKey: "messageBundle" | "moksha") {
    const productId =
      productKey === "messageBundle"
        ? configuredProducts?.dhyan?.id
        : configuredProducts?.moksha?.id;

    if (!productId) {
      setError("Checkout is still syncing. Please try again in a moment.");
      return;
    }

    if (!isAuthenticated) {
      setShowAuthWall(true);
      return;
    }

    setLoadingOffer(productKey);
    setError(null);

    try {
      const checkoutPromise = generateCheckoutLink({
        productIds: [productId],
        origin: window.location.origin,
        successUrl: window.location.origin + "/chat",
      });

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("__timeout__")), 15_000)
      );

      const { url } = await Promise.race([checkoutPromise, timeoutPromise]);
      window.location.href = url;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Checkout failed:", msg);
      if (msg === "__timeout__") {
        setError("Checkout is taking too long. Please try again.");
      } else if (msg.includes("authenticated") || msg.includes("sign in")) {
        setError("Please sign in to purchase.");
        setShowAuthWall(true);
      } else {
        setError("Checkout failed. Please try again.");
      }
      setLoadingOffer(null);
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
          <p className="text-text-secondary max-w-2xl mx-auto">
            Start with the free weekly allowance, buy messages when you need
            more, or unlock Moksha for unlimited access. Polar shows local
            pricing at checkout, including INR where available.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-6">
          {OFFERS.map((offer) => {
            const Icon = offer.icon;
            const isMoksha = offer.key === "moksha";
            const isCurrentMoksha = isMoksha && subscription.isUnlimited;
            const isBundle = offer.key === "messageBundle";
            const isLoading = loadingOffer === offer.key;

            return (
              <div
                key={offer.key}
                className={`glass-section p-6 flex flex-col transition-all ${
                  offer.highlight
                    ? "border-accent/30 shadow-lg shadow-accent/5 scale-[1.02]"
                    : ""
                }`}
              >
                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon
                      size={20}
                      className={
                        offer.highlight ? "text-accent" : "text-text-secondary"
                      }
                    />
                    <h2 className="text-lg font-semibold text-text-primary">
                      {offer.name}
                    </h2>
                    <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold text-text-secondary">
                      {offer.badge}
                    </span>
                    {isCurrentMoksha && (
                      <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent">
                        Current
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-text-secondary">
                    {offer.description}
                  </p>
                </div>

                <div className="mb-6">
                  {offer.key === "maya" ? (
                    <span className="text-3xl font-bold text-text-primary">
                      Free
                    </span>
                  ) : offer.key === "messageBundle" ? (
                    <>
                      <span className="text-3xl font-bold text-text-primary">
                        50 messages
                      </span>
                      <p className="mt-1 text-xs text-text-secondary">
                        One-time purchase, localized at checkout
                      </p>
                    </>
                  ) : (
                    <>
                      <span className="text-3xl font-bold text-text-primary">
                        Unlimited
                      </span>
                      <p className="mt-1 text-xs text-text-secondary">
                        Monthly plan, localized at checkout
                      </p>
                    </>
                  )}
                </div>

                {isBundle && !subscription.isUnlimited && (
                  <div className="mb-4 rounded-xl border border-accent/15 bg-accent/5 px-3 py-2 text-xs text-accent">
                    You currently have {subscription.messagesAvailable ?? 0} messages available.
                  </div>
                )}

                <ul className="space-y-2.5 mb-6 flex-1">
                  {offer.features.map((feature) => (
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

                {offer.key === "maya" ? (
                  <div className="rounded-xl border border-white/30 bg-white/15 py-3 text-center text-sm font-medium text-text-secondary">
                    Included by default
                  </div>
                ) : isCurrentMoksha ? (
                  <div className="rounded-xl border border-accent/20 bg-accent/5 py-3 text-center text-sm font-medium text-accent">
                    Current Plan
                  </div>
                ) : (
                  <button
                    onClick={() =>
                      handleCheckout(
                        offer.key as "messageBundle" | "moksha"
                      )
                    }
                    disabled={isLoading}
                    className={`flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                      offer.highlight
                        ? "bg-accent text-white hover:brightness-110"
                        : "bg-white/30 border border-white/40 text-text-primary hover:bg-white/50"
                    }`}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Redirecting...
                      </>
                    ) : isBundle ? (
                      "Buy 50 Messages"
                    ) : (
                      "Go Unlimited"
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {error && (
          <div className="mt-6 text-center">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        <p className="mt-8 text-center text-xs text-text-secondary/50">
          Payments are processed securely via Polar. Apple Pay, Google Pay,
          Link, and cards are handled at checkout based on availability.
        </p>
      </div>

      <AuthWall
        isOpen={showAuthWall}
        onClose={() => setShowAuthWall(false)}
        reason="Sign in to purchase"
      />
    </div>
  );
}
