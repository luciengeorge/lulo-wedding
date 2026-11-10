import type { FunctionArgs } from "convex/server";

import * as Sentry from "@sentry/tanstackstart-react";
import { createServerFn } from "@tanstack/react-start";
import z from "zod";

import { api } from "@/../convex/_generated/api";
import { getAppServerSecret } from "@/lib/app-server-secret.server";
import { fetchAuthMutation, fetchAuthQuery } from "@/lib/auth-server";
import { getClientKey } from "@/lib/client-key.server";
import { useGuestSession } from "@/lib/guest-session.server";
import { createLogger } from "@/lib/logger";

const logger = createLogger("rsvp.visit");

/**
 * The guest half of the RSVP, fetched and written on the server.
 *
 * Deliberately not the browser's Convex client. That client is configured to
 * hold every query until an auth token arrives, which suits /admin, where the
 * couple sign in. Guests never do: they hold the guest cookie and nothing
 * else, so a query issued from their browser waits on a token that will
 * never come. Going through the server also means a guest's invitation is in the
 * first HTML response instead of arriving a round trip later, which is worth
 * having on a phone on mobile data.
 *
 * Apart from the name lookup, nothing here is an authorisation boundary.
 * `convex/rsvp.ts` authorises on the token, the same as it would for a call
 * straight from a browser. The lookup has no token to go on, so Convex only
 * answers it for this server (APP_SERVER_SECRET), which passes on the caller's IP
 * for the rate limit.
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
  /** A test copy the couple sent themselves. Opening it is not the party seeing it. */
  test: z.boolean().optional(),
});

const SubmitSchema = z.object({
  token: TokenSchema,
  declined: z.boolean(),
  contactEmail: z.string().trim().max(254).optional(),
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

      // A test copy opened on a phone the couple are not signed in on must not
      // count as the party seeing it, nor leave the phone remembering the party.
      if (result && !data.test) {
        const session = await useGuestSession();
        await session.update({
          token: data.token,
          at: session.data.token === data.token ? session.data.at : Date.now(),
        });

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
 * Finds a party by name. This is how guests get in, so anyone may ask; Convex
 * holds every caller to a per-IP and a global limit. The tokens stay on the
 * server, in this device's sealed cookie: the page gets the names and a `choice`
 * to pass to `enterAs`, never a link it could keep or share.
 */
export const lookupParty = createServerFn({ method: "POST" })
  .validator(z.object({ query: z.string().trim().min(1).max(200) }))
  .handler(async ({ data }) => {
    return Sentry.startSpan({ name: "lookupParty" }, async () => {
      const result = await fetchAuthMutation(api.rsvp.lookupByName, {
        query: data.query,
        clientKey: getClientKey(),
        serverSecret: getAppServerSecret(),
      });
      if (result.kind !== "matches") return result;

      const session = await useGuestSession();
      const search = crypto.randomUUID();
      await session.update({ matches: { search, tokens: result.matches.map((match) => match.token) } });
      return {
        kind: "matches" as const,
        search,
        matches: result.matches.map((match, choice) => ({ displayName: match.displayName, choice })),
      };
    });
  });
