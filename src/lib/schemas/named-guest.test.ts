import { describe, expect, it } from "vitest";

import { NamedGuestSchema, ownInvite } from "./named-guest";

const party = { preWedding: false, wedding: true, brunch: false };

describe("NamedGuestSchema", () => {
  it("needs a first name and at least one event", () => {
    expect(NamedGuestSchema.safeParse({ firstName: " ", lastName: "", phone: "", ...party }).success).toBe(false);
    expect(
      NamedGuestSchema.safeParse({
        firstName: "Rae",
        lastName: "",
        phone: "",
        preWedding: false,
        wedding: false,
        brunch: false,
      }).success,
    ).toBe(false);
    expect(NamedGuestSchema.parse({ firstName: " Rae ", lastName: " Haddad ", phone: "", ...party })).toMatchObject({
      firstName: "Rae",
      lastName: "Haddad",
    });
  });

  it("takes any phone, trimmed, up to a sane length", () => {
    expect(NamedGuestSchema.parse({ firstName: "Rae", lastName: "", phone: " +961 3 123 456 ", ...party }).phone).toBe(
      "+961 3 123 456",
    );
    expect(
      NamedGuestSchema.safeParse({ firstName: "Rae", lastName: "", phone: "1".repeat(101), ...party }).success,
    ).toBe(false);
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
