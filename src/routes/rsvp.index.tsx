import { createFileRoute, notFound, redirect } from "@tanstack/react-router";

import { FEATURES } from "@/lib/flags";
import { requireGuestUnlocked } from "@/lib/functions/guest-gate";
import { getRememberedToken } from "@/lib/functions/rsvp";

/**
 * `/rsvp` with no token: the RSVP of whoever this device belongs to. A stranger
 * is sent to find their name first, and comes back here afterwards.
 */
export const Route = createFileRoute("/rsvp/")({
  beforeLoad: async ({ location }) => {
    if (!FEATURES.rsvp) throw notFound();
    await requireGuestUnlocked(location.href);

    const token = await getRememberedToken();
    if (!token) throw redirect({ to: "/enter", search: { redirect: "/rsvp" }, replace: true });
    // Replaced, not pushed: Back from the invitation would land here and bounce straight back.
    throw redirect({ to: "/rsvp/$token", params: { token }, search: { via: "remembered" }, replace: true });
  },
});
