import Google from "@auth/core/providers/google";
import Resend from "@auth/core/providers/resend";
import { convexAuth } from "@convex-dev/auth/server";

const resendFrom =
  process.env.AUTH_RESEND_FROM ?? "iktara <noreply@forsee.life>";

const SITE_URL = "https://forsee.life";

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
  callbacks: {
    async redirect({ redirectTo }) {
      if (redirectTo?.startsWith("/")) {
        return `${SITE_URL}${redirectTo}`;
      }
      if (redirectTo?.startsWith(SITE_URL)) {
        return redirectTo;
      }
      return `${SITE_URL}/chat`;
    },
  },
});
