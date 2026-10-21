import { HOUR, MINUTE, RateLimiter, SECOND } from "@convex-dev/rate-limiter";

import { components } from "./_generated/api";

/**
 * Project-wide rate limits, keyed by name.
 *
 * Add new limits as you grow. Use them inside Convex queries/mutations:
 *
 *   await rateLimiter.limit(ctx, "search", { key: userId, throws: true });
 *
 * Patterns:
 * - "token bucket": allows bursts up to `capacity`, refills at `rate` per `period`.
 * - "fixed window": resets every `period`, allowing `rate` calls per window.
 */
export const rateLimiter = new RateLimiter(components.rateLimiter, {
  // Auth: limit signup attempts per IP/identifier
  signup: { kind: "fixed window", rate: 5, period: HOUR },
  // Auth: limit forgot-password requests
  forgotPassword: { kind: "fixed window", rate: 3, period: HOUR },
  // Auth: limit magic-link requests per email
  magicLink: { kind: "token bucket", rate: 5, period: HOUR, capacity: 3 },
  // Search: per-user query budget
  search: { kind: "token bucket", rate: 30, period: MINUTE, capacity: 10 },
  // Sync: per-user budget across all third-party API fetches — protects
  //   your upstream API allowances when a single user has many sources.
  syncSource: { kind: "token bucket", rate: 60, period: MINUTE, capacity: 20 },
  // Guest gate: shared-password attempts per client IP. Fixed window rather than a
  //   token bucket so a whole family behind one NAT/venue-wifi IP gets a predictable
  //   allowance that fully resets, instead of a slowly-refilling budget that a second
  //   person inherits half-empty. 20 per 15 min covers ~10 guests fumbling twice each
  //   on the same IP, while capping an attacker at ~1,900 guesses/day per IP — nowhere
  //   near enough against the passphrase's keyspace.
  guestGate: { kind: "fixed window", rate: 20, period: 15 * MINUTE },
  // RSVP: submits per party token. Generous, because a family legitimately edits
  //   their reply several times in one sitting, and the point is only to stop one
  //   link being used to fire confirmation emails in a loop.
  rsvpSubmit: { kind: "token bucket", rate: 20, period: HOUR, capacity: 8 },
  // RSVP: name lookups per client IP. A match hands out a party's link, so this
  //   caps how fast anyone can guess names, on the same terms as the password gate.
  nameLookup: { kind: "fixed window", rate: 20, period: 15 * MINUTE },
  // RSVP: name lookups across everyone. A backstop, no longer the main guard: the
  //   mutation now refuses any caller without APP_SERVER_SECRET, so `clientKey` is
  //   always the IP our server saw and cannot be rotated per call. What is left is
  //   someone with many real IPs, each held to the limit above. Raised from 200,
  //   because at 200 one such person could lock every guest out of the search; at
  //   1,000 the whole list searching on invitation day stays well under it.
  nameLookupGlobal: { kind: "fixed window", rate: 1000, period: HOUR },
  // Generic: per-second hot-loop guard
  hotPath: { kind: "token bucket", rate: 1, period: SECOND, capacity: 5 },
});
