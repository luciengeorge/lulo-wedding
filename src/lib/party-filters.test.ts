import { describe, expect, it } from "vitest";

import type { FilterableParty, RsvpGuest, RsvpParty } from "./party-filters";

import { deriveRsvp, foldForSearch, matchesInvitedTo, partySearchText } from "./party-filters";

const party: FilterableParty = {
  displayName: "Rae & Cherif",
  surname: "Abou Jaoudé",
  invitedToPreWedding: false,
  invitedToWedding: true,
  invitedToBrunch: false,
};

describe("foldForSearch", () => {
  it("strips accents so a plain-ASCII search still finds the family", () => {
    expect(foldForSearch("Abou Jaoudé")).toBe("abou jaoude");
  });

  it("collapses whitespace and case", () => {
    expect(foldForSearch("  Rae   &  CHERIF ")).toBe("rae & cherif");
  });
});

describe("partySearchText", () => {
  it("joins the name and surname so either word hits", () => {
    const haystack = partySearchText(party);
    expect(haystack).toContain("cherif");
    expect(haystack).toContain("jaoude");
  });

  it("is a substring haystack, not a fuzzy one", () => {
    expect(partySearchText(party).includes("rae & cherif")).toBe(true);
    expect(partySearchText(party).includes("jaoude rae")).toBe(false);
  });
});

describe("matchesInvitedTo", () => {
  it("passes everything for the no-filter sentinel", () => {
    expect(matchesInvitedTo(party, "all")).toBe(true);
  });

  it("narrows on a single event", () => {
    expect(matchesInvitedTo(party, "wedding")).toBe(true);
    expect(matchesInvitedTo(party, "preWedding")).toBe(false);
    expect(matchesInvitedTo(party, "brunch")).toBe(false);
  });

  it("finds the parties invited to nothing yet", () => {
    expect(matchesInvitedTo(party, "none")).toBe(false);
    expect(matchesInvitedTo({ ...party, invitedToWedding: false }, "none")).toBe(true);
  });
});

const invited: RsvpParty = {
  earlyDecline: false,
  invitedToPreWedding: false,
  invitedToWedding: true,
  invitedToBrunch: false,
};

function guest(overrides: Partial<RsvpGuest> = {}): RsvpGuest {
  return { preWedding: "pending", wedding: "pending", brunch: "pending", ...overrides };
}

describe("deriveRsvp", () => {
  it("is awaiting a reply when the party is invited and nobody has answered", () => {
    expect(deriveRsvp(invited, [])).toEqual({ state: "awaiting", attending: 0, guestCount: 0 });
  });

  it("is not yet invited when no event flag is set", () => {
    expect(deriveRsvp({ ...invited, invitedToWedding: false }, []).state).toBe("notInvited");
  });

  it("counts only guests who said yes to an event the party is invited to", () => {
    const guests = [guest({ wedding: "yes" }), guest({ brunch: "yes" }), guest({ wedding: "no" })];
    expect(deriveRsvp(invited, guests)).toEqual({ state: "attending", attending: 1, guestCount: 3 });
  });

  it("counts the brunch once the party is actually invited to it", () => {
    expect(deriveRsvp({ ...invited, invitedToBrunch: true }, [guest({ brunch: "yes" })]).attending).toBe(1);
  });

  it("declines when guest rows exist but nobody is coming", () => {
    expect(deriveRsvp(invited, [guest({ wedding: "no" })]).state).toBe("declined");
  });

  it("lets an early decline from the sheet win, with no guest rows to carry it", () => {
    expect(deriveRsvp({ ...invited, earlyDecline: true }, []).state).toBe("declined");
  });
});
