import { v } from "convex/values";

import { internalMutation } from "../_generated/server";

/**
 * Storage for captured outbound email.
 *
 * Separate from send.ts because that file carries `"use node"`, and a Node-runtime
 * module may only define actions. Internal either way, so it is unreachable from a
 * browser even on a deployment where capturing is switched on.
 */
export const record = internalMutation({
  args: { to: v.string(), subject: v.string(), template: v.string(), html: v.string() },
  returns: v.null(),
  handler: async (ctx, email) => {
    await ctx.db.insert("capturedEmails", email);
    return null;
  },
});
