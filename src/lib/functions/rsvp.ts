import type { FunctionArgs } from "convex/server";

import * as Sentry from "@sentry/tanstackstart-react";
import { createServerFn } from "@tanstack/react-start";
import z from "zod";

import { api } from "@/../convex/_generated/api";
import { fetchAuthMutation, fetchAuthQuery } from "@/lib/auth-server";
import { getClientKey } from "@/lib/functions/guest-gate";
import { useGuestSession } from "@/lib/guest-session.server";
import { createLogger } from "@/lib/logger";

const logger = createLogger("rsvp.visit");

/**
 * The guest half of the RSVP, fetched and written on the server.
 *
 * Deliberately not the browser's Convex client. That client is configured to
 * hold every query until an auth token arrives, which suits /admin, where the
 * couple sign in. Guests never do: they hold the shared-password cookie and
 * nothing else, so a query issued from their browser waits on a token that will
 * never come. Going through the server also means a guest's invitation is in the
 * first HTML response instead of arriving a round trip later, which is worth
 * having on a phone on mobile data.
 *
 * Nothing here is an authorisation boundary. `convex/rsvp.ts` authorises on the
 * token, the same as it would for a call straight from a browser.
 */

/** Long enough for the 22-character tokens, short enough that a junk value is cheap to reject. */
const TokenSchema = z.string().trim().min(1).max(64);

/** How the guest reached the page, when the route knows better than "they had the link". */
export const VisitViaSchema = z.enum(["lookup", "remembered"]);

const GetRsvpSchema = z.object({
  token: TokenSchema,
  /** The send id an email link carries, so the visit can be joined back to that email. */
  s: z.string().max(64).optional(),
  via: VisitViaSchema.optional(),
});

const SubmitSchema = z.object({
  token: TokenSchema,
  declined: z.boolean(),
  contactEmail: z.string().trim().max(254),
  guestNote: z.string().max(2000).optional(),
  guests: z
    .array(
      z.object({
        guestId: z.string().optional(),
        firstName: z.string().max(100),
        lastName: z.string().max(100),
        email: z.string().max(254).optional(),
        isPlusOne: z.boolean(),
        dietaryNotes: z.string().max(1000).optional(),
        preWedding: z.boolean(),
        wedding: z.boolean(),
        brunch: z.boolean(),
      }),
    )
    .max(20),
});

/**
 * Reads a party's invitation, and remembers the token on this device.
 *
 * The remembering is a convenience, not a credential. It records a token the
 * guest has already proved they hold by opening the link, and unlocks nothing
 * they could not already reach. Treating it as authentication would mean a shared
 * phone or a hotel computer handing the next person someone else's reply.
 */
export const getRsvp = createServerFn({ method: "GET" })
  .validator(GetRsvpSchema)
  .handler(async ({ data }) => {
    return Sentry.startSpan({ name: "getRsvp" }, async () => {
      const result = await fetchAuthQuery(api.rsvp.getByToken, { token: data.token });

      if (result) {
        const session = await useGuestSession();
        await session.update({ ...session.data, token: data.token });

        // Stats, not the page. A guest must never see an error because a visit
        // could not be counted.
        try {
          await fetchAuthMutation(api.rsvp.recordVisit, {
            token: data.token,
            source: data.s ? "email" : (data.via ?? "link"),
            sendId: data.s,
          });
        } catch (error) {
          logger.warn("could not record visit", { error });
        }
      }

      return result;
    });
  });

/** The token this device last opened, if any. Null is the ordinary case, not an error. */
export const getRememberedToken = createServerFn({ method: "GET" }).handler(async () => {
  return Sentry.startSpan({ name: "getRememberedToken" }, async () => {
    const session = await useGuestSession();
    return session.data.token ?? null;
  });
});

export const submitRsvp = createServerFn({ method: "POST" })
  .validator(SubmitSchema)
  .handler(async ({ data }) => {
    return Sentry.startSpan({ name: "submitRsvp" }, async () => {
      // Convex brands `Id<"guests">` as a subtype of string and Zod cannot produce
      // one. Safe because the mutation re-checks every id against the party the
      // token names before it writes anything.
      return await fetchAuthMutation(api.rsvp.submit, data as FunctionArgs<typeof api.rsvp.submit>);
    });
  });

/**
 * Finds a party by name, for a guest who has lost their link. Only for a session
 * already past the guest gate: a lookup hands out links, and the gate is what
 * keeps strangers from typing names at it.
 */
export const lookupParty = createServerFn({ method: "POST" })
  .validator(z.object({ query: z.string().trim().min(1).max(200) }))
  .handler(async ({ data }) => {
    return Sentry.startSpan({ name: "lookupParty" }, async () => {
      const session = await useGuestSession();
      if (session.data.unlocked !== true) throw new Error("The guest gate is locked");

      return await fetchAuthMutation(api.rsvp.lookupByName, { query: data.query, clientKey: getClientKey() });
    });
  });
