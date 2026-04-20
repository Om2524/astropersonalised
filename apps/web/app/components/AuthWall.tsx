"use client";

import { X } from "lucide-react";
import GalaxyLogo from "@/app/components/GalaxyLogo";
import AuthMethods from "@/app/components/AuthMethods";

interface AuthWallProps {
  isOpen: boolean;
  onClose: () => void;
  reason?: string;
  redirectTo?: string;
  dismissible?: boolean;
}

export default function AuthWall({
  isOpen,
  onClose,
  reason = "Sign in to continue",
  redirectTo,
  dismissible = true,
}: AuthWallProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={dismissible ? onClose : undefined}
      />

      <div className="relative w-full max-w-sm mx-4 glass-section p-6 animate-fade-in">
        {dismissible && (
          <button
            onClick={onClose}
            className="absolute right-3 top-3 rounded-lg p-1.5 text-text-secondary hover:text-text-primary hover:bg-white/20 transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        )}

        <div className="flex flex-col items-center mb-6">
          <GalaxyLogo size={40} />
          <h2 className="mt-3 text-lg font-semibold text-text-primary">
            {reason}
          </h2>
          <p className="mt-1 text-xs text-text-secondary text-center">
            Your chart data will be preserved after signing in
          </p>
        </div>

        <AuthMethods redirectTo={redirectTo} />
      </div>
    </div>
  );
}
