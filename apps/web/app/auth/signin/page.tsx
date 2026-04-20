"use client";

import GalaxyLogo from "@/app/components/GalaxyLogo";
import AuthMethods from "@/app/components/AuthMethods";

export default function SignInPage() {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <GalaxyLogo size={56} />
          <h1 className="mt-4 text-2xl font-semibold text-text-primary">
            Sign in to iktara
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Save readings, unlock premium features, and more
          </p>
        </div>

        <div className="glass-section p-6">
          <AuthMethods redirectTo="/chat" />
        </div>
      </div>
    </div>
  );
}
