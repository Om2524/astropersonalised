"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/app/store";
import { ArrowRight } from "lucide-react";
import GalaxyLogo from "@/app/components/GalaxyLogo";

export default function Home() {
  const router = useRouter();
  const { profile, chart } = useApp();

  useEffect(() => {
    if (profile && chart) {
      router.push("/chat");
    }
  }, [profile, chart, router]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="max-w-lg text-center">
        <div className="mb-6 flex justify-center">
          <GalaxyLogo size={80} />
        </div>

        <h1 className="mb-3 text-5xl font-bold tracking-tight text-text-primary sm:text-6xl">
          Tara
        </h1>

        <p className="mb-2 text-lg text-accent font-medium">
          Personalized Astrology AI
        </p>

        <p className="mb-10 text-text-secondary">
          Perplexity for astrology, personalized to your birth chart.
          Ask life questions, get chart-grounded answers across Vedic, KP, and Western systems.
        </p>

        <button
          onClick={() => router.push("/onboarding")}
          className="group inline-flex items-center gap-2 rounded-full bg-accent px-8 py-3.5 text-base font-semibold text-white transition-all hover:brightness-110 hover:shadow-lg hover:shadow-accent/20"
        >
          Get Started
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </button>

        <div className="mt-16 grid grid-cols-3 gap-6 text-center text-sm text-text-secondary">
          <div>
            <div className="mb-1 text-2xl font-bold text-text-primary">3</div>
            <div>Astrology Systems</div>
          </div>
          <div>
            <div className="mb-1 text-2xl font-bold text-text-primary">27</div>
            <div>Nakshatras</div>
          </div>
          <div>
            <div className="mb-1 text-2xl font-bold text-text-primary">AI</div>
            <div>Powered</div>
          </div>
        </div>
      </div>
    </main>
  );
}
