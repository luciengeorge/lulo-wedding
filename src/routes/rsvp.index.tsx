import { createFileRoute, notFound, redirect } from "@tanstack/react-router";

import { RsvpHeader, RsvpShell } from "@/components/rsvp/rsvp-shell";
import { FEATURES } from "@/lib/flags";
import { requireGuestUnlocked } from "@/lib/functions/guest-gate";
import { getRememberedToken } from "@/lib/functions/rsvp";
import { seo } from "@/lib/seo";

/**
 * `/rsvp` with no token.
 *
 * A guest who replied months ago and has lost the WhatsApp message has nowhere
 * else to go. If this device has opened a valid invitation before, send them
 * straight back to it; otherwise say plainly that we cannot tell which
 * invitation is theirs, rather than showing an empty form or a 404.
 *
 * The remembered token is a convenience, not a credential: it only replays a
 * link the guest already had. Anyone on a device that never opened an invitation
 * gets nothing, which is the point.
 */
export const Route = createFileRoute("/rsvp/")({
  beforeLoad: async ({ location }) => {
    if (!FEATURES.rsvp) throw notFound();
    await requireGuestUnlocked(location.href);

    const token = await getRememberedToken();
    if (token) throw redirect({ to: "/rsvp/$token", params: { token }, search: { via: "remembered" } });
  },
  head: () => ({
    meta: seo({
      title: "RSVP",
      description: "Reply to Laura and Lucien's invitation.",
      path: "/rsvp",
      noPreview: true,
    }),
  }),
  component: NoInvitation,
});

function NoInvitation() {
  return (
    <RsvpShell>
      <RsvpHeader
        title="Which invitation is yours?"
        subtitle="We could not tell from this device. Open the link Laura and Lucien sent you, and it will remember you from then on."
      />
      <p className="mt-6 text-center font-display text-[15px] leading-[22px] text-faded">
        Lost the message? Send either of them a note and they will send it again.
      </p>
    </RsvpShell>
  );
}
