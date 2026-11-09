import * as Sentry from "@sentry/tanstackstart-react";
import { createServerFn } from "@tanstack/react-start";

import { api } from "@/../convex/_generated/api";
import { fetchAuthQuery } from "@/lib/auth-server";
import { useGuestSession } from "@/lib/guest-session.server";
import { createLogger } from "@/lib/logger";
import { RSVP_EVENTS, type RsvpEventKey } from "@/lib/rsvp-rules";

const logger = createLogger("schedule");

/**
 * Which events the home page lists.
 *
 * The pre-wedding and brunch are for some guests only, so a party is shown just
 * its own events. The page only knows the party when this device has opened its
 * invitation link before. Everyone else got in with the shared password and sees
 * the wedding day, plus a way to find their invitation.
 */
export const getScheduleEvents = createServerFn({ method: "GET" }).handler(async () => {
  return Sentry.startSpan({ name: "getScheduleEvents" }, async () => {
    const session = await useGuestSession();
    const token = session.data.token;
    // The schedule is the only part of the page that needs the party, so a
    // failed lookup shows the password view rather than an error page.
    const invitation = token
      ? await fetchAuthQuery(api.rsvp.getByToken, { token }).catch((error: unknown) => {
          logger.warn("could not load schedule", { error });
          return null;
        })
      : null;

    if (!invitation) return { known: false, events: ["wedding"] as RsvpEventKey[] };

    const { party } = invitation;
    const events = RSVP_EVENTS.filter((event) => party[event.invitedFlag]).map((event) => event.key);
    // A party with nothing attached yet still gets the wedding day rather than an empty list.
    return { known: true, events: events.length > 0 ? events : (["wedding"] as RsvpEventKey[]) };
  });
});
