"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Info,
  Eye,
  Sparkles,
} from "lucide-react";
import type { ReadingResponse } from "@/app/types";
import ReactMarkdown from "react-markdown";

interface ReadingCardProps {
  reading: ReadingResponse;
  onAskFollowUp?: (question: string) => void;
  hideDirectAnswer?: boolean;
}

function CollapsibleSection({
  title,
  icon,
  children,
  defaultOpen = false,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-t border-black/5">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 py-2.5 text-left text-sm font-medium text-text-secondary transition-colors hover:text-text-primary"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
        {icon}
        {title}
      </button>
      <div
        className={`overflow-hidden transition-all duration-300 ${
          open ? "max-h-[1000px] opacity-100 pb-3" : "max-h-0 opacity-0"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

export default function ReadingCard({
  reading,
  onAskFollowUp,
  hideDirectAnswer = false,
}: ReadingCardProps) {
  return (
    <div className="space-y-1">
      {/* Direct Answer */}
      {!hideDirectAnswer && (
        <div className="text-sm leading-relaxed text-text-primary">
          <ReactMarkdown>{reading.direct_answer}</ReactMarkdown>
        </div>
      )}

      {/* Why This Answer */}
      {reading.why_this_answer && (
        <CollapsibleSection title="Why This Answer" defaultOpen>
          <div className="text-sm leading-relaxed text-text-secondary">
            <ReactMarkdown>{reading.why_this_answer}</ReactMarkdown>
          </div>
        </CollapsibleSection>
      )}

      {/* Key Factors */}
      {reading.key_factors?.length > 0 && (
        <CollapsibleSection title="Key Factors" icon={<Sparkles className="h-3.5 w-3.5 text-accent" />}>
          <div className="flex flex-wrap gap-1.5">
            {reading.key_factors.map((factor, i) => (
              <span
                key={i}
                className="rounded-full bg-accent/10 px-2.5 py-1 text-xs text-accent font-medium"
              >
                {factor}
              </span>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Method View */}
      {reading.method_view && (
        <CollapsibleSection title="Method View" icon={<Eye className="h-3.5 w-3.5" />} defaultOpen={false}>
          <p className="text-xs leading-relaxed text-text-secondary">
            {reading.method_view}
          </p>
        </CollapsibleSection>
      )}

      {/* Confidence Note */}
      {reading.confidence_note && (
        <div className="mt-2 flex items-start gap-2 rounded-lg bg-accent/8 border border-accent/15 px-3 py-2">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
          <p className="text-xs leading-relaxed text-text-secondary">
            {reading.confidence_note}
          </p>
        </div>
      )}

      {/* What to Watch */}
      {reading.what_to_watch && (
        <div className="mt-2 rounded-lg bg-accent/8 border border-accent/15 px-3 py-2">
          <p className="mb-1 text-xs font-medium text-accent">What to Watch</p>
          <p className="text-xs leading-relaxed text-text-secondary">
            {reading.what_to_watch}
          </p>
        </div>
      )}

      {/* Explore Further */}
      {reading.explore_further?.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-xs font-medium text-text-secondary">
            Explore Further
          </p>
          <div className="flex flex-wrap gap-1.5">
            {reading.explore_further.map((q, i) => (
              <button
                key={i}
                onClick={() => onAskFollowUp?.(q)}
                className="rounded-full border border-black/8 bg-white/30 px-3 py-1 text-xs text-text-secondary transition-colors hover:border-accent/30 hover:text-accent hover:bg-accent/5"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
