import {
  convexAuthNextjsMiddleware,
  createRouteMatcher,
  nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";

const isProtectedRoute = createRouteMatcher(["/settings/subscription"]);

export default convexAuthNextjsMiddleware(
  async (request, { convexAuth }) => {
    if (isProtectedRoute(request) && !(await convexAuth.isAuthenticated())) {
      return nextjsMiddlewareRedirect(request, "/auth/signin");
    }
  },
  // shouldHandleCode: false — let ConvexAuthProvider (client-side) exchange the
  // ?code param from OAuth/magic-link callbacks using the verifier it stored in
  // localStorage. The middleware proxy can't exchange codes because CONVEX_URL is
  // not available in the Cloudflare edge runtime (only NEXT_PUBLIC_CONVEX_URL is).
  { shouldHandleCode: false }
);

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
