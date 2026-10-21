import { ConvexError } from "convex/values";

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
 * Refuses a call that did not come through our own app server.
 *
 * For public functions that take a `clientKey`: the key is the caller's IP as the
 * app server saw it, and only honest when the app server sent it. Anyone can call
 * Convex straight from the deployment URL in the client bundle, so without this
 * they could pick a fresh key per call and never meet a per-IP limit.
 *
 * APP_SERVER_SECRET is set on the Convex deployment and in the app server's env,
 * never as a VITE_ variable. Unset fails closed, loudly, like GUEST_PASSWORD.
 */
export function requireAppServer(given: string): void {
  const expected = process.env.APP_SERVER_SECRET;
  if (!expected) {
    throw new Error(
      "APP_SERVER_SECRET is not set on the Convex deployment. Set the same random value here and in the " +
        'app server\'s env: npx convex env set APP_SERVER_SECRET "$(openssl rand -hex 32)"',
    );
  }
  if (!constantTimeEqual(given, expected)) {
    throw new ConvexError("Only the app server may call this.");
  }
}
