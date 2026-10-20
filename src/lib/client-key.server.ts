// Its own `.server.ts` module so the gate and the name lookup can share it. Exported
// from guest-gate.ts, which the routes import, it stayed in the client bundle with
// its server-only import, and the production build refused it.
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";

/** Keys are only ever IPs; cap the length so a hostile header can't bloat the limiter. */
const MAX_CLIENT_KEY_LENGTH = 100;

/**
 * Derives the rate-limit key from the request, never from the request body — a
 * caller who could pick their own key could sidestep the limit entirely.
 *
 * Order matters. `x-vercel-forwarded-for` is written by Vercel's edge on every
 * request and cannot be spoofed by the caller, so it wins. Plain `x-forwarded-for`
 * is only consulted after that, and only its leftmost entry, because a client can
 * prepend arbitrary values to it. Falling all the way through to a single shared
 * `"unknown"` bucket fails in the safe direction: it rate-limits harder, and it
 * never hands a caller a private bucket of their own.
 */
export function getClientKey(): string {
  const forwarded = getRequestHeader("x-forwarded-for")?.split(",")[0];
  const candidate =
    getRequestHeader("x-vercel-forwarded-for") ?? getRequestHeader("x-real-ip") ?? forwarded ?? getRequestIP();

  const key = candidate?.trim();
  return key ? key.slice(0, MAX_CLIENT_KEY_LENGTH) : "unknown";
}
