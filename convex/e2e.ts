import { Resend } from "@convex-dev/resend";
import { v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

import { components, internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";
import { generateToken } from "./parties";
import { rateLimiter } from "./rateLimiter";

/**
 * Fixtures for the browser tests.
 *
 * Every function here is `internal`, so none of it is reachable from a browser on
 * any deployment, production included. The only caller is the E2E harness
 * (e2e/fixtures.ts), which authenticates with the local deployment's admin key. Anyone
 * holding that key could already do all of this and more, so these add no
 * surface; they exist so the tests do not have to drive 400 rows through the UI
 * to arrange a scenario.
 */

/**
 * Refuses to run anywhere that is not a throwaway test deployment.
 *
 * `reset` deletes every party and guest. These are internal functions, so no
 * browser can reach them, but `npx convex run` and the Convex dashboard can, and
 * this file is deployed to production along with everything else. One misclick in
 * the dashboard would erase the guest list.
 *
 * E2E_CAPTURE_EMAILS is set only on the harness's local backend, so the check
 * fails closed everywhere real.
 */
function assertTestDeployment() {
  if (process.env.E2E_CAPTURE_EMAILS !== "1") {
    throw new Error("e2e fixtures refuse to run: this is not a test deployment.");
  }
}

const partyFields = {
  displayName: v.string(),
  surname: v.string(),
  token: v.string(),
  headCount: v.number(),
  plusOneAllowed: v.boolean(),
  invitedToPreWedding: v.boolean(),
  invitedToWedding: v.boolean(),
  invitedToBrunch: v.boolean(),
  earlyDecline: v.boolean(),
  wave: v.union(v.literal("tier1"), v.literal("tier2")),
  who: v.union(v.literal("lucien"), v.literal("laura"), v.literal("mutual"), v.literal("zeina"), v.literal("nayla")),
  link: v.union(v.literal("family"), v.literal("friends")),
  whereFrom: v.optional(v.string()),
  contactEmail: v.optional(v.string()),
  contactPhone: v.optional(v.string()),
  respondedAt: v.optional(v.number()),
};

const eventFlags = v.object({ preWedding: v.boolean(), wedding: v.boolean(), brunch: v.boolean() });
const rsvpStatus = v.union(v.literal("pending"), v.literal("yes"), v.literal("no"));
const sendChannel = v.union(v.literal("email"), v.literal("whatsapp"));
const sendKind = v.union(v.literal("invite"), v.literal("update"), v.literal("receipt"), v.literal("reminder"));
const sendStatus = v.union(
  v.literal("queued"),
  v.literal("sent"),
  v.literal("delivered"),
  v.literal("delivery_delayed"),
  v.literal("bounced"),
  v.literal("complained"),
  v.literal("failed"),
);

/**
 * The keys `getClientKey` can derive for a browser on this machine. Resetting or
 * draining all of them is cheaper than plumbing the real one out of the request.
 */
const LOCAL_CLIENT_KEYS = ["127.0.0.1", "::1", "::ffff:127.0.0.1", "unknown"];

async function partyFor(ctx: QueryCtx, token: string): Promise<Doc<"parties">> {
  const party = await ctx.db
    .query("parties")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();
  if (!party) throw new Error(`No party with token ${token}`);
  return party;
}

/**
 * Empties every app table.
 *
 * Deliberately does not touch the betterAuth component's tables: signing in is
 * slow and the account allowlist is deployment config, so tests share one
 * signed-in admin rather than recreating it per file.
 */
export const reset = internalMutation({
  args: {},
  returns: v.object({ parties: v.number(), guests: v.number(), emails: v.number() }),
  handler: async (ctx) => {
    assertTestDeployment();
    const counts = { parties: 0, guests: 0, emails: 0 };

    // Submits are rate limited per party token, and the specs reuse a handful of
    // fixed tokens. Without clearing the bucket the suite starts throttling its
    // own submits partway through and the failures look like lost replies.
    for (const party of await ctx.db.query("parties").collect()) {
      await rateLimiter.reset(ctx, "rsvpSubmit", { key: party.token });
    }
    // Every spec looks names up from the same address; the lookup spec drains the
    // bucket on purpose.
    await resetNameLookup(ctx);

    // Tracking rows hang off parties and would outlive them otherwise. Not counted:
    // the specs only assert on the three tables below.
    for (const table of ["sends", "visits"] as const) {
      for (const row of await ctx.db.query(table).collect()) await ctx.db.delete(row._id);
    }

    for (const table of ["guests", "parties", "capturedEmails"] as const) {
      // Bounded by construction: the fixtures below insert a handful of rows.
      const rows = await ctx.db.query(table).collect();
      for (const row of rows) await ctx.db.delete(row._id);
      counts[table === "capturedEmails" ? "emails" : table] = rows.length;
    }

    return counts;
  },
});

/**
 * Inserts parties and returns their tokens keyed by display name, so a spec can
 * navigate straight to `/rsvp/<token>` without scraping the admin table for it.
 */
export const seedParties = internalMutation({
  args: { parties: v.array(v.object(partyFields)) },
  returns: v.array(v.object({ displayName: v.string(), token: v.string() })),
  handler: async (ctx, { parties }) => {
    assertTestDeployment();
    const created: { displayName: string; token: string }[] = [];

    for (const party of parties) {
      const token = party.token || generateToken();
      await ctx.db.insert("parties", {
        ...party,
        token,
        importKey: `${party.displayName.toLowerCase()}|${party.surname.toLowerCase()}`,
        saveTheDateSent: false,
      });
      created.push({ displayName: party.displayName, token });
    }

    return created;
  },
});

/**
 * The most recent captured email for an address.
 *
 * Returns the rendered HTML rather than a parsed link: the test pulls the URL out
 * itself, which means a template that stops containing a usable link fails the
 * test instead of quietly passing.
 */
export const latestEmail = internalQuery({
  args: { to: v.string() },
  returns: v.union(v.null(), v.object({ subject: v.string(), template: v.string(), html: v.string() })),
  handler: async (ctx, { to }) => {
    const emails = await ctx.db
      .query("capturedEmails")
      .withIndex("by_to", (q) => q.eq("to", to))
      .collect();

    const latest = emails.length > 0 ? emails[emails.length - 1] : undefined;
    return latest ? { subject: latest.subject, template: latest.template, html: latest.html } : null;
  },
});

/** Reads a party's stored reply, so a spec can assert what the form actually wrote. */
export const replyFor = internalQuery({
  args: { token: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      declined: v.optional(v.boolean()),
      respondedAt: v.optional(v.number()),
      contactEmail: v.optional(v.string()),
      guestNote: v.optional(v.string()),
      guests: v.array(
        v.object({
          firstName: v.string(),
          lastName: v.string(),
          email: v.optional(v.string()),
          isPlusOne: v.boolean(),
          preWedding: v.string(),
          wedding: v.string(),
          brunch: v.string(),
          invitedTo: v.optional(eventFlags),
          addedByCouple: v.optional(v.boolean()),
        }),
      ),
    }),
  ),
  handler: async (ctx, { token }) => {
    const party = await ctx.db
      .query("parties")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    if (!party) return null;

    const guests = await ctx.db
      .query("guests")
      .withIndex("by_party", (q) => q.eq("partyId", party._id))
      .collect();

    return {
      declined: party.declined,
      respondedAt: party.respondedAt,
      contactEmail: party.contactEmail,
      guestNote: party.guestNote,
      guests: guests.map((guest) => ({
        firstName: guest.firstName,
        lastName: guest.lastName,
        email: guest.email,
        isPlusOne: guest.isPlusOne,
        preWedding: guest.preWedding,
        wedding: guest.wedding,
        brunch: guest.brunch,
        invitedTo: guest.invitedTo,
        addedByCouple: guest.addedByCouple,
      })),
    };
  },
});

/**
 * Clears the rate limiters the browser tests trip over.
 *
 * The guest gate allows 20 attempts per 15 minutes per client IP, and every test
 * runs from the same loopback address, so a few suite runs in a row exhaust it and
 * the tests then fail on the app defending itself correctly. Resetting between
 * runs keeps the real limit in force for real guests rather than weakening it for
 * everyone to make a test suite pass.
 *
 * The keys are whatever `getClientKey` derives locally; resetting the candidates
 * is cheaper than plumbing the value out of the request.
 */
export const resetRateLimits = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    assertTestDeployment();
    for (const key of LOCAL_CLIENT_KEYS) {
      await rateLimiter.reset(ctx, "guestGate", { key });
    }
    await rateLimiter.reset(ctx, "guestGate");

    // Magic links are capped at a burst of 3 per address per hour. Three admin
    // specs sign in, so a second run inside the hour would otherwise fail on the
    // limiter rather than on anything the tests are about.
    await rateLimiter.reset(ctx, "magicLink", { key: "admin@e2e.test" });
    return null;
  },
});

async function resetNameLookup(ctx: MutationCtx) {
  for (const key of LOCAL_CLIENT_KEYS) await rateLimiter.reset(ctx, "nameLookup", { key });
  await rateLimiter.reset(ctx, "nameLookupGlobal");
}

/** Spends this machine's whole name-lookup allowance, so the next search is refused. */
export const exhaustNameLookup = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    assertTestDeployment();
    for (const key of LOCAL_CLIENT_KEYS) {
      await rateLimiter.limit(ctx, "nameLookup", { key, count: 20 });
    }
    return null;
  },
});

/**
 * People in a party, written straight to the table: couple-named guests with their
 * own invite, or a reply the party already gave.
 */
export const seedGuests = internalMutation({
  args: {
    token: v.string(),
    guests: v.array(
      v.object({
        firstName: v.string(),
        lastName: v.string(),
        email: v.optional(v.string()),
        isPlusOne: v.optional(v.boolean()),
        invitedTo: v.optional(eventFlags),
        addedByCouple: v.optional(v.boolean()),
        preWedding: v.optional(rsvpStatus),
        wedding: v.optional(rsvpStatus),
        brunch: v.optional(rsvpStatus),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, { token, guests }) => {
    assertTestDeployment();
    const party = await partyFor(ctx, token);
    for (const guest of guests) {
      await ctx.db.insert("guests", {
        ...guest,
        partyId: party._id,
        isPlusOne: guest.isPlusOne ?? false,
        preWedding: guest.preWedding ?? "pending",
        wedding: guest.wedding ?? "pending",
        brunch: guest.brunch ?? "pending",
      });
    }
    return null;
  },
});

/** A message the couple sent, for arranging the funnel without a real send. */
export const seedSend = internalMutation({
  args: {
    token: v.string(),
    channel: sendChannel,
    kind: sendKind,
    to: v.optional(v.string()),
    status: v.optional(sendStatus),
    sentAt: v.optional(v.number()),
  },
  returns: v.id("sends"),
  handler: async (ctx, { token, status, sentAt, ...send }) => {
    assertTestDeployment();
    const party = await partyFor(ctx, token);
    return await ctx.db.insert("sends", {
      ...send,
      partyId: party._id,
      status: status ?? "sent",
      sentAt: sentAt ?? Date.now(),
      openCount: 0,
      clickCount: 0,
    });
  },
});

/** A visit at a chosen time, for ordering a timeline without waiting half an hour. */
export const seedVisit = internalMutation({
  args: {
    token: v.string(),
    source: v.union(v.literal("link"), v.literal("email"), v.literal("lookup"), v.literal("remembered")),
    at: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, { token, source, at }) => {
    assertTestDeployment();
    const party = await partyFor(ctx, token);
    await ctx.db.insert("visits", { partyId: party._id, source, at });
    return null;
  },
});

/** A placeholder key: nothing queued through this instance ever reaches Resend's API. */
const fixtureResend = new Resend(components.resend, {
  apiKey: "e2e-placeholder-not-a-key",
  testMode: false,
  onEmailEvent: internal.sends.handleEmailEvent,
});

/**
 * Makes a send row look as if Resend accepted it under `resendId`, so a signed
 * webhook naming that id travels the real path: the component's handler, its
 * callback pool, then `sends.handleEmailEvent`.
 *
 * Capturing deployments never call Resend, so nothing else creates the
 * component's record of the email. Two steps, because the component only learns
 * where to deliver events (`lastOptions`) from a queued send: one is queued and
 * cancelled at once, before its batch can run, then the email the webhook will
 * name is recorded as already sent.
 */
export const linkSendToResend = internalMutation({
  args: { sendId: v.id("sends"), resendId: v.string() },
  returns: v.null(),
  handler: async (ctx, { sendId, resendId }) => {
    assertTestDeployment();
    const send = await ctx.db.get(sendId);
    if (!send) throw new Error(`No send ${sendId}`);

    const placeholder = await fixtureResend.sendEmail(ctx, {
      from: "e2e@example.test",
      to: "e2e@example.test",
      subject: "e2e placeholder",
      text: "Cancelled before it was sent.",
    });
    await fixtureResend.cancelEmail(ctx, placeholder);

    const emailId = await fixtureResend.sendEmailManually(
      ctx,
      { from: "e2e@example.test", to: send.to ?? "e2e@example.test", subject: "e2e" },
      async () => resendId,
    );
    await ctx.db.patch(sendId, { emailId });
    return null;
  },
});

/**
 * A party's sends and visits, oldest first, for asserting what a page view or a
 * webhook wrote. Read-only and unguarded like `replyFor`: the email-outage test
 * reads it while the capture flag is deliberately off.
 */
export const activityFor = internalQuery({
  args: { token: v.string() },
  returns: v.object({
    visits: v.array(
      v.object({
        source: v.union(v.literal("link"), v.literal("email"), v.literal("lookup"), v.literal("remembered")),
        sendId: v.optional(v.id("sends")),
      }),
    ),
    sends: v.array(
      v.object({
        _id: v.id("sends"),
        channel: sendChannel,
        kind: sendKind,
        to: v.optional(v.string()),
        status: sendStatus,
        emailId: v.optional(v.string()),
        deliveredAt: v.optional(v.number()),
        openCount: v.number(),
        clickCount: v.number(),
        error: v.optional(v.string()),
      }),
    ),
  }),
  handler: async (ctx, { token }) => {
    const party = await partyFor(ctx, token);
    const visits = await ctx.db
      .query("visits")
      .withIndex("by_party", (q) => q.eq("partyId", party._id))
      .collect();
    const sends = await ctx.db
      .query("sends")
      .withIndex("by_party", (q) => q.eq("partyId", party._id))
      .collect();
    return {
      visits: visits.map((visit) => ({ source: visit.source, sendId: visit.sendId })),
      sends: sends.map((send) => ({
        _id: send._id,
        channel: send.channel,
        kind: send.kind,
        to: send.to,
        status: send.status,
        emailId: send.emailId,
        deliveredAt: send.deliveredAt,
        openCount: send.openCount,
        clickCount: send.clickCount,
        error: send.error,
      })),
    };
  },
});

/** A party's own fields as stored, for asserting what an admin form wrote. */
export const partyFieldsFor = internalQuery({
  args: { token: v.string() },
  returns: v.object({ contactPhone: v.optional(v.string()), contactEmail: v.optional(v.string()) }),
  handler: async (ctx, { token }) => {
    const party = await partyFor(ctx, token);
    return { contactPhone: party.contactPhone, contactEmail: party.contactEmail };
  },
});

/** How many emails were captured for an address, so a double submit can be caught sending two. */
export const emailCount = internalQuery({
  args: { to: v.string() },
  returns: v.number(),
  handler: async (ctx, { to }) =>
    (
      await ctx.db
        .query("capturedEmails")
        .withIndex("by_to", (q) => q.eq("to", to))
        .collect()
    ).length,
});

/** Spends one party's whole submit allowance, so the next reply is refused. */
export const exhaustSubmit = internalMutation({
  args: { token: v.string() },
  returns: v.null(),
  handler: async (ctx, { token }) => {
    assertTestDeployment();
    await rateLimiter.limit(ctx, "rsvpSubmit", { key: token, count: 8 });
    return null;
  },
});
