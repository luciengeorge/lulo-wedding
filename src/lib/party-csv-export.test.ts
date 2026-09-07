import { describe, expect, it } from "vitest";

import type { ExportableParty } from "./party-csv-export";

import { csvFilename, partiesToCsv } from "./party-csv-export";

const party: ExportableParty = {
  displayName: "Rae & Cherif",
  surname: "Haddad",
  headCount: 4,
  plusOneAllowed: true,
  link: "family",
  whereFrom: "Childhood",
  who: "laura",
  wave: "tier1",
  token: "AbC123",
  invitedToPreWedding: false,
  invitedToWedding: true,
  invitedToBrunch: false,
  saveTheDateSent: true,
  contactEmail: "rae@example.com",
  rsvp: { state: "attending", attending: 3, guestCount: 4 },
};

function rows(csv: string): string[] {
  return csv.trimEnd().split("\r\n");
}

describe("partiesToCsv", () => {
  it("writes a header even when there is nothing to export", () => {
    const lines = rows(partiesToCsv([], "https://lauralucien.com"));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("Name(s)");
  });

  it("spells out each party's magic link", () => {
    expect(partiesToCsv([party], "https://lauralucien.com")).toContain("https://lauralucien.com/rsvp/AbC123");
  });

  it("does not double the slash when the site URL has a trailing one", () => {
    expect(partiesToCsv([party], "https://lauralucien.com/")).toContain("https://lauralucien.com/rsvp/AbC123");
  });

  it("quotes a field containing a comma and doubles an embedded quote", () => {
    const csv = partiesToCsv([{ ...party, note: 'Bring the "good" wine, please' }], "https://x.test");
    expect(csv).toContain('"Bring the ""good"" wine, please"');
  });

  it("leaves a blank optional field empty rather than writing undefined", () => {
    const csv = partiesToCsv([{ ...party, whereFrom: undefined, contactEmail: undefined }], "https://x.test");
    expect(csv).not.toContain("undefined");
  });

  it("renders the enums and flags as words, not codes", () => {
    const line = rows(partiesToCsv([party], "https://x.test"))[1] ?? "";
    expect(line).toContain("Laura");
    expect(line).toContain("Tier 1");
    expect(line).toContain("Family");
    expect(line).toContain("Attending");
  });

  it("ends with a newline so the last row is not read as a fragment", () => {
    expect(partiesToCsv([party], "https://x.test").endsWith("\r\n")).toBe(true);
  });
});

describe("csvFilename", () => {
  it("dates the file", () => {
    expect(csvFilename(new Date("2026-09-07T12:00:00Z"))).toBe("guest-list-2026-09-07.csv");
  });
});
