import * as Sentry from "@sentry/tanstackstart-react";
import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import z from "zod";

import { api } from "@/../convex/_generated/api";
import { fetchAuthMutation } from "@/lib/auth-server";
import { useGuestSession } from "@/lib/guest-session.server";

/** Where an un-unlocked guest gets sent. The route is owned by the UI side. */
const GATE_ROUTE = "/enter";

/** Keys are only ever IPs; cap the length so a hostile header can't bloat the limiter. */
const MAX_CLIENT_KEY_LENGTH = 100;

const EnterGateSchema = z.object({ password: z.string().min(1) });

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
function getClientKey(): string {
  const forwarded = getRequestHeader("x-forwarded-for")?.split(",")[0];
  const candidate =
    getRequestHeader("x-vercel-forwarded-for") ?? getRequestHeader("x-real-ip") ?? forwarded ?? getRequestIP();

  const key = candidate?.trim();
  return key ? key.slice(0, MAX_CLIENT_KEY_LENGTH) : "unknown";
}

/**
 * Checks the shared guest password and, on success, marks the session unlocked.
 * Returns the structured result so the UI can distinguish a wrong password from
 * being rate limited.
 */
export const enterGate = createServerFn({ method: "POST" })
  .inputValidator(EnterGateSchema)
  .handler(async ({ data }) => {
    return Sentry.startSpan({ name: "enterGate" }, async () => {
      const result = await fetchAuthMutation(api.guests.verifyGuestPassword, {
        password: data.password,
        clientKey: getClientKey(),
      });

      if (result.ok) {
        const session = await useGuestSession();
        await session.update({ unlocked: true, at: Date.now() });
      }

      return result;
    });
  });

export const isGuestUnlocked = createServerFn({ method: "GET" }).handler(async () => {
  return Sentry.startSpan({ name: "isGuestUnlocked" }, async () => {
    const session = await useGuestSession();
    return session.data.unlocked === true;
  });
});

/**
 * Call from a route's `beforeLoad` to require the guest gate. Throws a redirect to
 * the gate page when the session is not unlocked.
 */
export async function requireGuestUnlocked(): Promise<void> {
  const unlocked = await isGuestUnlocked();
  if (!unlocked) {
    throw redirect({ to: GATE_ROUTE });
  }
}
