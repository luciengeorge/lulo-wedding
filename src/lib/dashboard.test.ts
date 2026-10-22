import { describe, expect, it } from "vitest";

import type { DashboardEntry, DashboardGuest, DashboardParty } from "./dashboard";

import { buildDashboard, MIN_REPLIES_FOR_PROJECTION, WHERE_FROM_LIMIT } from "./dashboard";

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 8, 1, 9);

function party(overrides: Partial<DashboardParty> = {}): DashboardParty {
  return {
    headCount: 2,
    plusOneAllowed: false,
    earlyDecline: false,
    invitedToPreWedding: false,
    invitedToWedding: true,
    invitedToBrunch: false,
    who: "laura",
    link: "family",
    wave: "tier1",
    ...overrides,
  };
}

function guest(overrides: Partial<DashboardGuest> = {}): DashboardGuest {
  return {
    firstName: "Rae",
    lastName: "Haddad",
    isPlusOne: false,
    preWedding: "pending",
    wedding: "pending",
    brunch: "pending",
    ...overrides,
  };
}

function entry(overrides: Partial<DashboardEntry> & { party?: DashboardParty } = {}): DashboardEntry {
  return { party: party(), guests: [], sends: [], visits: [], ...overrides };
}

const invite = (sentAt: number, channel: "email" | "whatsapp" = "email") => ({
  channel,
  kind: "invite" as const,
  status: "sent",
  sentAt,
  openCount: 0,
  clickCount: 0,
});

const wedding = (dashboard: ReturnType<typeof buildDashboard>) =>
  dashboard.seats.find((row) => row.event === "wedding");

describe("buildDashboard projection", () => {
  const coming = () => entry({ party: party({ headCount: 1, respondedAt: T0 }), guests: [guest({ wedding: "yes" })] });
  const waiting = () => entry({ party: party({ headCount: 4 }) });

  it(`hides the projection below ${MIN_REPLIES_FOR_PROJECTION} replies`, () => {
    const dashboard = buildDashboard(
      [...Array.from({ length: MIN_REPLIES_FOR_PROJECTION - 1 }, coming), waiting()],
      [],
    );
    expect(dashboard.projection.shown).toBe(false);
    expect(dashboard.projection.events.find((row) => row.event === "wedding")).toEqual({
      event: "wedding",
      confirmed: 9,
      pending: 4,
      answered: 9,
    });
  });

  it("applies each event's yes-rate to the seats still to answer once there are enough replies", () => {
    const declined = entry({ party: party({ headCount: 1, respondedAt: T0 }), guests: [guest({ wedding: "no" })] });
    // 8 yes, 2 no: an 80% yes-rate over 4 pending seats projects 3 more.
    const dashboard = buildDashboard([...Array.from({ length: 8 }, coming), declined, declined, waiting()], []);
    expect(dashboard.projection.shown).toBe(true);
    expect(dashboard.projection.events.find((row) => row.event === "wedding")).toEqual({
      event: "wedding",
      confirmed: 8,
      pending: 4,
      answered: 10,
      yesRate: 0.8,
      projected: 11,
    });
  });
});

describe("buildDashboard seats", () => {
  it("counts a couple-named guest's own invite in place of the party's flags", () => {
    const dashboard = buildDashboard(
      [
        entry({
          party: party({ headCount: 3, invitedToBrunch: false }),
          guests: [guest({ invitedTo: { preWedding: false, wedding: true, brunch: true } })],
        }),
      ],
      [],
    );
    expect(dashboard.seats.find((row) => row.event === "brunch")?.seats).toBe(1);
    expect(wedding(dashboard)?.seats).toBe(3);
  });

  it("leaves seats a partial reply did not name as no answer, and counts plus-ones apart", () => {
    const dashboard = buildDashboard(
      [
        entry({
          party: party({ headCount: 4, plusOneAllowed: true, respondedAt: T0 }),
          guests: [guest({ wedding: "yes" }), guest({ wedding: "no" }), guest({ isPlusOne: true, wedding: "yes" })],
        }),
      ],
      [],
    );
    expect(wedding(dashboard)).toEqual({
      event: "wedding",
      seats: 4,
      coming: 1,
      notComing: 1,
      noAnswer: 2,
      plusOnesComing: 1,
    });
    expect(dashboard.plusOnes).toEqual({ allowed: 1, named: 1, coming: 1 });
  });

  it("counts every seat of a sheet decline as not coming, until the party replies online", () => {
    const sheetNo = entry({ party: party({ earlyDecline: true, headCount: 3 }) });
    const changedMind = entry({
      party: party({ earlyDecline: true, headCount: 2, respondedAt: T0 }),
      guests: [guest({ wedding: "yes" }), guest({ wedding: "yes" })],
    });
    const dashboard = buildDashboard([sheetNo, changedMind], []);
    expect(wedding(dashboard)).toMatchObject({ seats: 5, coming: 2, notComing: 3, noAnswer: 0 });
    expect(dashboard.repliesOverTime.undatedDeclines).toBe(1);
    expect(dashboard.repliesOverTime.days).toEqual([{ day: "2026-09-01", coming: 1, declined: 0 }]);
  });
});

describe("buildDashboard groups and timing", () => {
  it("folds the long tail of where-from into Other", () => {
    const places = Array.from({ length: WHERE_FROM_LIMIT + 3 }, (_, index) => `Place ${index}`);
    const dashboard = buildDashboard(
      places.map((whereFrom) => entry({ party: party({ whereFrom, earlyDecline: true }) })),
      [],
    );
    expect(dashboard.groups.whereFrom).toHaveLength(WHERE_FROM_LIMIT + 1);
    expect(dashboard.groups.whereFrom.find((row) => row.group === "Other")).toEqual({
      group: "Other",
      base: 3,
      replied: 3,
      coming: 0,
    });
  });

  it("bins days from the first invite, on any channel, and leaves unprompted replies out", () => {
    const dashboard = buildDashboard(
      [
        entry({ party: party({ respondedAt: T0 + 2 * DAY + 1 }), sends: [invite(T0 + DAY), invite(T0, "whatsapp")] }),
        entry({ party: party({ respondedAt: T0 + 10 * DAY }), sends: [invite(T0)] }),
        entry({ party: party({ respondedAt: T0 }) }),
      ],
      [],
    );
    expect(dashboard.timeToReply.bins.filter((bin) => bin.parties > 0)).toEqual([
      { label: "2", parties: 1 },
      { label: "7–13", parties: 1 },
    ]);
    expect(dashboard.timeToReply.unprompted).toBe(1);
    expect(dashboard.timeToReply.medianDays).toBeCloseTo(6, 3);
  });

  it("dates a reply by its first submission, so a later edit does not move it", () => {
    const yes = [guest({ wedding: "yes", weddingAt: T0 + 2 * DAY + 1 })];
    const dashboard = buildDashboard(
      [
        entry({
          party: party({ firstRespondedAt: T0 + 2 * DAY + 1, respondedAt: T0 + 30 * DAY }),
          guests: yes,
          sends: [invite(T0)],
        }),
        // Replied before firstRespondedAt was recorded: the earliest answer stands in.
        entry({ party: party({ respondedAt: T0 + 30 * DAY }), guests: yes, sends: [invite(T0)] }),
        // Said yes on day 2 then declined on day 30, which restamps every answer:
        // the day-2 receipt still dates the first reply.
        entry({
          party: party({ respondedAt: T0 + 30 * DAY, declined: true }),
          guests: [guest({ wedding: "no", weddingAt: T0 + 30 * DAY })],
          sends: [invite(T0), { ...invite(T0 + 2 * DAY + 1), kind: "receipt" as const }],
        }),
      ],
      [],
    );
    expect(dashboard.timeToReply.bins.filter((bin) => bin.parties > 0)).toEqual([{ label: "2", parties: 3 }]);
    expect(dashboard.repliesOverTime.days[0]?.day).toBe(new Date(T0 + 2 * DAY).toISOString().slice(0, 10));
  });

  it("leaves out a run that was stopped before anything went out", () => {
    const sent = { ...invite(T0), campaignId: "sent-run" };
    const dashboard = buildDashboard(
      [entry({ sends: [sent] })],
      [
        { id: "sent-run", kind: "invite", createdAt: T0 },
        { id: "stopped-run", kind: "reminder", createdAt: T0 + DAY },
      ],
    );
    expect(dashboard.campaigns).toHaveLength(1);
    expect(dashboard.repliesOverTime.campaigns.map((run) => run.kind)).toEqual(["invite"]);
  });
});
