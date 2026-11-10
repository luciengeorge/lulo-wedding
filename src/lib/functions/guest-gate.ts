import * as Sentry from "@sentry/tanstackstart-react";
import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import z from "zod";

import { api } from "@/../convex/_generated/api";
import { fetchAuthMutation, fetchAuthQuery } from "@/lib/auth-server";
import { useGuestSession } from "@/lib/guest-session.server";
import { createLogger } from "@/lib/logger";
import { safeRedirect } from "@/lib/safe-redirect";

const logger = createLogger("guest-gate");

/** Where a guest this device does not know yet gets sent. The route is owned by the UI side. */
const GATE_ROUTE = "/enter";

const TokenSchema = z.object({ token: z.string().trim().min(1).max(64) });

/**
 * Lets a guest in as the party they picked from the name search, and counts it
 * as that party seeing their invitation.
 */
export const enterAs = createServerFn({ method: "POST" })
  .validator(TokenSchema)
  .handler(async ({ data }) => {
    return Sentry.startSpan({ name: "enterAs" }, async () => {
      if (!(await fetchAuthQuery(api.rsvp.tokenIsValid, { token: data.token }))) return false;

      const session = await useGuestSession();
      await session.update({ token: data.token, at: Date.now() });

      // Stats, not the page: a visit that could not be counted must not keep anyone out.
      try {
        await fetchAuthMutation(api.rsvp.recordVisit, { token: data.token, source: "lookup" });
      } catch (error) {
        logger.warn("could not record visit", { error });
      }
      return true;
    });
  });

/**
 * A valid party link is its own way in: whoever holds it is that party. With
 * `remember: false` (a test copy the couple sent themselves) the link opens but
 * this device is not made that party, so its later visits are not counted as theirs.
 */
export const unlockWithToken = createServerFn({ method: "POST" })
  .validator(TokenSchema.extend({ remember: z.boolean().default(true) }))
  .handler(async ({ data }) => {
    return Sentry.startSpan({ name: "unlockWithToken" }, async () => {
      if (!(await fetchAuthQuery(api.rsvp.tokenIsValid, { token: data.token }))) return false;
      if (!data.remember) return true;

      const session = await useGuestSession();
      await session.update({ token: data.token, at: Date.now() });
      return true;
    });
  });

/**
 * True when this device belongs to a party that still exists.
 *
 * Checked against Convex every time, not just read off the cookie: a party the
 * couple deleted or re-imported leaves a dead token behind, and a guest holding
 * one must be asked for their name again, not stranded on "we could not find
 * that invitation".
 */
export const isGuestUnlocked = createServerFn({ method: "GET" }).handler(async () => {
  return Sentry.startSpan({ name: "isGuestUnlocked" }, async () => {
    const session = await useGuestSession();
    const { token } = session.data;
    if (!token) return false;
    if (await fetchAuthQuery(api.rsvp.tokenIsValid, { token })) return true;

    await session.clear();
    return false;
  });
});

/** "Not you?": forgets the party on this device, for a shared phone or a wrong pick. */
export const forgetGuest = createServerFn({ method: "POST" }).handler(async () => {
  return Sentry.startSpan({ name: "forgetGuest" }, async () => {
    const session = await useGuestSession();
    await session.clear();
  });
});

/**
 * Call from a route's `beforeLoad` to require a known guest. Throws a redirect to
 * the name search when this device has not picked a party yet.
 *
 * Pass the route's `location.href` so the search can send them back afterwards.
 */
export async function requireGuestUnlocked(returnTo?: string): Promise<void> {
  const unlocked = await isGuestUnlocked();
  if (!unlocked) {
    // Only carried when it is worth carrying: "/" is where the search goes anyway,
    // and a redirect param pointing at the home page is just noise in the URL.
    const target = safeRedirect(returnTo);
    throw redirect({ to: GATE_ROUTE, search: target === "/" ? {} : { redirect: target } });
  }
}
