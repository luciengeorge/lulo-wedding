import * as Sentry from "@sentry/tanstackstart-react";
import { createServerFn } from "@tanstack/react-start";
import z from "zod";

import type { Faq, Shown, TravelNote, WeddingEvent } from "@/lib/wedding-info";

import { api } from "@/../convex/_generated/api";
import { fetchAuthQuery } from "@/lib/auth-server";
import { useGuestSession } from "@/lib/guest-session.server";
import { createLogger } from "@/lib/logger";
import { type EventFlags, invitedNames, RSVP_EVENTS } from "@/lib/rsvp-rules";
import { FAQS, TRAVEL_NOTES, WEDDING_EVENTS } from "@/lib/wedding-details.server";
import { isPublic, showTo } from "@/lib/wedding-info";

const logger = createLogger("home-content");

/** One row on the home page's schedule. `for` names who it is for when that is not the whole party. */
export type ScheduleEvent = WeddingEvent & { for: string[] };

export type ShownFaq = Shown<Faq>;
export type ShownTravelNote = Shown<TravelNote>;

type Invitation = {
  displayName: string;
  headCount: number;
  invitedTo: EventFlags;
  defaultInvitedTo: EventFlags;
  guests: { firstName: string; isPlusOne: boolean; invitedTo: EventFlags }[];
};

const HomeContentSchema = z.object({ as: z.string().max(64).optional() });

/**
 * Everything on the home page that depends on who is looking.
 *
 * The pre-wedding and brunch are for some guests only, so a party is sent just
 * its own events and the details tagged with them; the rest never leave the
 * server. The page only knows the party when this device has opened its
 * invitation link before. Everyone else got in with the shared password and gets
 * what is public, plus `hidden`: how much is held back in each section, so the
 * page can tell them there is more once they find their invitation. A known party
 * is never told about events it is not invited to.
 *
 * `as` is the couple's preview: a party id, honoured only for a signed-in admin
 * (Convex checks), and otherwise ignored.
 */
export const getHomeContent = createServerFn({ method: "GET" })
  .validator(HomeContentSchema)
  .handler(async ({ data }) => {
    return Sentry.startSpan({ name: "getHomeContent" }, async () => {
      const preview = data.as ? await previewOf(data.as) : null;
      const session = await useGuestSession();
      const invitation = preview ?? (await invitationFor(session.data.token));

      const keys = invitation ? RSVP_EVENTS.map((event) => event.key).filter((key) => invitation.invitedTo[key]) : [];
      // A party with nothing attached yet still gets the wedding day rather than an empty list.
      const events =
        invitation && keys.length > 0
          ? keys.map((key) => scheduleEvent(key, invitedNames(invitation, invitation.guests, key)))
          : [scheduleEvent("wedding", [])];

      return {
        known: invitation !== null,
        preview: preview?.displayName ?? null,
        events,
        faqs: showTo(FAQS, keys),
        travelNotes: showTo(TRAVEL_NOTES, keys),
        hidden: invitation
          ? { travel: 0, faq: 0 }
          : {
              travel: TRAVEL_NOTES.filter((note) => !isPublic(note)).length,
              faq: FAQS.filter((faq) => !isPublic(faq)).length,
            },
      };
    });
  });

function scheduleEvent(key: ScheduleEvent["key"], names: string[]): ScheduleEvent {
  const event = WEDDING_EVENTS.find((candidate) => candidate.key === key);
  if (!event) throw new Error(`No details for the ${key} event`);
  return { ...event, for: names };
}

async function previewOf(partyId: string): Promise<Invitation | null> {
  // A guest who adds ?as= gets the error from Convex's admin check, and their own page.
  return await fetchAuthQuery(api.admin.previewInvitation, { partyId }).catch(() => null);
}

/** The party this device has opened the link of, if any. */
async function invitationFor(token: string | undefined): Promise<Invitation | null> {
  if (!token) return null;

  // The schedule is the only part of the page that needs the party, so a failed
  // lookup shows the password view rather than an error page.
  const result = await fetchAuthQuery(api.rsvp.getByToken, { token }).catch((error: unknown) => {
    logger.warn("could not load schedule", { error });
    return null;
  });
  if (!result) return null;

  const { party, guests } = result;
  return {
    displayName: party.displayName,
    headCount: party.headCount,
    invitedTo: {
      preWedding: party.invitedToPreWedding,
      wedding: party.invitedToWedding,
      brunch: party.invitedToBrunch,
    },
    defaultInvitedTo: party.defaultInvitedTo,
    guests,
  };
}
