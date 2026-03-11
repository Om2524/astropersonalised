import Google from "@auth/core/providers/google";
import Resend from "@auth/core/providers/resend";
import type { ConvexAuthConfig } from "@convex-dev/auth/server";

// Strip issuer from Google OIDC — Convex Auth handles discovery internally
const { issuer: _, ...google } = Google({
  clientId: process.env.AUTH_GOOGLE_ID,
  clientSecret: process.env.AUTH_GOOGLE_SECRET,
});

export default {
  providers: [
    google,
    Resend({
      from: "Sudarshan <auth@forsee.life>",
      apiKey: process.env.AUTH_RESEND_KEY,
    }),
  ],
} satisfies ConvexAuthConfig;
