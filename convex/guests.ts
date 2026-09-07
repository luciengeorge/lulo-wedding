import { v } from "convex/values";

import { mutation } from "./_generated/server";
import { rateLimiter } from "./rateLimiter";

export type VerifyGuestPasswordResult =
  | { ok: true }
  | { ok: false; reason: "wrong" | "rate_limited"; retryAfterMs?: number };

/**
 * Constant-time string comparison.
 *
 * Convex functions run on V8, not Node, so `node:crypto`'s `timingSafeEqual` is
 * unavailable here — hence the hand-rolled version. Every call walks the full
 * `max(a.length, b.length)` range with no early return, so neither a mismatched
 * character nor a mismatched length shortens the loop and leaks the prefix.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const length = Math.max(a.length, b.length);

  // Seed with the length difference so unequal lengths can never accumulate to 0,
  // without branching out of the loop early.
  let diff = a.length ^ b.length;
  for (let i = 0; i < length; i++) {
    // Out-of-range reads are NaN; `| 0` normalises them to 0 so the XOR stays numeric.
    diff |= (a.charCodeAt(i) | 0) ^ (b.charCodeAt(i) | 0);
  }

  return diff === 0;
}

/**
 * Verifies the single shared guest password for the wedding site.
 *
 * There are no guest accounts — one password unlocks the whole guest-facing site.
 * `clientKey` is derived server-side from the request IP by the caller; it is never
 * supplied by the browser.
 */
export const verifyGuestPassword = mutation({
  args: { password: v.string(), clientKey: v.string() },
  returns: v.union(
    v.object({ ok: v.literal(true) }),
    v.object({
      ok: v.literal(false),
      reason: v.union(v.literal("wrong"), v.literal("rate_limited")),
      retryAfterMs: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, { password, clientKey }): Promise<VerifyGuestPasswordResult> => {
    // Rate limit before touching the secret, and without `throws: true` — the UI needs
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
