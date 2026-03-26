import Google from "@auth/core/providers/google";
import Resend from "@auth/core/providers/resend";
import { convexAuth } from "@convex-dev/auth/server";

const resendFrom =
  process.env.AUTH_RESEND_FROM ?? "Forsee <noreply@forsee.life>";

export const { auth, signIn, signOut, store } = convexAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
    Resend({
      from: resendFrom,
      apiKey: process.env.AUTH_RESEND_KEY,
    }),
  ],
});
