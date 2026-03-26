"use client";

import { useEffect, useState, useRef } from "react";

interface LedgerStep {
  step: number;
  message: string;
}

interface AnalysisLedgerProps {
  steps: LedgerStep[];
  isComplete: boolean;
}

const COSMIC_WHISPERS = [
  "Tuning into the celestial frequencies…",
  "Asking the moon & stars…",
  "Calculating planetary alignments…",
  "Wandering the cosmos for answers…",
  "Reading the language of light…",
  "Consulting ancient star maps…",
  "Tracing your karmic thread…",
  "Listening to the silence between planets…",
  "Decoding the zodiac whispers…",
  "Aligning with your natal sky…",
];

export default function AnalysisLedger({
  steps,
  isComplete,
}: AnalysisLedgerProps) {
  const [visibleIndex, setVisibleIndex] = useState(0);
  const [cosmicIndex, setCosmicIndex] = useState(() =>
    Math.floor(Math.random() * COSMIC_WHISPERS.length)
  );
  const cosmicTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cycle through cosmic whispers when no real steps yet
  useEffect(() => {
    if (steps.length > 0) {
      if (cosmicTimer.current) clearInterval(cosmicTimer.current);
      cosmicTimer.current = null;
      return;
    }

    cosmicTimer.current = setInterval(() => {
      setCosmicIndex((prev) => (prev + 1) % COSMIC_WHISPERS.length);
    }, 2400);

    return () => {
      if (cosmicTimer.current) clearInterval(cosmicTimer.current);
    };
  }, [steps.length]);

  useEffect(() => {
    if (steps.length === 0) return;
    setVisibleIndex(steps.length - 1);
  }, [steps.length]);

  const showCosmic = steps.length === 0;
  const displayText = showCosmic
    ? COSMIC_WHISPERS[cosmicIndex]
    : steps[visibleIndex]?.message;

  return (
    <div
      className={`overflow-hidden transition-all duration-500 ${
        isComplete
          ? "max-h-0 opacity-0 mt-0 mb-0"
          : "max-h-[80px] opacity-100 mt-1 mb-4"
      }`}
    >
      <div className="flex items-center gap-3">
        {/* Pulsing dot */}
        <div className="relative flex items-center justify-center">
          <span className="absolute h-3 w-3 rounded-full bg-accent/25 animate-ping" />
          <span className="relative h-2 w-2 rounded-full bg-accent" />
        </div>

        {/* Dynamic text */}
        <span
          key={showCosmic ? `cosmic-${cosmicIndex}` : `step-${steps[visibleIndex]?.step}`}
          className="text-sm text-text-secondary animate-ledger-fade"
        >
          {displayText}
        </span>
      </div>

      {/* Shimmer progress bar */}
      <div className="mt-2.5 h-[2px] w-full overflow-hidden rounded-full bg-black/5">
        <div className="shimmer-bar h-full rounded-full" />
      </div>
    </div>
  );
}
