import { v } from "convex/values";

import { mutation } from "./_generated/server";
import { constantTimeEqual, requireAppServer } from "./lib/secrets";
import { rateLimiter } from "./rateLimiter";

export type VerifyGuestPasswordResult =
  | { ok: true }
  | { ok: false; reason: "wrong" | "rate_limited"; retryAfterMs?: number };

/**
 * Verifies the single shared guest password for the wedding site.
 *
 * There are no guest accounts — one password unlocks the whole guest-facing site.
 * `clientKey` is derived server-side from the request IP by the caller; it is never
 * supplied by the browser. `serverSecret` proves the caller is that app server,
 * so a direct call cannot pick its own key and dodge the per-IP limit.
 */
export const verifyGuestPassword = mutation({
  args: { password: v.string(), clientKey: v.string(), serverSecret: v.string() },
  returns: v.union(
    v.object({ ok: v.literal(true) }),
    v.object({
      ok: v.literal(false),
      reason: v.union(v.literal("wrong"), v.literal("rate_limited")),
      retryAfterMs: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, { password, clientKey, serverSecret }): Promise<VerifyGuestPasswordResult> => {
    requireAppServer(serverSecret);

    // Rate limit before touching the password, and without `throws: true` — the UI needs
    // a structured result so it can tell "wrong password" from "slow down".
    const limit = await rateLimiter.limit(ctx, "guestGate", { key: clientKey });
    if (!limit.ok) {
      return { ok: false, reason: "rate_limited", retryAfterMs: Math.ceil(limit.retryAfter ?? 0) };
    }

    const expected = process.env.GUEST_PASSWORD;
    if (!expected) {
      // Fail loudly rather than locking every guest out (or, worse, letting everyone in).
      throw new Error(
        "GUEST_PASSWORD is not set on the Convex deployment. Set it with: npx convex env set GUEST_PASSWORD '<password>'",
      );
    }

    if (!constantTimeEqual(password, expected)) {
      return { ok: false, reason: "wrong" };
    }

    return { ok: true };
  },
});
