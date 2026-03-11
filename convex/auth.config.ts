import Google from "@auth/core/providers/google";
import Resend from "@auth/core/providers/resend";
import type { ConvexAuthConfig } from "@convex-dev/auth/server";

/**
 * Auth provider configuration for Sudarshan.
 *
 * - Google OAuth: primary social sign-in
 * - Resend: magic link email authentication
 *
 * Environment variables required:
 * - AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET
 * - AUTH_RESEND_KEY
 */
export default {
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      // Convex Auth handles OIDC issuer discovery internally
      issuer: undefined,
    }),
    Resend({
      from: "Sudarshan <auth@forsee.life>",
      apiKey: process.env.AUTH_RESEND_KEY,
    }),
  ],
} satisfies ConvexAuthConfig;
