// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import type { EmailEvent } from "@convex-dev/resend";

import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Doc, Id } from "./_generated/dataModel";

import { api, internal } from "./_generated/api";
import schema from "./schema";

const auth = vi.hoisted(() => ({ admin: false }));
vi.mock("./lib/adminAuth", () => ({
  requireAdmin: vi.fn(async () => undefined),
  isAdmin: vi.fn(async () => auth.admin),
}));

const modules = import.meta.glob("./**/*.ts");

function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
}

type T = ReturnType<typeof setup>;

const PARTY: Omit<Doc<"parties">, "_id" | "_creationTime"> = {
  importKey: "rae & cherif|haddad",
  displayName: "Rae & Cherif",
  surname: "Haddad",
  token: "token-haddad",
  headCount: 5,
  plusOneAllowed: false,
  link: "family",
  who: "laura",
  wave: "tier1",
  invitedToPreWedding: false,
  invitedToWedding: true,
  invitedToBrunch: false,
  saveTheDateSent: true,
  earlyDecline: false,
};

async function insertParty(t: T, overrides: Partial<typeof PARTY> = {}): Promise<Id<"parties">> {
  return await t.run((ctx) => ctx.db.insert("parties", { ...PARTY, ...overrides }));
}

async function insertSend(t: T, partyId: Id<"parties">, overrides: Partial<Doc<"sends">> = {}) {
  return await t.run((ctx) =>
    ctx.db.insert("sends", {
      partyId,
      channel: "email",
      kind: "invite",
      to: "rae@example.com",
      status: "queued",
      sentAt: Date.now(),
      openCount: 0,
      clickCount: 0,
      ...overrides,
    }),
  );
}

const visitsOf = (t: T, partyId: Id<"parties">) =>
  t.run((ctx) =>
    ctx.db
      .query("visits")
      .withIndex("by_party", (q) => q.eq("partyId", partyId))
      .collect(),
  );

const guestsOf = (t: T, partyId: Id<"parties">) =>
  t.run((ctx) =>
    ctx.db
      .query("guests")
      .withIndex("by_party", (q) => q.eq("partyId", partyId))
      .collect(),
  );

const APP_SERVER_SECRET = "app-server-secret-for-tests";

beforeEach(() => {
  auth.admin = false;
  delete process.env.RSVP_DEADLINE;
  process.env.APP_SERVER_SECRET = APP_SERVER_SECRET;
});

describe("handleEmailEvent", () => {
  const common = {
    created_at: "2026-10-01T10:00:00.000Z",
    email_id: "resend-1",
    from: "hello@lauralucien.com",
    to: "rae@example.com",
    subject: "You are invited",
  };

  function event(type: EmailEvent["type"], at: string, extra: Record<string, unknown> = {}): EmailEvent {
    return { type, created_at: at, data: { ...common, ...extra } } as EmailEvent;
  }

  const fire = (t: T, id: string, e: EmailEvent) =>
    t.mutation(internal.sends.handleEmailEvent, { id: id as never, event: e });

  const sendOf = (t: T, id: Id<"sends">) => t.run((ctx) => ctx.db.get(id));

  it("walks a send through delivered, opened twice and clicked", async () => {
    const t = setup();
    const partyId = await insertParty(t);
    const sendId = await insertSend(t, partyId, { emailId: "email-1" });

    await fire(t, "email-1", event("email.sent", "2026-10-01T10:00:00.000Z"));
    await fire(t, "email-1", event("email.delivered", "2026-10-01T10:00:05.000Z"));
    const open = { ipAddress: "1.2.3.4", timestamp: "x", userAgent: "x" };
    await fire(t, "email-1", event("email.opened", "2026-10-01T11:00:00.000Z", { open }));
    await fire(t, "email-1", event("email.opened", "2026-10-02T09:00:00.000Z", { open }));
    const link = "https://lauralucien.com/rsvp/token-haddad?s=abc";
    await fire(t, "email-1", event("email.clicked", "2026-10-02T09:01:00.000Z", { click: { ...open, link } }));

    const send = await sendOf(t, sendId);
    expect(send).toMatchObject({
      status: "delivered",
      deliveredAt: Date.parse("2026-10-01T10:00:05.000Z"),
      openCount: 2,
      firstOpenedAt: Date.parse("2026-10-01T11:00:00.000Z"),
      lastOpenedAt: Date.parse("2026-10-02T09:00:00.000Z"),
      clickCount: 1,
      firstClickedAt: Date.parse("2026-10-02T09:01:00.000Z"),
    });
    // The clicked link carries the party's token; it must not be kept anywhere.
    expect(JSON.stringify(send)).not.toContain("token-haddad");
  });

  it("does not let a late sent event drag a delivered message backwards", async () => {
    const t = setup();
    const sendId = await insertSend(t, await insertParty(t), { emailId: "email-1", status: "delivered" });
    await fire(t, "email-1", event("email.sent", "2026-10-01T09:00:00.000Z"));
    expect((await sendOf(t, sendId))?.status).toBe("delivered");
  });

  it("treats a bounce as final", async () => {
    const t = setup();
    const sendId = await insertSend(t, await insertParty(t), { emailId: "email-1", status: "sent" });

    const bounce = { message: "Mailbox does not exist", subType: "General", type: "Permanent" };
    await fire(t, "email-1", event("email.bounced", "2026-10-01T10:01:00.000Z", { bounce }));
    await fire(t, "email-1", event("email.delivered", "2026-10-01T10:02:00.000Z"));
    await fire(t, "email-1", event("email.complained", "2026-10-01T10:03:00.000Z"));

    expect(await sendOf(t, sendId)).toMatchObject({
      status: "bounced",
      bouncedAt: Date.parse("2026-10-01T10:01:00.000Z"),
      bounceReason: "Mailbox does not exist",
    });
  });

  it("ignores events for an email it never sent, such as a magic link", async () => {
    const t = setup();
    const sendId = await insertSend(t, await insertParty(t), { emailId: "email-1" });
    await fire(t, "auth-email", event("email.delivered", "2026-10-01T10:00:05.000Z"));
    expect((await sendOf(t, sendId))?.status).toBe("queued");
  });
});

describe("sendConfirmation", () => {
  it("records the receipt as a send and puts its id on the RSVP link", async () => {
    process.env.SITE_URL = "https://lauralucien.com/";
    const t = setup();
    const partyId = await insertParty(t, { contactEmail: "rae@example.com" });

    await t.mutation(internal.rsvp.sendConfirmation, { partyId });

    const [send] = await t.run((ctx) => ctx.db.query("sends").collect());
    expect(send).toMatchObject({ partyId, channel: "email", kind: "receipt", to: "rae@example.com", status: "queued" });

    const [job] = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    const [args] = job.args as [{ sendId: string; props: { rsvpUrl: string } }];
    expect(args.sendId).toBe(send._id);
    expect(args.props.rsvpUrl).toBe(`https://lauralucien.com/rsvp/token-haddad?s=${send._id}`);
  });
});

describe("recordVisit", () => {
  const visit = (t: T, args: { source?: "link" | "email" | "lookup" | "remembered"; sendId?: string } = {}) =>
    t.mutation(api.rsvp.recordVisit, { token: PARTY.token, source: args.source ?? "link", sendId: args.sendId });

  it("counts a reload within half an hour once, but a different way in separately", async () => {
    const t = setup();
    const partyId = await insertParty(t);

    await visit(t);
    await visit(t);
    await visit(t, { source: "remembered" });

    expect((await visitsOf(t, partyId)).map((row) => row.source).sort()).toEqual(["link", "remembered"]);
  });

  it("counts the same way in again once the half hour has passed", async () => {
    const t = setup();
    const partyId = await insertParty(t);
    await t.run((ctx) => ctx.db.insert("visits", { partyId, at: Date.now() - 31 * 60 * 1000, source: "link" }));

    await visit(t);

    expect(await visitsOf(t, partyId)).toHaveLength(2);
  });

  it("drops a send id that belongs to another party, or is not an id at all", async () => {
    const t = setup();
    const partyId = await insertParty(t);
    const otherSend = await insertSend(t, await insertParty(t, { token: "other", importKey: "other|" }));

    await visit(t, { source: "email", sendId: otherSend });
    await visit(t, { source: "link", sendId: "not-an-id" });

    const visits = await visitsOf(t, partyId);
    expect(visits).toHaveLength(2);
    expect(visits.every((row) => row.sendId === undefined)).toBe(true);
  });

  it("keeps the send id when it is this party's", async () => {
    const t = setup();
    const partyId = await insertParty(t);
    const sendId = await insertSend(t, partyId);

    await visit(t, { source: "email", sendId });

    expect((await visitsOf(t, partyId))[0]).toMatchObject({ source: "email", sendId });
  });

  it("does not count the couple opening a party's link", async () => {
    auth.admin = true;
    const t = setup();
    const partyId = await insertParty(t);
    await visit(t);
    expect(await visitsOf(t, partyId)).toHaveLength(0);
  });

  it("says nothing about a token nobody holds", async () => {
    const t = setup();
    await insertParty(t);
    await t.mutation(api.rsvp.recordVisit, { token: "nope", source: "link" });
    expect(await t.run((ctx) => ctx.db.query("visits").collect())).toHaveLength(0);
  });
});

describe("lookupByName", () => {
  const lookup = (t: T, query: string, clientKey = "1.2.3.4", serverSecret = APP_SERVER_SECRET) =>
    t.mutation(api.rsvp.lookupByName, { query, clientKey, serverSecret });

  async function guestList(t: T) {
    await insertParty(t, {
      displayName: "Joseph & Mireille",
      surname: "Abou Jaoudé",
      token: "t-aj",
      importKey: "aj",
    });
    await insertParty(t, { displayName: "Rae et Cherif", surname: "Haddad", token: "t-h", importKey: "h" });
    await insertParty(t, { displayName: "Lucy", surname: "", token: "t-lucy", importKey: "lucy" });
  }

  it("finds a party with the accents left off", async () => {
    const t = setup();
    await guestList(t);
    expect(await lookup(t, "Mireille Abou Jaoude")).toEqual({
      kind: "matches",
      matches: [{ token: "t-aj", displayName: "Joseph & Mireille" }],
    });
  });

  it("splits a display name on 'et' as well as '&'", async () => {
    const t = setup();
    await guestList(t);
    expect(await lookup(t, "cherif haddad")).toMatchObject({ matches: [{ token: "t-h" }] });
    expect(await lookup(t, "joseph abou")).toMatchObject({ matches: [{ token: "t-aj" }] });
  });

  it("refuses one word, unless it is a whole surname-less party's name", async () => {
    const t = setup();
    await guestList(t);
    expect(await lookup(t, "Haddad")).toEqual({ kind: "matches", matches: [] });
    expect(await lookup(t, "lucy")).toEqual({ kind: "matches", matches: [{ token: "t-lucy", displayName: "Lucy" }] });
  });

  it("finds a party by a person the couple named in it", async () => {
    const t = setup();
    await guestList(t);
    const partyId = await t.run(async (ctx) => (await ctx.db.query("parties").collect())[0]._id);
    await t.run((ctx) =>
      ctx.db.insert("guests", {
        partyId,
        firstName: "Nour",
        lastName: "Khoury",
        isPlusOne: false,
        preWedding: "pending",
        wedding: "pending",
        brunch: "pending",
      }),
    );
    expect(await lookup(t, "Nour Khoury")).toMatchObject({ matches: [{ token: "t-aj" }] });
  });

  it("asks for more detail rather than hand out more than five links", async () => {
    const t = setup();
    for (let index = 0; index < 6; index++) {
      await insertParty(t, {
        displayName: `Sami ${index}`,
        surname: "Haddad",
        token: `t${index}`,
        importKey: `k${index}`,
      });
    }
    expect(await lookup(t, "Sami Haddad")).toEqual({ kind: "tooMany" });
  });

  it("refuses a caller without the app server's secret, and hands out no link", async () => {
    const t = setup();
    await guestList(t);
    await expect(lookup(t, "cherif haddad", "1.2.3.4", "")).rejects.toThrow(/Only the app server/);
    await expect(lookup(t, "cherif haddad", "1.2.3.4", "guessed")).rejects.toThrow(/Only the app server/);
  });

  it("refuses everyone when the deployment has no secret set", async () => {
    delete process.env.APP_SERVER_SECRET;
    const t = setup();
    await guestList(t);
    await expect(lookup(t, "cherif haddad", "1.2.3.4", "")).rejects.toThrow(/APP_SERVER_SECRET is not set/);
    await expect(lookup(t, "cherif haddad")).rejects.toThrow(/APP_SERVER_SECRET is not set/);
  });

  it("stops answering one client after twenty tries in a window", async () => {
    const t = setup();
    await guestList(t);
    for (let index = 0; index < 20; index++) await lookup(t, "nobody here");
    expect(await lookup(t, "cherif haddad")).toMatchObject({ kind: "rateLimited" });
    expect(await lookup(t, "cherif haddad", "5.6.7.8")).toMatchObject({ kind: "matches" });
  });
});

describe("per-guest invites", () => {
  /** A party of five invited to the wedding, two of whom the couple also asked to the brunch. */
  async function brunchParty(t: T) {
    const partyId = await insertParty(t);
    const named = [];
    for (const firstName of ["Rae", "Cherif"]) {
      named.push(
        await t.mutation(api.admin.addNamedGuest, {
          partyId,
          firstName,
          lastName: "Haddad",
          invitedTo: { preWedding: false, wedding: true, brunch: true },
        }),
      );
    }
    return { partyId, named };
  }

  const card = (overrides: Record<string, unknown> = {}) => ({
    firstName: "Nour",
    lastName: "Haddad",
    isPlusOne: false,
    preWedding: false,
    wedding: true,
    brunch: false,
    ...overrides,
  });

  it("asks only the two named guests about the brunch, end to end", async () => {
    const t = setup();
    const { partyId, named } = await brunchParty(t);

    const before = await t.query(api.rsvp.getByToken, { token: PARTY.token });
    expect(before?.party).toMatchObject({
      invitedToWedding: true,
      invitedToBrunch: true,
      defaultInvitedTo: { preWedding: false, wedding: true, brunch: false },
    });
    expect(before?.guests.map((guest) => [guest.firstName, guest.invitedTo.brunch, guest.addedByCouple])).toEqual([
      ["Rae", true, true],
      ["Cherif", true, true],
    ]);

    await t.mutation(api.rsvp.submit, {
      token: PARTY.token,
      declined: false,
      contactEmail: "rae@example.com",
      guests: [
        card({ guestId: named[0], firstName: "Rae", brunch: true }),
        card({ guestId: named[1], firstName: "Cherif", brunch: false }),
        // Ticks the brunch it was never asked about; that must not become an answer.
        card({ firstName: "Nour", brunch: true }),
        card({ firstName: "Sami" }),
        card({ firstName: "Maya" }),
      ],
    });

    const guests = await guestsOf(t, partyId);
    expect(guests.map((guest) => [guest.firstName, guest.wedding, guest.brunch])).toEqual([
      ["Rae", "yes", "yes"],
      ["Cherif", "yes", "no"],
      ["Nour", "yes", "pending"],
      ["Sami", "yes", "pending"],
      ["Maya", "yes", "pending"],
    ]);
    expect(guests.slice(0, 2).every((guest) => guest.addedByCouple && guest.invitedTo?.brunch)).toBe(true);
  });

  it("keeps a couple-named guest whose card was cleared, as a no", async () => {
    const t = setup();
    const { partyId, named } = await brunchParty(t);

    await t.mutation(api.rsvp.submit, {
      token: PARTY.token,
      declined: false,
      contactEmail: "rae@example.com",
      guests: [card({ guestId: named[0], firstName: "Rae" }), card({ guestId: named[1], firstName: "", lastName: "" })],
    });

    const cherif = (await guestsOf(t, partyId)).find((guest) => guest._id === named[1]);
    expect(cherif).toMatchObject({ firstName: "Cherif", wedding: "no", brunch: "no", preWedding: "pending" });
  });

  it("does not let a guest widen their own invite", async () => {
    const t = setup();
    const partyId = await insertParty(t, { invitedToBrunch: true });
    const [guestId] = [
      await t.mutation(api.admin.addNamedGuest, {
        partyId,
        firstName: "Rae",
        lastName: "Haddad",
        invitedTo: { preWedding: false, wedding: true, brunch: false },
      }),
    ];

    await t.mutation(api.rsvp.submit, {
      token: PARTY.token,
      declined: false,
      contactEmail: "rae@example.com",
      guests: [card({ guestId, firstName: "Rae", brunch: true })],
    });

    const [rae] = await guestsOf(t, partyId);
    expect(rae).toMatchObject({ brunch: "pending", invitedTo: { preWedding: false, wedding: true, brunch: false } });
    await expect(
      t.mutation(api.rsvp.submit, {
        token: PARTY.token,
        declined: false,
        contactEmail: "rae@example.com",
        guests: [
          { ...card({ guestId, firstName: "Rae" }), invitedTo: { preWedding: true, wedding: true, brunch: true } },
        ],
      } as never),
    ).rejects.toThrow();
  });

  it("declines only what each person was asked about", async () => {
    const t = setup();
    const { partyId, named } = await brunchParty(t);
    await t.run((ctx) =>
      ctx.db.insert("guests", {
        partyId,
        firstName: "Nour",
        lastName: "Haddad",
        isPlusOne: false,
        preWedding: "pending",
        wedding: "yes",
        brunch: "pending",
      }),
    );

    await t.mutation(api.rsvp.submit, {
      token: PARTY.token,
      declined: true,
      contactEmail: "rae@example.com",
      guests: [],
    });

    const guests = await guestsOf(t, partyId);
    expect(guests.map((guest) => [guest.firstName, guest.preWedding, guest.wedding, guest.brunch])).toEqual([
      ["Rae", "pending", "no", "no"],
      ["Cherif", "pending", "no", "no"],
      ["Nour", "pending", "no", "pending"],
    ]);
    expect(guests.map((guest) => guest._id).slice(0, 2)).toEqual(named);
  });
});

describe("named guests in /admin", () => {
  it("removes someone the couple added only until they answer", async () => {
    const t = setup();
    const partyId = await insertParty(t);
    const guestId = await t.mutation(api.admin.addNamedGuest, { partyId, firstName: "Rae", lastName: "Haddad" });

    await t.run((ctx) => ctx.db.patch(guestId, { wedding: "yes" }));
    await expect(t.mutation(api.admin.removeNamedGuest, { guestId })).rejects.toThrow("already replied");

    await t.run((ctx) => ctx.db.patch(guestId, { wedding: "pending" }));
    await t.mutation(api.admin.removeNamedGuest, { guestId });
    expect(await guestsOf(t, partyId)).toHaveLength(0);
  });

  it("will not remove a guest the party named themselves", async () => {
    const t = setup();
    const partyId = await insertParty(t);
    const guestId = await t.run((ctx) =>
      ctx.db.insert("guests", {
        partyId,
        firstName: "Rae",
        lastName: "Haddad",
        isPlusOne: false,
        preWedding: "pending",
        wedding: "pending",
        brunch: "pending",
      }),
    );
    await expect(t.mutation(api.admin.removeNamedGuest, { guestId })).rejects.toThrow("Only people you added");
  });

  it("clears a person's own invite with null", async () => {
    const t = setup();
    const partyId = await insertParty(t);
    const guestId = await t.mutation(api.admin.addNamedGuest, {
      partyId,
      firstName: "Rae",
      lastName: "Haddad",
      invitedTo: { preWedding: true, wedding: true, brunch: true },
    });

    await t.mutation(api.admin.updateNamedGuest, { guestId, lastName: "Haddad-Saad", invitedTo: null });

    const [rae] = await guestsOf(t, partyId);
    expect(rae).toMatchObject({ firstName: "Rae", lastName: "Haddad-Saad", addedByCouple: true });
    expect(rae.invitedTo).toBeUndefined();
  });

  it("refuses to name more people than the party has seats", async () => {
    const t = setup();
    const partyId = await insertParty(t, { headCount: 1 });
    await t.mutation(api.admin.addNamedGuest, { partyId, firstName: "Rae", lastName: "Haddad" });
    await expect(
      t.mutation(api.admin.addNamedGuest, { partyId, firstName: "Cherif", lastName: "Haddad" }),
    ).rejects.toThrow("Raise the head count");
  });
});

describe("WhatsApp invites and the funnel", () => {
  it("stamps a WhatsApp invite once per party, and takes it back", async () => {
    const t = setup();
    const a = await insertParty(t);
    const b = await insertParty(t, { token: "b", importKey: "b" });

    expect(await t.mutation(api.admin.markInvitedOnWhatsApp, { partyIds: [a] })).toEqual({
      marked: 1,
      alreadyMarked: 0,
      missing: 0,
    });
    expect(await t.mutation(api.admin.markInvitedOnWhatsApp, { partyIds: [a, b] })).toEqual({
      marked: 1,
      alreadyMarked: 1,
      missing: 0,
    });

    const sends = await t.run((ctx) => ctx.db.query("sends").collect());
    expect(sends).toHaveLength(2);
    expect(sends.every((send) => send.channel === "whatsapp" && send.status === "sent" && !send.to)).toBe(true);

    expect(await t.mutation(api.admin.unmarkInvitedOnWhatsApp, { partyIds: [a] })).toEqual({ unmarked: 1 });
    expect(await t.run((ctx) => ctx.db.query("sends").collect())).toHaveLength(1);
  });

  it("counts each stage in parties, split by the channel that reached them first", async () => {
    const t = setup();
    const emailed = await insertParty(t, { token: "e", importKey: "e", respondedAt: 1 });
    const bounced = await insertParty(t, { token: "x", importKey: "x" });
    const whatsapped = await insertParty(t, { token: "w", importKey: "w" });
    await insertParty(t, { token: "n", importKey: "n", earlyDecline: true });

    await insertSend(t, emailed, {
      status: "delivered",
      deliveredAt: 2,
      openCount: 2,
      firstOpenedAt: 3,
      clickCount: 1,
    });
    // A receipt is opened by people who already replied; it must not count as engagement.
    await insertSend(t, bounced, { kind: "receipt", status: "delivered", openCount: 1, firstOpenedAt: 3 });
    await insertSend(t, bounced, { status: "bounced", bouncedAt: 2 });
    await t.mutation(api.admin.markInvitedOnWhatsApp, { partyIds: [whatsapped] });
    await t.run(async (ctx) => {
      await ctx.db.insert("visits", { partyId: emailed, at: 5, source: "email" });
      await ctx.db.insert("visits", { partyId: emailed, at: 6, source: "link" });
      await ctx.db.insert("visits", { partyId: whatsapped, at: 7, source: "link" });
    });

    expect(await t.query(api.admin.funnel, {})).toEqual({
      parties: 4,
      invited: { email: 2, whatsapp: 1, any: 3 },
      email: { sent: 2, delivered: 1, opened: 1, clicked: 1, bounced: 1, complained: 0 },
      visited: 2,
      replied: 2,
      byFirstChannel: {
        email: { parties: 2, visited: 1, replied: 1 },
        whatsapp: { parties: 1, visited: 1, replied: 0 },
      },
    });

    const { rows } = await t.query(api.admin.listParties, {});
    expect(rows.find((row) => row._id === emailed)).toMatchObject({
      visitCount: 2,
      lastVisitAt: 6,
      emailBounced: false,
      invitedVia: "email",
    });
    expect(rows.find((row) => row._id === bounced)).toMatchObject({ emailBounced: true, invitedVia: "email" });
    expect(rows.find((row) => row._id === whatsapped)).toMatchObject({ invitedVia: "whatsapp", visitCount: 1 });

    const timeline = await t.query(api.admin.partyActivity, { partyId: emailed });
    expect(timeline.map((item) => [item.type, item.at])).toEqual([
      ["send", expect.any(Number)],
      ["visit", 6],
      ["visit", 5],
    ]);
    expect(JSON.stringify(timeline)).not.toContain("token");
  });

  /** What /admin uses to say the email numbers are zero because nothing was emailed, not because nothing landed. */
  it("counts no email sent while only receipts and WhatsApp invites exist", async () => {
    const t = setup();
    const party = await insertParty(t);
    await insertSend(t, party, { kind: "receipt", status: "delivered", deliveredAt: 2 });
    await t.mutation(api.admin.markInvitedOnWhatsApp, { partyIds: [party] });

    expect((await t.query(api.admin.funnel, {})).email.sent).toBe(0);

    await insertSend(t, party, { kind: "update" });
    expect((await t.query(api.admin.funnel, {})).email.sent).toBe(1);
  });
});
