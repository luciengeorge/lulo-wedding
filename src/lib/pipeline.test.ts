import { describe, expect, it } from "vitest";

import type { RsvpGuest, RsvpParty } from "./party-filters";
import type { PipelineFacts } from "./pipeline";

import {
  attentionReason,
  countStages,
  derivePipeline,
  NEVER_SEEN_DAYS,
  replyOutcome,
  SEEN_NO_REPLY_DAYS,
  stageConversion,
} from "./pipeline";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 21, 12);

const WEDDING_ONLY = { preWedding: false, wedding: true, brunch: false };

function facts(overrides: Partial<PipelineFacts> = {}): PipelineFacts {
  return { invitedTo: WEDDING_ONLY, ...overrides };
}

const party: RsvpParty & { headCount: number } = {
  headCount: 2,
  earlyDecline: false,
  invitedToPreWedding: false,
  invitedToWedding: true,
  invitedToBrunch: false,
};

function guest(overrides: Partial<RsvpGuest> = {}): RsvpGuest {
  return { preWedding: "pending", wedding: "pending", brunch: "pending", isPlusOne: false, ...overrides };
}

describe("derivePipeline stages", () => {
  it("puts a party with nothing sent, seen or said in Not invited", () => {
    expect(derivePipeline(facts(), NOW)).toEqual({ stage: "notInvited", flags: [] });
  });

  it("moves a party to Invited once any channel has sent an invite", () => {
    expect(derivePipeline(facts({ firstInvitedAt: NOW - DAY }), NOW).stage).toBe("invited");
  });

  it("moves a party to Seen on its first visit", () => {
    expect(derivePipeline(facts({ firstInvitedAt: NOW - 2 * DAY, lastVisitAt: NOW - DAY }), NOW).stage).toBe("seen");
  });

  it("puts a reply in Replied with its outcome", () => {
    expect(
      derivePipeline(facts({ firstInvitedAt: NOW - 2 * DAY, lastVisitAt: NOW - DAY, reply: "partly" }), NOW),
    ).toEqual({ stage: "replied", reply: "partly", flags: [] });
  });

  it("lands a party in the furthest stage it reached, even with no invite stamped", () => {
    expect(derivePipeline(facts({ lastVisitAt: NOW - DAY }), NOW).stage).toBe("seen");
    expect(derivePipeline(facts({ reply: "coming" }), NOW).stage).toBe("replied");
    expect(derivePipeline(facts({ reply: "declined", lastVisitAt: NOW }), NOW).stage).toBe("replied");
  });

  it("only carries a reply outcome in Replied", () => {
    expect(derivePipeline(facts({ lastVisitAt: NOW }), NOW)).not.toHaveProperty("reply");
  });
});

describe("derivePipeline attention flags", () => {
  it("flags an email that failed to send", () => {
    expect(derivePipeline(facts({ firstInvitedAt: NOW, emailTrouble: "failed" }), NOW).flags).toEqual([
      { kind: "emailFailed" },
    ]);
  });

  it("starts the seen clock from the latest visit, so a party who came back is not chased", () => {
    // First looked 20 days ago, back yesterday: the latest visit is what counts.
    expect(derivePipeline(facts({ firstInvitedAt: NOW - 25 * DAY, lastVisitAt: NOW - DAY }), NOW).flags).toEqual([]);
    expect(derivePipeline(facts({ firstInvitedAt: NOW - 25 * DAY, lastVisitAt: NOW - 9 * DAY }), NOW).flags).toEqual([
      { kind: "seenNoReply", days: 9 },
    ]);
  });

  it("flags a bounced or complained email in any stage", () => {
    expect(derivePipeline(facts({ firstInvitedAt: NOW, emailTrouble: "bounced" }), NOW).flags).toEqual([
      { kind: "emailBounced" },
    ]);
    expect(derivePipeline(facts({ reply: "coming", emailTrouble: "complained" }), NOW)).toEqual({
      stage: "replied",
      reply: "coming",
      flags: [{ kind: "emailComplained" }],
    });
  });

  it("flags a party invited to no events", () => {
    const none = { preWedding: false, wedding: false, brunch: false };
    expect(derivePipeline(facts({ invitedTo: none }), NOW).flags).toEqual([{ kind: "noEvents" }]);
  });

  it("flags seen without a reply only from the seventh day", () => {
    const seen = (days: number) => derivePipeline(facts({ lastVisitAt: NOW - days * DAY }), NOW).flags;
    expect(seen(SEEN_NO_REPLY_DAYS)).toEqual([{ kind: "seenNoReply", days: 7 }]);
    expect(seen(SEEN_NO_REPLY_DAYS - 0.01)).toEqual([]);
    expect(seen(20)).toEqual([{ kind: "seenNoReply", days: 20 }]);
  });

  it("drops the seen flag once they reply", () => {
    expect(derivePipeline(facts({ lastVisitAt: NOW - 30 * DAY, reply: "declined" }), NOW).flags).toEqual([]);
  });

  it("flags an invite never seen only from the fourteenth day", () => {
    const invited = (days: number) => derivePipeline(facts({ firstInvitedAt: NOW - days * DAY }), NOW).flags;
    expect(invited(NEVER_SEEN_DAYS)).toEqual([{ kind: "neverSeen", days: 14 }]);
    expect(invited(NEVER_SEEN_DAYS - 0.01)).toEqual([]);
  });

  it("drops the never-seen flag once they visit", () => {
    const placed = derivePipeline(facts({ firstInvitedAt: NOW - 30 * DAY, lastVisitAt: NOW - 2 * DAY }), NOW);
    expect(placed).toEqual({ stage: "seen", flags: [] });
  });

  it("can hold several flags at once", () => {
    const placed = derivePipeline(
      facts({
        firstInvitedAt: NOW - 15 * DAY,
        emailTrouble: "bounced",
        invitedTo: { preWedding: false, wedding: false, brunch: false },
      }),
      NOW,
    );
    expect(placed.flags.map((flag) => flag.kind)).toEqual(["emailBounced", "noEvents", "neverSeen"]);
  });

  it("explains each flag in plain words", () => {
    expect(attentionReason({ kind: "emailBounced" })).toBe("Email bounced");
    expect(attentionReason({ kind: "emailComplained" })).toBe("Email marked as spam");
    expect(attentionReason({ kind: "emailFailed" })).toBe("Email failed");
    expect(attentionReason({ kind: "noEvents" })).toBe("Invited to no events");
    expect(attentionReason({ kind: "seenNoReply", days: 9 })).toBe("Seen 9 days ago, no reply");
    expect(attentionReason({ kind: "neverSeen", days: 15 })).toBe("Invited 15 days ago, not seen");
  });
});

describe("replyOutcome", () => {
  it("is nothing until the party answers", () => {
    expect(replyOutcome(party, [])).toBeUndefined();
    // A guest the couple named ahead of the reply is an invitation, not an answer.
    expect(replyOutcome(party, [guest()])).toBeUndefined();
  });

  it("is Coming when every named seat said yes to something", () => {
    expect(replyOutcome({ ...party, respondedAt: 1 }, [guest({ wedding: "yes" }), guest({ wedding: "yes" })])).toBe(
      "coming",
    );
  });

  it("is Partly when only some seats replied, or some said no", () => {
    expect(replyOutcome({ ...party, respondedAt: 1 }, [guest({ wedding: "yes" })])).toBe("partly");
    expect(replyOutcome({ ...party, respondedAt: 1 }, [guest({ wedding: "yes" }), guest({ wedding: "no" })])).toBe(
      "partly",
    );
  });

  it("does not let a plus one fill a named seat", () => {
    expect(
      replyOutcome({ ...party, respondedAt: 1 }, [
        guest({ wedding: "yes" }),
        guest({ wedding: "yes", isPlusOne: true }),
      ]),
    ).toBe("partly");
  });

  it("ignores a yes to an event the seat was never invited to", () => {
    expect(replyOutcome({ ...party, headCount: 1, respondedAt: 1 }, [guest({ brunch: "yes" })])).toBe("declined");
  });

  it("is Declined when everyone answered no, or the form recorded a decline", () => {
    expect(replyOutcome({ ...party, respondedAt: 1 }, [guest({ wedding: "no" }), guest({ wedding: "no" })])).toBe(
      "declined",
    );
    expect(replyOutcome({ ...party, respondedAt: 1, declined: true }, [])).toBe("declined");
  });

  it("counts the sheet's early decline as Declined while there is no online reply", () => {
    expect(replyOutcome({ ...party, earlyDecline: true }, [])).toBe("declined");
  });

  it("lets an online reply beat the sheet's early decline", () => {
    const changedTheirMind = { ...party, earlyDecline: true, respondedAt: 1 };
    expect(replyOutcome(changedTheirMind, [guest({ wedding: "yes" }), guest({ wedding: "yes" })])).toBe("coming");
    expect(replyOutcome(changedTheirMind, [guest({ wedding: "yes" })])).toBe("partly");
  });

  it("feeds straight into the board as Replied", () => {
    const outcome = replyOutcome({ ...party, earlyDecline: true }, []);
    expect(derivePipeline(facts({ reply: outcome }), NOW)).toEqual({ stage: "replied", reply: "declined", flags: [] });
  });
});

describe("stage counts", () => {
  it("counts each lane", () => {
    expect(countStages(["notInvited", "notInvited", "invited", "seen", "seen", "replied"])).toEqual({
      notInvited: 2,
      invited: 1,
      seen: 2,
      replied: 1,
    });
  });
});

describe("stage conversion", () => {
  const sent = NOW - 3 * DAY;
  const looked = NOW - DAY;
  const list: Pick<PipelineFacts, "firstInvitedAt" | "lastVisitAt" | "reply">[] = [
    {},
    {},
    { firstInvitedAt: sent },
    { firstInvitedAt: sent },
    { firstInvitedAt: sent, lastVisitAt: looked },
    { firstInvitedAt: sent, lastVisitAt: looked },
    { firstInvitedAt: sent, lastVisitAt: looked, reply: "coming" },
    { firstInvitedAt: sent, lastVisitAt: looked, reply: "partly" },
  ];

  it("is each step as a share of the one before", () => {
    expect(stageConversion(list, "notInvited")).toBeUndefined();
    // 6 of 8 were sent an invite, 4 of those 6 looked, 2 of those 4 replied.
    expect(stageConversion(list, "invited")).toBe(75);
    expect(stageConversion(list, "seen")).toBe(67);
    expect(stageConversion(list, "replied")).toBe(50);
  });

  it("does not count the sheet's early No as invited or seen", () => {
    // In Replied, but never sent anything and never visited.
    const earlyNo = { reply: replyOutcome({ ...party, earlyDecline: true }, []) };
    expect(derivePipeline(facts(earlyNo), NOW).stage).toBe("replied");

    const withEarlyNo = [...list, earlyNo, earlyNo];
    // The list grows to 10, so the invited share falls; nothing else moves.
    expect(stageConversion(withEarlyNo, "invited")).toBe(60);
    expect(stageConversion(withEarlyNo, "seen")).toBe(67);
    expect(stageConversion(withEarlyNo, "replied")).toBe(50);
  });

  it("does not count a visit or a reply without an invite towards seen or replied", () => {
    // Found their own name and replied without ever being sent anything.
    const selfServed = { lastVisitAt: looked, reply: "coming" as const };
    expect(stageConversion([...list, selfServed], "seen")).toBe(67);
    expect(stageConversion([...list, selfServed], "replied")).toBe(50);
  });

  it("has nothing to say with no base", () => {
    expect(stageConversion([{}], "seen")).toBeUndefined();
    expect(stageConversion([{ firstInvitedAt: sent }], "replied")).toBeUndefined();
  });
});
