"use client";

import { RotateCcw, X } from "lucide-react";

interface RetryPromptProps {
  message: string;
  onRetry: () => void;
  onCancel: () => void;
}

export default function RetryPrompt({
  message,
  onRetry,
  onCancel,
}: RetryPromptProps) {
  return (
    <div className="rounded-2xl border border-accent/20 bg-accent/5 px-4 py-3">
      <p className="text-sm text-text-primary mb-3">{message}</p>
      <div className="flex items-center gap-2">
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 text-xs font-semibold text-white transition-all hover:brightness-110"
        >
          <RotateCcw className="h-3 w-3" /> Try again
        </button>
        <button
          onClick={onCancel}
          className="inline-flex items-center gap-1.5 rounded-full border border-black/10 px-3.5 py-1.5 text-xs text-text-secondary transition-colors hover:bg-white/20"
        >
          <X className="h-3 w-3" /> Cancel
        </button>
      </div>
    </div>
  );
}
