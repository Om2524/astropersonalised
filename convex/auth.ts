import { convexAuth } from "@convex-dev/auth/server";
import authConfig from "./auth.config";

/**
 * Convex Auth setup for Sudarshan.
 *
 * Exports auth helpers (signIn, signOut, store) and
 * the getAuthUserId / getAuthSessionId utilities for
 * use in queries and mutations.
 */
export const { auth, signIn, signOut, store } = convexAuth(authConfig);
