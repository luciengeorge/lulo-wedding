import { describe, expect, it } from "vitest";

import type { ReplyGuest, ReplyParty } from "./rsvp-rules";

import {
  invitedEvents,
  isBlankCard,
  isEffectiveDecline,
  seatsAccountedFor,
  statusFor,
  validateReply,
} from "./rsvp-rules";

const party: ReplyParty = {
  headCount: 2,
  plusOneAllowed: false,
  invitedToPreWedding: false,
  invitedToWedding: true,
  invitedToBrunch: false,
};

function guest(overrides: Partial<ReplyGuest> = {}): ReplyGuest {
  return {
    firstName: "Rae",
    lastName: "Haddad",
    email: "rae@example.com",
    isPlusOne: false,
    attending: { wedding: true },
    ...overrides,
  };
}

const messages = (issues: { message: string }[]) => issues.map((issue) => issue.message);

describe("statusFor", () => {
  it("records yes and no only for events the party was invited to", () => {
    expect(statusFor(true, true)).toBe("yes");
    expect(statusFor(true, false)).toBe("no");
    expect(statusFor(true, undefined)).toBe("no");
  });

  /**
   * The distinction the admin counts depend on. A party never asked about the
   * brunch did not decline it, and folding the two together would report 400
   * refusals for an event nobody was invited to.
   */
  it("leaves an event the party was never asked about as pending", () => {
    expect(statusFor(false, true)).toBe("pending");
    expect(statusFor(false, false)).toBe("pending");
  });
});

describe("invitedEvents", () => {
  it("lists only this party's events, in running order", () => {
    expect(invitedEvents({ ...party, invitedToPreWedding: true, invitedToBrunch: true })).toEqual([
      "preWedding",
      "wedding",
      "brunch",
    ]);
    expect(invitedEvents(party)).toEqual(["wedding"]);
  });
});

describe("isBlankCard", () => {
  it("treats whitespace as blank, so a stray space is not a person", () => {
    expect(isBlankCard(guest({ firstName: "", lastName: "" }))).toBe(true);
    expect(isBlankCard(guest({ firstName: "   ", lastName: "\t" }))).toBe(true);
    expect(isBlankCard(guest({ firstName: "", lastName: "Haddad" }))).toBe(false);
  });
});

describe("validateReply", () => {
  it("accepts an ordinary reply", () => {
    expect(validateReply(party, [guest()])).toEqual([]);
  });

  it("ignores blank cards entirely, because an unused seat is not an error", () => {
    const issues = validateReply(party, [guest(), guest({ firstName: "", lastName: "", attending: {} })]);
    expect(issues).toEqual([]);
  });

  it("refuses a reply with nothing in it at all", () => {
    const issues = validateReply(party, [guest({ firstName: "", lastName: "", attending: {} })]);
    expect(messages(issues)).toEqual(["Tell us at least one name, or let us know you cannot make it."]);
  });

  /**
   * The one ambiguous state on the form: a name with no day ticked reads equally
   * as "coming, forgot to say when" and as "not coming", and guessing either way
   * costs a seat.
   */
  it("refuses a named guest with no day ticked, and names them in the message", () => {
    const issues = validateReply(party, [guest({ firstName: "Nour", attending: {} })]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ guestIndex: 0, field: "attending" });
    expect(issues[0].message).toContain("Nour");
  });

  it("does not count an event the party was not invited to as a day ticked", () => {
    const issues = validateReply(party, [guest({ attending: { brunch: true } })]);
    expect(messages(issues)[0]).toContain("Which days");
  });

  it("refuses more named guests than the invitation has seats", () => {
    const issues = validateReply(party, [guest(), guest({ firstName: "Cherif" }), guest({ firstName: "Nour" })]);
    expect(messages(issues)[0]).toContain("Your invitation is for 2");
  });

  it("reports every problem at once rather than walking a family through one submit each", () => {
    const issues = validateReply(party, [
      guest({ firstName: "Nour", attending: {} }),
      guest({ firstName: "Sami", email: "not-an-email" }),
    ]);
    expect(issues.map((issue) => issue.field)).toEqual(["attending", "email"]);
  });

  it("accepts a guest with no email at all, which is how children reply", () => {
    expect(validateReply(party, [guest({ email: undefined })])).toEqual([]);
  });

  it("refuses an email that is present but malformed", () => {
    expect(messages(validateReply(party, [guest({ email: "rae@" })]))).toEqual([
      "That does not look like an email address.",
    ]);
  });

  describe("plus ones", () => {
    const withPlusOne = { ...party, plusOneAllowed: true };

    it("allows one when the invitation includes one", () => {
      expect(validateReply(withPlusOne, [guest(), guest({ firstName: "Sami", isPlusOne: true })])).toEqual([]);
    });

    it("does not count the plus one against the party's seats", () => {
      const guests = [guest(), guest({ firstName: "Cherif" }), guest({ firstName: "Sami", isPlusOne: true })];
      expect(validateReply(withPlusOne, guests)).toEqual([]);
    });

    it("refuses a second plus one", () => {
      const guests = [guest({ firstName: "Sami", isPlusOne: true }), guest({ firstName: "Dana", isPlusOne: true })];
      expect(messages(validateReply(withPlusOne, guests))).toContain("This invitation includes one plus one.");
    });

    it("refuses a plus one when the invitation has none", () => {
      const guests = [guest(), guest({ firstName: "Sami", isPlusOne: true })];
      expect(messages(validateReply(party, guests))).toContain("This invitation does not include a plus one.");
    });

    /**
     * If the couple withdraw a plus one after a party already named theirs, that
     * person stays valid. Rejecting them traps the party behind an error they
     * cannot clear, and dropping a named human from their reply is worse still.
     */
    it("keeps a plus one who was already named when the allowance is later withdrawn", () => {
      const guests = [guest(), guest({ firstName: "Sami", isPlusOne: true })];
      expect(validateReply(party, guests, { existingPlusOne: true })).toEqual([]);
    });
  });

  it("refuses to take a reply for a party with no events attached", () => {
    const uninvited = { ...party, invitedToWedding: false };
    expect(messages(validateReply(uninvited, [guest()]))).toEqual([
      "This invitation has no events attached to it yet.",
    ]);
  });
});

describe("isEffectiveDecline", () => {
  it("is true when every named guest said no to everything", () => {
    expect(isEffectiveDecline(party, [guest({ attending: {} }), guest({ firstName: "Cherif", attending: {} })])).toBe(
      true,
    );
  });

  it("is false as soon as one guest is coming to one event", () => {
    expect(isEffectiveDecline(party, [guest({ attending: {} }), guest({ firstName: "Cherif" })])).toBe(false);
  });

  it("ignores an event the party was not invited to", () => {
    expect(isEffectiveDecline(party, [guest({ attending: { brunch: true } })])).toBe(true);
  });
});

describe("seatsAccountedFor", () => {
  /** "3 of 4 seats" and "4 of 4" are different states; a partial reply must not look finished. */
  it("counts named guests and not the plus one, who has no seat of their own", () => {
    const guests = [guest(), guest({ firstName: "Cherif" }), guest({ firstName: "Sami", isPlusOne: true })];
    expect(seatsAccountedFor(guests)).toBe(2);
  });

  it("does not count blank cards", () => {
    expect(seatsAccountedFor([guest(), guest({ firstName: "", lastName: "" })])).toBe(1);
  });
});
