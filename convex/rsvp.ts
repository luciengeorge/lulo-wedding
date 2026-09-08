import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import type { ReplyGuest, RsvpEventKey, RsvpStatus } from "../src/lib/rsvp-rules";

import {
  invitedEvents,
  isBlankCard,
  isEffectiveDecline,
  RSVP_EVENTS,
  statusFor,
  validateReply,
} from "../src/lib/rsvp-rules";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import { rateLimiter } from "./rateLimiter";

/**
 * The guest-facing half of the RSVP. Everything here is reachable by anyone
 * holding a party's token, so the rule throughout is that a token buys access to
 * exactly one party's own reply and nothing else.
 */

const rsvpStatus = v.union(v.literal("pending"), v.literal("yes"), v.literal("no"));

/**
 * What a guest is allowed to see about their own party.
 *
 * Written out rather than spread from the document on purpose. `who`, `wave`,
 * `under50`, `link`, `whereFrom` and `note` are the couple's private notes about
 * their guests: which side they belong to, which tier of the list they made,
 * whether they are over fifty. A spread would ship all of it to the browser the
 * moment someone opened their invitation, and a field added to the schema later
 * would start leaking silently.
 */
const guestFacingParty = v.object({
  displayName: v.string(),
  headCount: v.number(),
  plusOneAllowed: v.boolean(),
  invitedToPreWedding: v.boolean(),
  invitedToWedding: v.boolean(),
  invitedToBrunch: v.boolean(),
  contactEmail: v.optional(v.string()),
  guestNote: v.optional(v.string()),
  respondedAt: v.optional(v.number()),
  declined: v.optional(v.boolean()),
  earlyDecline: v.boolean(),
});

const guestFacingGuest = v.object({
  _id: v.id("guests"),
  firstName: v.string(),
  lastName: v.string(),
  email: v.optional(v.string()),
  isPlusOne: v.boolean(),
  dietaryNotes: v.optional(v.string()),
  preWedding: rsvpStatus,
  wedding: rsvpStatus,
  brunch: rsvpStatus,
});

/**
 * The cutoff, read from the Convex deployment's env so it can move without a deploy.
 *
 * Absent means no deadline, which is the current truth: the couple have not set
 * one yet. Failing open is right here, unlike GUEST_PASSWORD where an unset value
 * has to fail closed. The worst case is a late reply, not an open door.
 */
function deadlinePassed(): boolean {
  const raw = process.env.RSVP_DEADLINE;
  if (!raw) return false;

  const deadline = Date.parse(raw);
  if (Number.isNaN(deadline)) {
    throw new Error(`RSVP_DEADLINE is set to "${raw}", which is not a date. Use an ISO date such as 2027-06-01.`);
  }
  return Date.now() > deadline;
}

async function partyByToken(ctx: QueryCtx, token: string): Promise<Doc<"parties"> | null> {
  return await ctx.db
    .query("parties")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();
}

async function guestsOf(ctx: QueryCtx, partyId: Id<"parties">): Promise<Doc<"guests">[]> {
  return await ctx.db
    .query("guests")
    .withIndex("by_party", (q) => q.eq("partyId", partyId))
    .collect();
}

/**
 * Everything the RSVP page needs, for one token.
 *
 * Returns null rather than throwing on an unknown token: a mistyped or retired
 * link should render "we could not find that invitation" in the wedding's own
 * typography, not an error boundary.
 */
export const getByToken = query({
  args: { token: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      party: guestFacingParty,
      guests: v.array(guestFacingGuest),
      deadlinePassed: v.boolean(),
    }),
  ),
  handler: async (ctx, { token }) => {
    const party = await partyByToken(ctx, token);
    if (!party) return null;

    const guests = await guestsOf(ctx, party._id);

    return {
      party: {
        displayName: party.displayName,
        headCount: party.headCount,
        plusOneAllowed: party.plusOneAllowed,
        invitedToPreWedding: party.invitedToPreWedding,
        invitedToWedding: party.invitedToWedding,
        invitedToBrunch: party.invitedToBrunch,
        contactEmail: party.contactEmail,
        guestNote: party.guestNote,
        respondedAt: party.respondedAt,
        declined: party.declined,
        earlyDecline: party.earlyDecline,
      },
      guests: guests.map((guest) => ({
        _id: guest._id,
        firstName: guest.firstName,
        lastName: guest.lastName,
        email: guest.email,
        isPlusOne: guest.isPlusOne,
        dietaryNotes: guest.dietaryNotes,
        preWedding: guest.preWedding,
        wedding: guest.wedding,
        brunch: guest.brunch,
      })),
      deadlinePassed: deadlinePassed(),
    };
  },
});

const submittedGuest = v.object({
  /** Present when this card is an existing row, so a re-reply edits rather than replaces. */
  guestId: v.optional(v.id("guests")),
  firstName: v.string(),
  lastName: v.string(),
  /** Omitted when the guest ticked "no email address", which children need. */
  email: v.optional(v.string()),
  isPlusOne: v.boolean(),
  dietaryNotes: v.optional(v.string()),
  preWedding: v.boolean(),
  wedding: v.boolean(),
  brunch: v.boolean(),
});

type SubmittedGuest = {
  guestId?: Id<"guests">;
  firstName: string;
  lastName: string;
  email?: string;
  isPlusOne: boolean;
  dietaryNotes?: string;
  preWedding: boolean;
  wedding: boolean;
  brunch: boolean;
};

/** Everything about a guest row except which party it belongs to. */
type GuestFields = Omit<Doc<"guests">, "_id" | "_creationTime" | "partyId">;

function toReplyGuest(guest: SubmittedGuest): ReplyGuest {
  return {
    firstName: guest.firstName,
    lastName: guest.lastName,
    email: guest.email,
    isPlusOne: guest.isPlusOne,
    attending: { preWedding: guest.preWedding, wedding: guest.wedding, brunch: guest.brunch },
  };
}

/** Empty strings are how a cleared input arrives; they are absence, not a value. */
function trimmed(value: string | undefined): string | undefined {
  const cleaned = value?.trim();
  return cleaned ? cleaned : undefined;
}

/**
 * The stored answer for one event, and when it was given.
 *
 * The timestamp only moves when the answer moves. A party editing one name should
 * not restamp the day they first said yes to the wedding, which is the field the
 * couple would look at to work out who replied early.
 */
function eventAnswer(previous: Doc<"guests"> | null, key: RsvpEventKey, next: RsvpStatus, now: number) {
  const unchanged = previous?.[key] === next;
  const at = unchanged ? previous?.[`${key}At`] : next === "pending" ? undefined : now;
  return { status: next, at };
}

function guestFieldsFor(
  party: Doc<"parties">,
  guest: SubmittedGuest,
  previous: Doc<"guests"> | null,
  now: number,
): GuestFields {
  const answers = RSVP_EVENTS.map((event) => ({
    key: event.key,
    ...eventAnswer(previous, event.key, statusFor(party[event.invitedFlag], guest[event.key]), now),
  }));

  const fields: GuestFields = {
    firstName: guest.firstName.trim(),
    lastName: guest.lastName.trim(),
    email: trimmed(guest.email),
    isPlusOne: guest.isPlusOne,
    dietaryNotes: trimmed(guest.dietaryNotes),
    preWedding: "pending",
    wedding: "pending",
    brunch: "pending",
  };

  for (const answer of answers) {
    fields[answer.key] = answer.status;
    fields[`${answer.key}At`] = answer.at;
  }

  return fields;
}

/** `db.patch` reads undefined as "delete this field", which is right. `db.insert` should just not carry the key. */
function withoutUndefined<T extends object>(fields: T): T {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)) as T;
}

/**
 * Records a party's reply. Accepts and declines both come through here.
 *
 * Edits rather than replaces: the client sends each card's `guestId` where it has
 * one, so a party coming back to change a name keeps the row, and with it the
 * timestamps of the answers they are not changing.
 */
export const submit = mutation({
  args: {
    token: v.string(),
    declined: v.boolean(),
    contactEmail: v.string(),
    guestNote: v.optional(v.string()),
    guests: v.array(submittedGuest),
  },
  returns: v.object({ ok: v.literal(true), seatsNamed: v.number(), headCount: v.number() }),
  handler: async (ctx, { token, declined, contactEmail, guestNote, guests }) => {
    const party = await partyByToken(ctx, token);
    if (!party) throw new ConvexError("We could not find that invitation.");

    // Keyed by token rather than by IP, which a Convex mutation cannot see. Not an
    // enumeration guard, tokens are 132 bits of entropy; this stops one link being
    // used to fire confirmation emails in a loop.
    const limit = await rateLimiter.limit(ctx, "rsvpSubmit", { key: token });
    if (!limit.ok) throw new ConvexError("That is a lot of changes at once. Please try again in a few minutes.");

    if (deadlinePassed()) {
      throw new ConvexError("The reply date has passed. Please get in touch with Laura and Lucien directly.");
    }

    const existing = await guestsOf(ctx, party._id);
    const existingById = new Map(existing.map((guest) => [guest._id, guest]));

    // A card may only carry an id belonging to this party. Without this, a token
    // holder could rewrite another family's answers by naming their row.
    for (const guest of guests) {
      if (guest.guestId && !existingById.has(guest.guestId)) {
        throw new ConvexError("That reply is out of date. Please reload the page and try again.");
      }
    }

    const now = Date.now();
    const email = contactEmail.trim();

    if (declined) {
      // The names stay. "Actually, we can come" then restores the reply instead of
      // making a family of five type themselves back in.
      for (const guest of existing) {
        const patch: Partial<GuestFields> = {};
        for (const event of invitedEvents(party)) {
          const answer = eventAnswer(guest, event, "no", now);
          patch[event] = answer.status;
          patch[`${event}At`] = answer.at;
        }
        await ctx.db.patch(guest._id, patch);
      }

      await ctx.db.patch(party._id, {
        declined: true,
        respondedAt: now,
        contactEmail: email,
        guestNote: trimmed(guestNote),
      });

      await ctx.scheduler.runAfter(0, internal.rsvp.sendConfirmation, { partyId: party._id });
      return { ok: true as const, seatsNamed: 0, headCount: party.headCount };
    }

    const issues = validateReply(party, guests.map(toReplyGuest), {
      existingPlusOne: existing.some((guest) => guest.isPlusOne),
    });
    if (issues.length > 0) {
      // Structured, so the form can put each message against its own field. The
      // browser runs the same rules first; this is the copy that decides.
      throw new ConvexError({ kind: "validation", issues });
    }

    const filled = guests.filter((guest) => !isBlankCard(toReplyGuest(guest)));
    const kept = new Set<Id<"guests">>();

    for (const guest of filled) {
      const previous = guest.guestId ? (existingById.get(guest.guestId) ?? null) : null;
      const fields = guestFieldsFor(party, guest, previous, now);

      if (previous) {
        await ctx.db.patch(previous._id, fields);
        kept.add(previous._id);
      } else {
        kept.add(await ctx.db.insert("guests", withoutUndefined({ partyId: party._id, ...fields })));
      }
    }

    // A card the party cleared means that person is no longer coming at all.
    for (const guest of existing) {
      if (!kept.has(guest._id)) await ctx.db.delete(guest._id);
    }

    await ctx.db.patch(party._id, {
      declined: isEffectiveDecline(party, filled.map(toReplyGuest)),
      respondedAt: now,
      contactEmail: email,
      guestNote: trimmed(guestNote),
    });

    await ctx.scheduler.runAfter(0, internal.rsvp.sendConfirmation, { partyId: party._id });

    return {
      ok: true as const,
      seatsNamed: filled.filter((guest) => !guest.isPlusOne).length,
      headCount: party.headCount,
    };
  },
});

/** The three dates, which are fixed even though the venues and times are not yet. */
const EVENT_DATES: Record<RsvpEventKey, string> = {
  preWedding: "Thursday 15 July 2027",
  wedding: "Saturday 17 July 2027",
  brunch: "Sunday 18 July 2027",
};

/**
 * Reads the reply back out and emails it to the address the party gave.
 *
 * Scheduled from `submit` rather than awaited inside it, so a Resend outage cannot
 * roll back a reply the guest was already told was saved. Losing the receipt is
 * recoverable; losing the RSVP is the one thing this page exists to prevent.
 *
 * Internal: the guest cannot ask us to email an arbitrary address, only the one
 * stored on their own party.
 */
export const sendConfirmation = internalMutation({
  args: { partyId: v.id("parties") },
  returns: v.null(),
  handler: async (ctx, { partyId }) => {
    const party = await ctx.db.get(partyId);
    if (!party?.contactEmail) return null;

    const guests = await guestsOf(ctx, partyId);
    const events = RSVP_EVENTS.filter((event) => party[event.invitedFlag]).map((event) => ({
      label: event.label,
      date: EVENT_DATES[event.key],
      attending: guests.filter((guest) => guest[event.key] === "yes").map((guest) => guest.firstName),
    }));

    const seatsNamed = guests.filter((guest) => !guest.isPlusOne).length;

    await ctx.scheduler.runAfter(0, internal.email.send.sendEmail, {
      to: party.contactEmail,
      subject: party.declined ? "We got your reply" : "Your reply is in",
      template: "rsvpConfirmation",
      props: {
        displayName: party.displayName,
        declined: party.declined === true,
        events,
        seatsNamed,
        headCount: party.headCount,
        rsvpUrl: `${(process.env.SITE_URL ?? "").replace(/\/+$/, "")}/rsvp/${party.token}`,
      },
    });

    return null;
  },
});
