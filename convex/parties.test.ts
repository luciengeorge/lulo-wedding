import { describe, expect, it } from "vitest";

import { diffSheetFields, type PartyCsvFields, generateToken } from "./parties";

/**
 * These cover the two pure pieces of the import that a bug would make expensive: a
 * weak or colliding magic-link token, and a diff that either misses a change or
 * reports one every run. The mutation itself needs a Convex runtime and is exercised
 * by running the importer against a deployment.
 */

const party: PartyCsvFields = {
  importKey: "nayla & paul|sahyoun",
  displayName: "Nayla & Paul",
  surname: "Sahyoun",
  headCount: 2,
  plusOneAllowed: false,
  link: "family",
  whereFrom: "Childhood",
  who: "laura",
  wave: "tier1",
  under50: false,
  saveTheDateSent: true,
  earlyDecline: false,
};

describe("generateToken", () => {
  it("is URL-safe and long enough to be unguessable", () => {
    const token = generateToken();
    expect(token).toHaveLength(22);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("does not repeat itself", () => {
    const tokens = new Set(Array.from({ length: 1000 }, generateToken));
    expect(tokens.size).toBe(1000);
  });

  it("uses the whole alphabet rather than a narrow slice of it", () => {
    const symbols = new Set(Array.from({ length: 500 }, generateToken).join(""));
    expect(symbols.size).toBe(64);
  });
});

describe("diffSheetFields", () => {
  it("reports no change when the sheet matches the stored party", () => {
    expect(diffSheetFields(party, { ...party })).toBeNull();
  });

  it("patches only the fields that actually changed", () => {
    expect(diffSheetFields(party, { ...party, headCount: 4, wave: "tier2" })).toEqual({
      headCount: 4,
      wave: "tier2",
    });
  });

  it("removes an optional field that has gone blank in the sheet", () => {
    const patch = diffSheetFields(party, { ...party, whereFrom: undefined });
    expect(patch).toEqual({ whereFrom: undefined });
    expect(patch).toHaveProperty("whereFrom");
  });

  it("treats two absent optional fields as unchanged", () => {
    const withoutNote: PartyCsvFields = { ...party };
    expect(diffSheetFields(withoutNote, { ...withoutNote })).toBeNull();
  });

  it("adds an optional field that has appeared in the sheet", () => {
    expect(diffSheetFields(party, { ...party, note: "Very unlikely to attend" })).toEqual({
      note: "Very unlikely to attend",
    });
  });

  it("ignores fields the app owns, so a re-import cannot reset them", () => {
    const stored = { ...party, token: "kept", invitedToWedding: true, invitedToBrunch: true };
    expect(diffSheetFields(stored, { ...party })).toBeNull();
  });
});
