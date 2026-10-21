import * as Sentry from "@sentry/tanstackstart-react";
import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import z from "zod";

import { api } from "@/../convex/_generated/api";
import { getAppServerSecret } from "@/lib/app-server-secret.server";
import { fetchAuthMutation, fetchAuthQuery } from "@/lib/auth-server";
import { getClientKey } from "@/lib/client-key.server";
import { useGuestSession } from "@/lib/guest-session.server";
import { safeRedirect } from "@/lib/safe-redirect";

/** Where an un-unlocked guest gets sent. The route is owned by the UI side. */
const GATE_ROUTE = "/enter";

const EnterGateSchema = z.object({ password: z.string().min(1) });

/**
 * Checks the shared guest password and, on success, marks the session unlocked.
 * Returns the structured result so the UI can distinguish a wrong password from
 * being rate limited.
 */
export const enterGate = createServerFn({ method: "POST" })
  .validator(EnterGateSchema)
  .handler(async ({ data }) => {
    return Sentry.startSpan({ name: "enterGate" }, async () => {
      const result = await fetchAuthMutation(api.guests.verifyGuestPassword, {
        password: data.password,
        clientKey: getClientKey(),
        serverSecret: getAppServerSecret(),
      });

      if (result.ok) {
        const session = await useGuestSession();
        await session.update({ unlocked: true, at: Date.now() });
      }

      return result;
    });
  });

/**
 * Unlocks the gate for someone holding a valid party link. The link is already
 * a better credential than the shared password, which every guest knows, so
 * asking for both would only stop the people the link was sent to.
 */
export const unlockWithToken = createServerFn({ method: "POST" })
  .validator(z.object({ token: z.string().trim().min(1).max(64) }))
  .handler(async ({ data }) => {
    return Sentry.startSpan({ name: "unlockWithToken" }, async () => {
      if (!(await fetchAuthQuery(api.rsvp.tokenIsValid, { token: data.token }))) return false;

      const session = await useGuestSession();
      await session.update({ ...session.data, unlocked: true, at: Date.now() });
      return true;
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
 *
 * Pass the route's `location.href` so the gate can send them back afterwards.
 * Without it every party who taps their personal RSVP link, and none of them have
 * the cookie the first time, types the password and lands on the save-the-date
 * with their own link gone from the screen.
 */
export async function requireGuestUnlocked(returnTo?: string): Promise<void> {
  const unlocked = await isGuestUnlocked();
  if (!unlocked) {
    // Only carried when it is worth carrying: "/" is where the gate goes anyway,
    // and a redirect param pointing at the home page is just noise in the URL.
    const target = safeRedirect(returnTo);
    throw redirect({ to: GATE_ROUTE, search: target === "/" ? {} : { redirect: target } });
  }
}
