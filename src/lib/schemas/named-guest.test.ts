import { describe, expect, it } from "vitest";

import { NamedGuestSchema, ownInvite } from "./named-guest";

const party = { preWedding: false, wedding: true, brunch: false };

describe("NamedGuestSchema", () => {
  it("needs a first name and at least one event", () => {
    expect(NamedGuestSchema.safeParse({ firstName: " ", lastName: "", ...party }).success).toBe(false);
    expect(
      NamedGuestSchema.safeParse({ firstName: "Rae", lastName: "", preWedding: false, wedding: false, brunch: false })
        .success,
    ).toBe(false);
    expect(NamedGuestSchema.parse({ firstName: " Rae ", lastName: " Haddad ", ...party })).toMatchObject({
      firstName: "Rae",
      lastName: "Haddad",
    });
  });
});

describe("ownInvite", () => {
  it("stores nothing of their own when the toggles match the party", () => {
    expect(ownInvite({ ...party }, party)).toBeNull();
  });

  it("pins the toggles to the person when they differ", () => {
    expect(ownInvite({ ...party, brunch: true }, party)).toEqual({ preWedding: false, wedding: true, brunch: true });
  });
});
