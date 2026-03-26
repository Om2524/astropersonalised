"use client";

import { useState, FormEvent } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { Loader2, Mail } from "lucide-react";
import GalaxyLogo from "@/app/components/GalaxyLogo";

export default function SignInPage() {
  const { signIn } = useAuthActions();
  const [email, setEmail] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGoogleSignIn() {
    setGoogleLoading(true);
    setError(null);
    try {
      await signIn("google", { redirectTo: "/chat" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sign in with Google");
      setGoogleLoading(false);
    }
  }

  async function handleEmailSignIn(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await signIn("resend", { email: email.trim(), redirectTo: "/chat" });
      setEmailSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send magic link");
    } finally {
      setLoading(false);
    }
  }

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

        <div className="glass-section p-6 space-y-5">
          {/* Google OAuth */}
          <button
            onClick={handleGoogleSignIn}
            disabled={googleLoading}
            className="w-full flex items-center justify-center gap-3 rounded-xl border border-white/40 bg-white/40 px-4 py-3 text-sm font-medium text-text-primary transition-all hover:bg-white/60 disabled:opacity-50"
          >
            {googleLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <svg className="h-4 w-4" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
            )}
            Continue with Google
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-black/8" />
            <span className="text-xs text-text-secondary/50">or</span>
            <div className="flex-1 h-px bg-black/8" />
          </div>

          {/* Email magic link */}
          {emailSent ? (
            <div className="text-center py-4">
              <Mail className="mx-auto h-10 w-10 text-accent mb-3" />
              <p className="text-sm font-medium text-text-primary mb-1">
                Check your email
              </p>
              <p className="text-xs text-text-secondary">
                We sent a magic link to{" "}
                <span className="font-medium">{email}</span>
              </p>
              <button
                onClick={() => setEmailSent(false)}
                className="mt-4 text-xs text-accent hover:underline"
              >
                Use a different email
              </button>
            </div>
          ) : (
            <form onSubmit={handleEmailSignIn} className="space-y-3">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="glass-input-field"
              />
              <button
                type="submit"
                disabled={loading || !email.trim()}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-accent text-white font-semibold py-3 hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Mail className="h-4 w-4" />
                )}
                Send Magic Link
              </button>
            </form>
          )}

          {/* Error */}
          {error && (
            <p className="text-xs text-red-500 text-center">{error}</p>
          )}
        </div>
      </div>
    </div>
  );
}
