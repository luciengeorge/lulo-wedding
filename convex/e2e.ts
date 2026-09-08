import { v } from "convex/values";

import { internalMutation, internalQuery } from "./_generated/server";
import { generateToken } from "./parties";
import { rateLimiter } from "./rateLimiter";

/**
 * Fixtures for the browser tests.
 *
 * Every function here is `internal`, so none of it is reachable from a browser on
 * any deployment, production included. The only caller is `npx convex run` from
 * the E2E harness, which authenticates with the deployment's admin key. Anyone
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
};

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
    for (const key of ["127.0.0.1", "::1", "unknown"]) {
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
