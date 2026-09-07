import { v } from "convex/values";

import { internalAction, query } from "./_generated/server";
import { authComponent } from "./betterAuth/auth";

/**
 * GDPR-compliant data export. Returns a JSON object containing every record the
 * user owns across all app tables. Add new tables here as your schema grows —
 * users have a legal right (UK GDPR Art. 20) to receive their data on request.
 */
export const exportMyData = query({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    // Add per-table fetches here as the schema grows. Example:
    //   const bookmarks = await ctx.db.query("bookmarks").withIndex("by_user", q => q.eq("userId", user._id)).collect();

    return {
      exportedAt: new Date().toISOString(),
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        emailVerified: user.emailVerified,
        createdAt: user._creationTime,
      },
      // bookmarks,
      // ...add more app tables here
    };
  },
});

/**
 * Server-side trigger called by `authClient.deleteUser()` cleanup hooks.
 * The actual deletion is handled by better-auth's `user.deleteUser` flow —
 * this action is for any *additional* per-user cleanup specific to your app
 * (e.g. cancel Polar subscription, delete uploaded files from storage, etc.).
 *
 * Wire this in convex/betterAuth/auth.ts under user.deleteUser.beforeDelete.
 */
export const cleanupUserData = internalAction({
  args: { userId: v.string() },
  handler: async (_ctx, { userId: _userId }) => {
    // TODO: cancel Polar subscription, delete user files from ctx.storage,
    //   purge any user-owned rows in app tables.
    //   Add as your schema grows.
    return { ok: true };
  },
});
