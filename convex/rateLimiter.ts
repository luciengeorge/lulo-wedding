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
  // Generic: per-second hot-loop guard
  hotPath: { kind: "token bucket", rate: 1, period: SECOND, capacity: 5 },
});
