// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Doc, Id } from "./_generated/dataModel";

import { api, internal } from "./_generated/api";
import { SEND_SPACING_MS } from "../src/lib/email-campaign";
import { invitationMessage, replyByDate, skipReasonFor } from "./campaigns";
import schema from "./schema";

const ADMIN_EMAIL = "laura@example.com";
vi.mock("./lib/adminAuth", () => ({
  requireAdmin: vi.fn(async () => ({ email: "laura@example.com", emailVerified: true })),
  isAdmin: vi.fn(async () => false),
}));

const modules = import.meta.glob("./**/*.ts");
const setup = () => convexTest(schema, modules);
type T = ReturnType<typeof setup>;

type PartyFields = Omit<Doc<"parties">, "_id" | "_creationTime">;
const PARTY: PartyFields = {
  importKey: "rae|haddad",
  displayName: "Rae & Cherif",
  surname: "Haddad",
  token: "token-haddad",
  headCount: 2,
  plusOneAllowed: false,
  link: "family",
  who: "laura",
  wave: "tier2",
  under50: true,
  whereFrom: "Work",
  note: "Seat far from the bar",
  invitedToPreWedding: false,
  invitedToWedding: true,
  invitedToBrunch: false,
  saveTheDateSent: true,
  earlyDecline: false,
  contactEmail: "rae@example.com",
};

let count = 0;
async function insertParty(t: T, overrides: Partial<PartyFields> = {}): Promise<Id<"parties">> {
  count++;
  return await t.run((ctx) =>
    ctx.db.insert("parties", { ...PARTY, importKey: `k${count}`, token: `token-${count}`, ...overrides }),
  );
}

async function insertSend(t: T, partyId: Id<"parties">, overrides: Partial<Doc<"sends">> = {}) {
  return await t.run((ctx) =>
    ctx.db.insert("sends", {
      partyId,
      channel: "email",
      kind: "invite",
      to: "rae@example.com",
      status: "sent",
      sentAt: Date.now(),
      openCount: 0,
      clickCount: 0,
      ...overrides,
    }),
  );
}

const jobs = (t: T) => t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
const sendsTable = (t: T) => t.run((ctx) => ctx.db.query("sends").collect());

beforeEach(() => {
  process.env.SITE_URL = "https://lauralucien.com";
  delete process.env.RSVP_DEADLINE;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("invitationMessage", () => {
  const party = { ...PARTY, _id: "p1" as Id<"parties">, _creationTime: 1 };

  it("lists the party's own events and any a named guest was invited to further", () => {
    const message = invitationMessage("invite", party, [
      { invitedTo: { preWedding: false, wedding: true, brunch: true } },
    ]);
    expect(message.props.events).toEqual([
      { label: "Wedding", date: "Saturday 17 July 2027" },
      { label: "Brunch", date: "Sunday 18 July 2027" },
    ]);
  });

  it("puts the send id on the link, or marks a test copy", () => {
    const sent = invitationMessage("invite", party, [], { sendId: "s1" as Id<"sends"> });
    expect(sent.props.rsvpUrl).toBe("https://lauralucien.com/rsvp/token-haddad?s=s1");
    const test = invitationMessage("reminder", party, [], { test: true });
    expect(test.props.rsvpUrl).toBe("https://lauralucien.com/rsvp/token-haddad?test=1");
    expect(test.subject).toBe("A gentle reminder from Laura & Lucien");
  });

  it("says when to reply only once a deadline is set", () => {
    expect(invitationMessage("invite", party, []).props.replyBy).toBeUndefined();
    process.env.RSVP_DEADLINE = "2027-06-01";
    expect(invitationMessage("invite", party, []).props.replyBy).toBe("Tuesday 1 June 2027");
  });

  it("carries nothing the couple keep private about the party", () => {
    process.env.RSVP_DEADLINE = "2027-06-01";
    const everything: Doc<"parties"> = { ...party, who: "nayla" };
    const message = invitationMessage("invite", everything, []);
    expect(Object.keys(message.props).sort()).toEqual(["displayName", "events", "replyBy", "rsvpUrl"]);
    const text = JSON.stringify(message);
    for (const secret of ["tier2", "Work", "Seat far from the bar", "nayla", "under50", "family"]) {
      expect(text).not.toContain(secret);
    }
  });

  it("drops a deadline that is not a date rather than printing it", () => {
    expect(replyByDate("soon")).toBeUndefined();
    expect(replyByDate("2027-05-20T12:00:00Z")).toBe("Thursday 20 May 2027");
  });
});

describe("skipReasonFor", () => {
  const party = { ...PARTY, _id: "p1" as Id<"parties">, _creationTime: 1 };
  const sent = (overrides: Partial<Doc<"sends">> = {}): Doc<"sends"> => ({
    _id: "s1" as Id<"sends">,
    _creationTime: 1,
    partyId: party._id,
    channel: "email",
    kind: "invite",
    status: "delivered",
    sentAt: 1,
    openCount: 0,
    clickCount: 0,
    ...overrides,
  });

  it("only reminds a party that was invited and has not replied", () => {
    expect(skipReasonFor("reminder", party, [], [])).toBe("notInvited");
    expect(skipReasonFor("reminder", party, [], [sent({ channel: "whatsapp", to: undefined })])).toBeNull();
    expect(skipReasonFor("reminder", party, [], [sent({ status: "failed" })])).toBe("notInvited");
    expect(skipReasonFor("reminder", { ...party, respondedAt: 5 }, [], [sent()])).toBe("replied");
    expect(skipReasonFor("reminder", { ...party, earlyDecline: true }, [], [sent()])).toBe("declinedEarly");
  });

  it("does not email an invitation twice unless asked to", () => {
    expect(skipReasonFor("invite", party, [], [sent()])).toBe("alreadySent");
    expect(skipReasonFor("invite", party, [], [sent()], true)).toBeNull();
    // Stopped or failed: it never reached them.
    expect(skipReasonFor("invite", party, [], [sent({ status: "cancelled" }), sent({ status: "failed" })])).toBeNull();
    // A WhatsApp invite is not an email one.
    expect(skipReasonFor("invite", party, [], [sent({ channel: "whatsapp" })])).toBeNull();
  });

  it("needs an address and at least one event, counting named guests' invites", () => {
    expect(skipReasonFor("invite", { ...party, contactEmail: " " }, [], [])).toBe("noEmail");
    const noEvents = { ...party, invitedToWedding: false };
    expect(skipReasonFor("invite", noEvents, [], [])).toBe("noEvents");
    expect(
      skipReasonFor("invite", noEvents, [{ invitedTo: { preWedding: false, wedding: false, brunch: true } }], []),
    ).toBeNull();
  });
});

describe("prepareCampaign", () => {
  it("splits a selection into recipients and grouped skips", async () => {
    const t = setup();
    const ok = await insertParty(t, { displayName: "Amal" });
    const noEmail = await insertParty(t, { displayName: "Bassam", contactEmail: undefined });
    const replied = await insertParty(t, { displayName: "Carla", respondedAt: 1 });
    const emailed = await insertParty(t, { displayName: "Dana" });
    await insertSend(t, emailed);

    const result = await t.query(api.admin.prepareCampaign, {
      kind: "invite",
      partyIds: [ok, noEmail, replied, emailed, ok],
    });
    expect(result.recipients.map((party) => party.displayName)).toEqual(["Amal"]);
    expect(result.recipients[0].email).toBe("rae@example.com");
    expect(result.skipped.map((party) => [party.displayName, party.reason])).toEqual([
      ["Bassam", "noEmail"],
      ["Carla", "replied"],
      ["Dana", "alreadySent"],
    ]);

    const again = await t.query(api.admin.prepareCampaign, {
      kind: "invite",
      partyIds: [emailed],
      includeAlreadySent: true,
    });
    expect(again.recipients).toHaveLength(1);
  });
});

describe("startCampaign", () => {
  it("writes a queued row per recipient and paces their sends", async () => {
    const t = setup();
    const a = await insertParty(t);
    const b = await insertParty(t);
    const skipped = await insertParty(t, { contactEmail: undefined });

    const { campaignId, total } = await t.mutation(api.admin.startCampaign, {
      kind: "invite",
      partyIds: [a, b, skipped],
      clientRequestId: "req-1",
    });
    expect(total).toBe(2);

    const rows = await sendsTable(t);
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row).toMatchObject({ campaignId, channel: "email", kind: "invite", status: "queued" });
      expect(row.scheduledId).toBeDefined();
    }

    const scheduled = (await jobs(t)).sort((x, y) => x.scheduledTime - y.scheduledTime);
    expect(scheduled.map((job) => job.name)).toEqual(["campaigns:dispatch", "campaigns:dispatch"]);
    expect(scheduled[1].scheduledTime - scheduled[0].scheduledTime).toBeGreaterThanOrEqual(SEND_SPACING_MS - 5);
  });

  it("starts one run for one request id, however many times it arrives", async () => {
    const t = setup();
    const a = await insertParty(t);
    const args = { kind: "invite" as const, partyIds: [a], clientRequestId: "double-click" };

    const first = await t.mutation(api.admin.startCampaign, args);
    const second = await t.mutation(api.admin.startCampaign, args);
    expect(second).toEqual({ ...first, duplicate: true });
    expect(await sendsTable(t)).toHaveLength(1);
    expect(await jobs(t)).toHaveLength(1);
  });

  it("takes a whole guest list of 400 in one go, spaced out", async () => {
    const t = setup();
    const ids: Id<"parties">[] = [];
    for (let index = 0; index < 400; index++) ids.push(await insertParty(t));

    const { total } = await t.mutation(api.admin.startCampaign, {
      kind: "invite",
      partyIds: ids,
      clientRequestId: "everyone",
    });
    expect(total).toBe(400);

    const times = (await jobs(t)).map((job) => job.scheduledTime).sort((x, y) => x - y);
    expect(times).toHaveLength(400);
    // About four minutes end to end: under two requests a second the whole way.
    expect(times[399] - times[0]).toBeGreaterThanOrEqual(399 * SEND_SPACING_MS - 50);
  });

  it("refuses a selection nobody in which can be sent it", async () => {
    const t = setup();
    const a = await insertParty(t, { contactEmail: undefined });
    await expect(
      t.mutation(api.admin.startCampaign, { kind: "invite", partyIds: [a], clientRequestId: "none" }),
    ).rejects.toThrow(/Nobody in this selection/);
  });
});

describe("dispatch", () => {
  it("hands the party's current email to the sender and stops waiting", async () => {
    const t = setup();
    const a = await insertParty(t);
    await insertSend(t, a, { channel: "whatsapp", to: undefined });
    await t.mutation(api.admin.startCampaign, { kind: "reminder", partyIds: [a], clientRequestId: "r" });
    const [row] = (await sendsTable(t)).filter((send) => send.kind === "reminder");

    // The party fixed its address after the run started.
    await t.run((ctx) => ctx.db.patch(a, { contactEmail: "new@example.com" }));
    await t.mutation(internal.campaigns.dispatch, { sendId: row._id });

    const after = await t.run((ctx) => ctx.db.get(row._id));
    expect(after).toMatchObject({ to: "new@example.com", status: "queued" });
    expect(after?.scheduledId).toBeUndefined();

    const email = (await jobs(t)).find((job) => job.name === "email/send:sendEmail");
    const [args] = email?.args as [{ to: string; template: string; subject: string; sendId: string; props: object }];
    expect(args).toMatchObject({ to: "new@example.com", template: "reminder", sendId: row._id });
    expect(args.props).toMatchObject({ rsvpUrl: expect.stringContaining(`?s=${row._id}`) });

    // Running it twice sends once.
    await t.mutation(internal.campaigns.dispatch, { sendId: row._id });
    expect((await jobs(t)).filter((job) => job.name === "email/send:sendEmail")).toHaveLength(1);
  });
});

describe("cancelCampaign", () => {
  it("cancels what has not gone, leaves what has, and the counts say so", async () => {
    const t = setup();
    const ids = [await insertParty(t), await insertParty(t), await insertParty(t)];
    const { campaignId } = await t.mutation(api.admin.startCampaign, {
      kind: "invite",
      partyIds: ids,
      clientRequestId: "stop-me",
    });
    const rows = await sendsTable(t);
    await t.mutation(internal.campaigns.dispatch, { sendId: rows[0]._id });

    expect(await t.mutation(api.admin.cancelCampaign, { campaignId })).toEqual({ stopped: 2 });

    const after = await sendsTable(t);
    expect(after.map((row) => row.status).sort()).toEqual(["cancelled", "cancelled", "queued"]);
    expect(after.filter((row) => row.status === "cancelled").every((row) => row.error)).toBe(true);

    const states = (await jobs(t))
      .filter((job) => job.name === "campaigns:dispatch")
      .map((job) => job.state.kind)
      .sort();
    expect(states).toEqual(["canceled", "canceled", "pending"]);

    const [summary] = await t.query(api.admin.campaigns, {});
    expect(summary).toMatchObject({ status: "cancelled", total: 3, cancelled: 2, remaining: 1, sent: 0 });

    // The stopped parties are not counted as invited anywhere.
    const pipeline = await t.query(api.admin.pipeline, {});
    expect(pipeline.filter((row) => row.firstInvitedAt !== undefined)).toHaveLength(1);
  });

  it("a stopped run's late job does not send", async () => {
    const t = setup();
    const a = await insertParty(t);
    const { campaignId } = await t.mutation(api.admin.startCampaign, {
      kind: "invite",
      partyIds: [a],
      clientRequestId: "late",
    });
    await t.run((ctx) => ctx.db.patch(campaignId, { status: "cancelled" }));
    const [row] = await sendsTable(t);
    await t.mutation(internal.campaigns.dispatch, { sendId: row._id });

    expect((await t.run((ctx) => ctx.db.get(row._id)))?.status).toBe("cancelled");
    expect((await jobs(t)).some((job) => job.name === "email/send:sendEmail")).toBe(false);
  });
});

describe("campaigns", () => {
  it("reads progress off the rows and calls a run with nothing left done", async () => {
    const t = setup();
    const ids = [await insertParty(t), await insertParty(t)];
    const { campaignId } = await t.mutation(api.admin.startCampaign, {
      kind: "invite",
      partyIds: ids,
      clientRequestId: "progress",
    });
    expect((await t.query(api.admin.campaigns, {}))[0]).toMatchObject({ status: "sending", remaining: 2 });

    const rows = await sendsTable(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(rows[0]._id, { status: "delivered", scheduledId: undefined });
      await ctx.db.patch(rows[1]._id, { status: "failed", scheduledId: undefined });
    });
    expect((await t.query(api.admin.campaigns, {}))[0]).toMatchObject({
      campaignId,
      status: "done",
      sent: 1,
      failed: 1,
      remaining: 0,
      createdBy: ADMIN_EMAIL,
    });
  });
});

describe("sendTestEmail", () => {
  it("goes to the signed-in admin only, marked as a test, and is not a send", async () => {
    const t = setup();
    const a = await insertParty(t);

    expect(await t.mutation(api.admin.sendTestEmail, { kind: "invite", partyId: a })).toEqual({ to: ADMIN_EMAIL });

    expect(await sendsTable(t)).toHaveLength(0);
    const [job] = await jobs(t);
    const [args] = job.args as [{ to: string; subject: string; sendId?: string; props: { rsvpUrl: string } }];
    expect(args.to).toBe(ADMIN_EMAIL);
    expect(args.subject).toBe("[Test] You are invited: Laura & Lucien, 17 July 2027");
    expect(args.sendId).toBeUndefined();
    expect(args.props.rsvpUrl).toMatch(/\?test=1$/);
  });
});
