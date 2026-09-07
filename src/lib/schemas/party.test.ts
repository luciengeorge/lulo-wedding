import { describe, expect, it } from "vitest";

import {
  EMPTY_PARTY_FORM,
  PartyContactEmailSchema,
  PartyFormSchema,
  type PartyFormValues,
  toPartyMutationFields,
} from "./party";

function form(overrides: Partial<PartyFormValues> = {}): PartyFormValues {
  return { ...EMPTY_PARTY_FORM, displayName: "Rae & Cherif", surname: "Haddad", ...overrides };
}

describe("PartyFormSchema", () => {
  it("accepts the default form once it has a name", () => {
    expect(PartyFormSchema.safeParse(form()).success).toBe(true);
  });

  it("trims the free-text fields", () => {
    const parsed = PartyFormSchema.parse(form({ displayName: "  Rae & Cherif  ", note: "  by the sea " }));
    expect(parsed.displayName).toBe("Rae & Cherif");
    expect(parsed.note).toBe("by the sea");
  });

  it("requires a name but not a surname", () => {
    expect(PartyFormSchema.safeParse(form({ displayName: "   " }).valueOf()).success).toBe(false);
    expect(PartyFormSchema.safeParse(form({ surname: "" })).success).toBe(true);
  });

  it("rejects a head count that is not a whole seat", () => {
    expect(PartyFormSchema.safeParse(form({ headCount: 0 })).success).toBe(false);
    expect(PartyFormSchema.safeParse(form({ headCount: 2.5 })).success).toBe(false);
    expect(PartyFormSchema.safeParse(form({ headCount: 31 })).success).toBe(false);
    // An emptied number input yields NaN, which must not slip through as a number.
    expect(PartyFormSchema.safeParse(form({ headCount: Number.NaN })).success).toBe(false);
  });

  it("rejects enum values that are not in the schema", () => {
    expect(PartyFormSchema.safeParse({ ...form(), who: "gatecrasher" }).success).toBe(false);
    expect(PartyFormSchema.safeParse({ ...form(), wave: "tier3" }).success).toBe(false);
    expect(PartyFormSchema.safeParse({ ...form(), link: "colleagues" }).success).toBe(false);
  });

  it("has no way to set token, importKey or earlyDecline", () => {
    const parsed = PartyFormSchema.parse({ ...form(), token: "hijacked", importKey: "x|y", earlyDecline: true });
    expect(parsed).not.toHaveProperty("token");
    expect(parsed).not.toHaveProperty("importKey");
    expect(parsed).not.toHaveProperty("earlyDecline");
  });
});

describe("PartyContactEmailSchema", () => {
  it("allows blank — most parties are reached over WhatsApp", () => {
    expect(PartyContactEmailSchema.safeParse("").success).toBe(true);
  });

  it("accepts one address and several separated by commas", () => {
    expect(PartyContactEmailSchema.safeParse("rae@example.com").success).toBe(true);
    expect(PartyContactEmailSchema.safeParse("rae@example.com, cherif@example.com").success).toBe(true);
  });

  it("rejects the list when any one address is broken", () => {
    expect(PartyContactEmailSchema.safeParse("rae@example.com, nope").success).toBe(false);
    expect(PartyContactEmailSchema.safeParse("not-an-email").success).toBe(false);
  });
});

describe("toPartyMutationFields", () => {
  it("drops the blank optional fields rather than storing empty strings", () => {
    const fields = toPartyMutationFields(PartyFormSchema.parse(form()));
    expect(fields).not.toHaveProperty("whereFrom");
    expect(fields).not.toHaveProperty("note");
    expect(fields).not.toHaveProperty("contactEmail");
  });

  it("keeps the optional fields that were filled in", () => {
    const fields = toPartyMutationFields(
      PartyFormSchema.parse(form({ whereFrom: "Childhood", note: "vegetarian", contactEmail: "rae@example.com" })),
    );
    expect(fields.whereFrom).toBe("Childhood");
    expect(fields.note).toBe("vegetarian");
    expect(fields.contactEmail).toBe("rae@example.com");
  });

  it("passes the required fields straight through", () => {
    const fields = toPartyMutationFields(PartyFormSchema.parse(form({ headCount: 4, plusOneAllowed: true })));
    expect(fields.displayName).toBe("Rae & Cherif");
    expect(fields.headCount).toBe(4);
    expect(fields.plusOneAllowed).toBe(true);
    expect(fields.invitedToWedding).toBe(true);
  });
});
