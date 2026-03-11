"use client";

import { useEffect, useState } from "react";

interface LedgerStep {
  step: number;
  message: string;
}

interface AnalysisLedgerProps {
  steps: LedgerStep[];
  isComplete: boolean;
}

export default function AnalysisLedger({
  steps,
  isComplete,
}: AnalysisLedgerProps) {
  const [visibleIndex, setVisibleIndex] = useState(0);

  useEffect(() => {
    if (steps.length === 0) return;
    setVisibleIndex(steps.length - 1);
  }, [steps.length]);

  if (steps.length === 0) return null;

  const currentStep = steps[visibleIndex];

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
          key={currentStep?.step}
          className="text-sm text-text-secondary animate-ledger-fade"
        >
          {currentStep?.message}
        </span>
      </div>

      {/* Shimmer progress bar */}
      <div className="mt-2.5 h-[2px] w-full overflow-hidden rounded-full bg-black/5">
        <div className="shimmer-bar h-full rounded-full" />
      </div>
    </div>
  );
}
