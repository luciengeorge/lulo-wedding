// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";

import type { Doc, Id } from "./_generated/dataModel";

import { api } from "./_generated/api";
import schema from "./schema";

vi.mock("./lib/adminAuth", () => ({
  requireAdmin: vi.fn(async () => undefined),
  isAdmin: vi.fn(async () => true),
}));

const modules = import.meta.glob("./**/*.ts");
const setup = () => convexTest(schema, modules);
type T = ReturnType<typeof setup>;

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 8, 1, 10);

const PARTY: Omit<Doc<"parties">, "_id" | "_creationTime"> = {
  importKey: "x",
  displayName: "Party",
  surname: "",
  token: "token",
  headCount: 2,
  plusOneAllowed: false,
  link: "family",
  who: "laura",
  wave: "tier1",
  invitedToPreWedding: false,
  invitedToWedding: true,
  invitedToBrunch: false,
  saveTheDateSent: false,
  earlyDecline: false,
};

const insertParty = (t: T, overrides: Partial<typeof PARTY>) =>
  t.run((ctx) => ctx.db.insert("parties", { ...PARTY, token: `token-${Math.random()}`, ...overrides }));

const insertGuest = (t: T, partyId: Id<"parties">, overrides: Partial<Doc<"guests">>) =>
  t.run((ctx) =>
    ctx.db.insert("guests", {
      partyId,
      firstName: "Guest",
      lastName: "",
      isPlusOne: false,
      preWedding: "pending",
      wedding: "pending",
      brunch: "pending",
      ...overrides,
    }),
  );

const insertSend = (t: T, partyId: Id<"parties">, overrides: Partial<Doc<"sends">>) =>
  t.run((ctx) =>
    ctx.db.insert("sends", {
      partyId,
      channel: "email",
      kind: "invite",
      status: "sent",
      sentAt: T0,
      openCount: 0,
      clickCount: 0,
      ...overrides,
    }),
  );

const insertVisit = (t: T, partyId: Id<"parties">, at: number, source: Doc<"visits">["source"]) =>
  t.run((ctx) => ctx.db.insert("visits", { partyId, at, source }));

const insertCampaign = (t: T, kind: "invite" | "reminder", createdAt: number) =>
  t.run((ctx) =>
    ctx.db.insert("campaigns", {
      kind,
      createdAt,
      createdBy: "admin@example.com",
      total: 3,
      status: "sending",
      clientRequestId: `${kind}-${createdAt}`,
    }),
  );

/**
 * Five households, small enough to count by hand:
 *
 * - Amal (4 seats, plus-one): emailed in the invite run (delivered, opened,
 *   clicked), replied 2 days later for 2 seats + a vegetarian plus-one; one
 *   seat named by the couple for the brunch too.
 * - Bassam (2 seats): WhatsApp invite, visited by link, declined online 5 days later.
 * - Chadi (3 seats): the sheet's early "No", never sent anything.
 * - Dalia (2 seats): emailed (bounced), then reminded (delivered); visited by lookup, no reply.
 * - Elie (1 seat): emailed and failed, then a stopped reminder that never went out.
 */
async function scenario(t: T) {
  const inviteRun = await insertCampaign(t, "invite", T0);
  const reminderRun = await insertCampaign(t, "reminder", T0 + 6 * DAY);

  const amal = await insertParty(t, { displayName: "Amal", headCount: 4, plusOneAllowed: true, respondedAt: T0 + 2 * DAY, whereFrom: "Beirut" });
  await insertGuest(t, amal, { wedding: "yes", dietaryNotes: "  " });
  await insertGuest(t, amal, {
    firstName: "Nour",
    lastName: "Saab",
    wedding: "yes",
    brunch: "yes",
    invitedTo: { preWedding: false, wedding: true, brunch: true },
    addedByCouple: true,
  });
  await insertGuest(t, amal, { firstName: "Joe", lastName: "Plus", isPlusOne: true, wedding: "yes", dietaryNotes: "Vegetarian" });
  await insertSend(t, amal, {
    campaignId: inviteRun,
    status: "delivered",
    deliveredAt: T0 + 1000,
    openCount: 2,
    clickCount: 1,
    to: "amal@example.com",
  });
  await insertVisit(t, amal, T0 + DAY, "email");
  await insertVisit(t, amal, T0 + 2 * DAY, "remembered");

  const bassam = await insertParty(t, { displayName: "Bassam", who: "lucien", link: "friends", respondedAt: T0 + 5 * DAY, declined: true });
  await insertSend(t, bassam, { channel: "whatsapp", sentAt: T0 });
  await insertVisit(t, bassam, T0 + 3 * DAY, "link");

  await insertParty(t, { displayName: "Chadi", headCount: 3, earlyDecline: true, wave: "tier2" });

  const dalia = await insertParty(t, { displayName: "Dalia" });
  await insertSend(t, dalia, { campaignId: inviteRun, status: "bounced" });
  await insertSend(t, dalia, {
    campaignId: reminderRun,
    kind: "reminder",
    status: "delivered",
    sentAt: T0 + 6 * DAY,
    deliveredAt: T0 + 6 * DAY,
  });
  await insertVisit(t, dalia, T0 + 6 * DAY, "lookup");

  const elie = await insertParty(t, { displayName: "Elie", headCount: 1 });
  await insertSend(t, elie, { campaignId: inviteRun, status: "failed" });
  await insertSend(t, elie, { campaignId: reminderRun, kind: "reminder", status: "cancelled", cancelKind: "stopped" });
}

describe("admin.dashboard", () => {
  it("counts seats per event from party flags and per-guest invites, with plus-ones apart", async () => {
    const t = setup();
    await scenario(t);
    const dashboard = await t.query(api.admin.dashboard, {});

    expect(dashboard.parties).toBe(5);
    expect(dashboard.replies).toBe(3);
    expect(dashboard.seats).toEqual([
      { event: "preWedding", seats: 0, coming: 0, notComing: 0, noAnswer: 0, plusOnesComing: 0 },
      // Amal 4 (2 coming, 2 unanswered) + Bassam 2 + Chadi 3 declined + Dalia 2 + Elie 1 waiting.
      { event: "wedding", seats: 12, coming: 2, notComing: 5, noAnswer: 5, plusOnesComing: 1 },
      // Only Nour was asked to the brunch.
      { event: "brunch", seats: 1, coming: 1, notComing: 0, noAnswer: 0, plusOnesComing: 0 },
    ]);
    expect(dashboard.plusOnes).toEqual({ allowed: 1, named: 1, coming: 1 });
    expect(dashboard.dietary).toEqual([{ name: "Joe Plus", note: "Vegetarian" }]);
    // Three replies is too few to project from.
    expect(dashboard.projection.shown).toBe(false);
    expect(dashboard.projection.events.every((row) => row.projected === undefined)).toBe(true);
  });

  it("dates replies, marks each send run, and leaves the sheet's decline undated", async () => {
    const t = setup();
    await scenario(t);
    const { repliesOverTime } = await t.query(api.admin.dashboard, {});

    expect(repliesOverTime.days[0]).toEqual({ day: "2026-09-01", coming: 0, declined: 0 });
    expect(repliesOverTime.days.find((row) => row.day === "2026-09-03")).toEqual({
      day: "2026-09-03",
      coming: 1,
      declined: 0,
    });
    expect(repliesOverTime.days[repliesOverTime.days.length - 1]).toEqual({ day: "2026-09-07", coming: 1, declined: 1 });
    expect(repliesOverTime.campaigns).toEqual([
      { day: "2026-09-01", kind: "invite" },
      { day: "2026-09-07", kind: "reminder" },
    ]);
    expect(repliesOverTime.undatedDeclines).toBe(1);
  });

  it("reads email health per run, leaving out a message stopped before it went out", async () => {
    const t = setup();
    await scenario(t);
    const { campaigns } = await t.query(api.admin.dashboard, {});

    expect(campaigns).toEqual([
      {
        kind: "invite",
        createdAt: T0,
        sent: 3,
        delivered: 1,
        opened: 1,
        clicked: 1,
        bounced: 1,
        failed: 1,
        complained: 0,
      },
      {
        kind: "reminder",
        createdAt: T0 + 6 * DAY,
        sent: 1,
        delivered: 1,
        opened: 0,
        clicked: 0,
        bounced: 0,
        failed: 0,
        complained: 0,
      },
    ]);
  });

  it("matches admin.funnel's split by first channel, and times replies from the first invite", async () => {
    const t = setup();
    await scenario(t);
    const dashboard = await t.query(api.admin.dashboard, {});
    const funnel = await t.query(api.admin.funnel, {});

    expect(dashboard.channels).toEqual(funnel.byFirstChannel);
    expect(dashboard.channels).toEqual({
      email: { parties: 3, visited: 2, replied: 1 },
      whatsapp: { parties: 1, visited: 1, replied: 1 },
    });
    expect(dashboard.timeToReply.bins.filter((bin) => bin.parties > 0)).toEqual([
      { label: "2", parties: 1 },
      { label: "3–6", parties: 1 },
    ]);
    expect(dashboard.timeToReply.medianDays).toBe(3.5);
  });

  it("counts visits per day by source, and reply rates over the parties asked", async () => {
    const t = setup();
    await scenario(t);
    const { visits, groups } = await t.query(api.admin.dashboard, {});

    expect(visits.total).toBe(4);
    expect(visits.days.map((row) => row.day)).toEqual([
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
      "2026-09-05",
      "2026-09-06",
      "2026-09-07",
    ]);
    expect(visits.days[0]).toEqual({ day: "2026-09-02", link: 0, email: 1, lookup: 0, remembered: 0 });
    expect(visits.days[visits.days.length - 1]).toEqual({ day: "2026-09-07", link: 0, email: 0, lookup: 1, remembered: 0 });

    // Everyone was asked: Chadi by answering on the sheet.
    expect(groups.link).toEqual([
      { group: "friends", base: 1, replied: 1, coming: 0 },
      { group: "family", base: 4, replied: 2, coming: 1 },
    ]);
    expect(groups.wave).toEqual([
      { group: "tier2", base: 1, replied: 1, coming: 0 },
      { group: "tier1", base: 4, replied: 2, coming: 1 },
    ]);
  });
});
