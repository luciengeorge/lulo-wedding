import { v } from "convex/values";

import type { MutationCtx } from "./_generated/server";

import { internal } from "./_generated/api";
import { httpAction, internalMutation, internalQuery } from "./_generated/server";
import { generateToken } from "./parties";
import { rateLimiter } from "./rateLimiter";

/**
 * Data and a narrow door for the smoke test that runs against each Vercel preview.
 *
 * Why an HTTP action behind a shared secret. CI has to arrange a party and read
 * captured email on a preview deployment it cannot otherwise reach: `npx convex
 * run` needs a deploy key per deployment, and Convex cannot mint a preview deploy
 * key per run. So the preview exposes `/smoke`, which answers only when both
 *
 * - E2E_CAPTURE_EMAILS is "1": set as a Convex *preview* default only, so every
 *   preview captures mail instead of sending it, and production never has it; and
 * - SMOKE_SECRET is set (also a preview default) and the request carries it as a
 *   bearer token, compared in constant time.
 *
 * Everywhere else, production included, the route answers 404 as if it did not
 * exist, and the production smoke job checks exactly that. Two independent keys,
 * so a capture flag set by mistake on production still opens nothing.
 *
 * What it can do is deliberately small: reset and return the one smoke party, and
 * read the newest captured email for an address. It never touches other parties.
 */

const SMOKE_PARTY = { displayName: "Smoke & Test", surname: "Preview" } as const;
const SMOKE_IMPORT_KEY = "smoke & test|preview";

function smokeEnabled(): boolean {
  return process.env.E2E_CAPTURE_EMAILS === "1" && (process.env.SMOKE_SECRET ?? "").length >= 32;
}

function assertSmokeDeployment() {
  if (process.env.E2E_CAPTURE_EMAILS !== "1") {
    throw new Error("smoke fixtures refuse to run: E2E_CAPTURE_EMAILS is not set, so this is not a preview.");
  }
}

async function resetSmokeParty(ctx: MutationCtx) {
  const existing = await ctx.db
    .query("parties")
    .withIndex("by_import_key", (q) => q.eq("importKey", SMOKE_IMPORT_KEY))
    .collect();

  for (const party of existing) {
    for (const table of ["guests", "sends", "visits"] as const) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_party", (q) => q.eq("partyId", party._id))
        .collect();
      for (const row of rows) await ctx.db.delete(row._id);
    }
    await rateLimiter.reset(ctx, "rsvpSubmit", { key: party.token });
    await ctx.db.delete(party._id);
  }

  const token = generateToken();
  await ctx.db.insert("parties", {
    ...SMOKE_PARTY,
    importKey: SMOKE_IMPORT_KEY,
    token,
    headCount: 2,
    plusOneAllowed: false,
    invitedToPreWedding: false,
    invitedToWedding: true,
    invitedToBrunch: false,
    earlyDecline: false,
    saveTheDateSent: false,
    wave: "tier1",
    who: "mutual",
    link: "friends",
  });

  // A retried run asks for a sign-in link again; the limit is three an hour.
  const adminEmail = process.env.SMOKE_ADMIN_EMAIL;
  if (adminEmail) await rateLimiter.reset(ctx, "magicLink", { key: adminEmail.toLowerCase() });

  return { token, ...SMOKE_PARTY };
}

const smokeParty = v.object({ token: v.string(), displayName: v.string(), surname: v.string() });

/** Run at deploy time by `convex deploy --preview-run smoke:seed` (see scripts/vercel-build.sh). */
export const seed = internalMutation({
  args: {},
  returns: smokeParty,
  handler: async (ctx) => {
    assertSmokeDeployment();
    return await resetSmokeParty(ctx);
  },
});

export const reset = internalMutation({
  args: {},
  returns: smokeParty,
  handler: async (ctx) => {
    assertSmokeDeployment();
    return await resetSmokeParty(ctx);
  },
});

export const latestEmail = internalQuery({
  args: { to: v.string() },
  returns: v.union(v.null(), v.object({ subject: v.string(), html: v.string(), template: v.string() })),
  handler: async (ctx, { to }) => {
    assertSmokeDeployment();
    const latest = await ctx.db
      .query("capturedEmails")
      .withIndex("by_to", (q) => q.eq("to", to))
      .order("desc")
      .first();
    return latest ? { subject: latest.subject, html: latest.html, template: latest.template } : null;
  },
});

/** Equal-length strings compared without an early exit, so timing says nothing about the secret. */
function sameSecret(given: string, expected: string): boolean {
  if (given.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < given.length; index++) {
    difference |= given.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}

const notFound = () => new Response("Not found", { status: 404 });

export const handle = httpAction(async (ctx, request) => {
  if (!smokeEnabled()) return notFound();

  const given = (request.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (!sameSecret(given, process.env.SMOKE_SECRET ?? "")) return notFound();

  const body = (await request.json().catch(() => null)) as { op?: string; to?: string } | null;
  if (body?.op === "reset") {
    return Response.json(await ctx.runMutation(internal.smoke.reset, {}));
  }
  if (body?.op === "latestEmail" && typeof body.to === "string") {
    return Response.json(await ctx.runQuery(internal.smoke.latestEmail, { to: body.to }));
  }
  return new Response("Unknown op", { status: 400 });
});
