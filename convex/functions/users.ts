import { query, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

/**
 * Get the currently authenticated user.
 *
 * Returns null if the user is not authenticated (anonymous session).
 *
 * @returns The user document or null
 */
export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }
    return await ctx.db.get(userId);
  },
});

/**
 * Grant unlimited queries to a user by email.
 *
 * Sets unlimitedQueries: true on the user document, bypassing all
 * weekly rate limits. Safe to call multiple times (idempotent).
 * Internal-only — cannot be called from the browser.
 *
 * After deploy, activate via CLI:
 *   npx convex run functions/users:grantUnlimitedQueries --prod '{"email":"user@example.com"}'
 */
export const grantUnlimitedQueries = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .unique();

    if (!user) {
      throw new Error(`No user found with email: ${email}`);
    }

    await ctx.db.patch(user._id, { unlimitedQueries: true });
    return { patched: user._id, email };
  },
});

