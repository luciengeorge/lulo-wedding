import { describe, expect, it } from "vitest";

import { buildImportKey, GuestCsvError, normaliseKeyPart, parseCsvRecords, parseGuestCsv } from "./guest-csv";

const BANNER = ",,,,,,,,,,,,,,,,,Lo,Lu,Zeina & Michel,Nayla & Paul,Mutual,Total";
const HEADER =
  "Name(s),Surname,Head Count,Email(s),Any +1,Total Head Count,<50?,Link,Where From,Who,Wave,StD Sent,RSVP,Engagement,Note,Visible?";

/** Builds a sheet with the real two-row preamble so tests exercise the row offset. */
function sheet(...dataRows: string[]): string {
  return [BANNER, HEADER, ...dataRows].join("\n");
}

/** A row with every column filled in, so each test can vary just the field it cares about. */
function row(overrides: Partial<Record<string, string>> = {}): string {
  const columns: Record<string, string> = {
    name: "Nayla & Paul",
    surname: "Sahyoun",
    headCount: "2",
    email: "",
    plusOne: "FALSE",
    totalHeadCount: "2",
    under50: "FALSE",
    link: "Family",
    whereFrom: "Childhood",
    who: "Lo",
    wave: "Tier 1",
    stdSent: "Yes",
    rsvp: "",
    engagement: "",
    note: "",
    visible: "0",
    ...overrides,
  };
  return [
    columns.name,
    columns.surname,
    columns.headCount,
    columns.email,
    columns.plusOne,
    columns.totalHeadCount,
    columns.under50,
    columns.link,
    columns.whereFrom,
    columns.who,
    columns.wave,
    columns.stdSent,
    columns.rsvp,
    columns.engagement,
    columns.note,
    columns.visible,
  ].join(",");
}

describe("parseCsvRecords", () => {
  it("keeps a comma that lives inside a quoted field", () => {
    expect(parseCsvRecords('a,"b,c",d')).toEqual([["a", "b,c", "d"]]);
  });

  it("unescapes a doubled quote inside a quoted field", () => {
    expect(parseCsvRecords('a,"she said ""hi""",b')).toEqual([["a", 'she said "hi"', "b"]]);
  });

  it("keeps a newline that lives inside a quoted field", () => {
    expect(parseCsvRecords('a,"line one\nline two"\nnext')).toEqual([["a", "line one\nline two"], ["next"]]);
  });

  it("handles CRLF terminators without leaving a stray carriage return", () => {
    expect(parseCsvRecords("a,b\r\nc,d")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("does not invent a trailing record for a file ending in a newline", () => {
    expect(parseCsvRecords("a,b\n")).toEqual([["a", "b"]]);
  });

  it("preserves empty fields", () => {
    expect(parseCsvRecords("a,,c")).toEqual([["a", "", "c"]]);
  });

  it("strips a leading byte order mark", () => {
    expect(parseCsvRecords("﻿a,b")).toEqual([["a", "b"]]);
  });
});

describe("normaliseKeyPart", () => {
  it("lowercases, trims and collapses whitespace", () => {
    expect(normaliseKeyPart("  Rae   &  Cherif ")).toBe("rae & cherif");
  });

  it("keeps accents and apostrophes so distinct families stay distinct", () => {
    expect(normaliseKeyPart("d'Hauteville")).toBe("d'hauteville");
    expect(normaliseKeyPart("Abou Jaoudé")).toBe("abou jaoudé");
    expect(normaliseKeyPart("Abou Jaoude")).not.toBe(normaliseKeyPart("Abou Jaoudé"));
  });

  it("folds the two unicode spellings of an accented name together", () => {
    // NFC "é" vs NFD "e" + combining acute — the same name typed two ways.
    expect(normaliseKeyPart("Aurélie")).toBe(normaliseKeyPart("Aurélie"));
  });
});

describe("buildImportKey", () => {
  it("is stable across casing and spacing differences", () => {
    expect(buildImportKey("Nayla & Paul", "Sahyoun")).toBe(buildImportKey("  nayla &  PAUL ", " sahyoun"));
  });

  it("stays unambiguous when the surname is empty", () => {
    expect(buildImportKey("Lucy", "")).toBe("lucy|");
    expect(buildImportKey("Lucy", "")).not.toBe(buildImportKey("", "Lucy"));
  });
});

describe("parseGuestCsv", () => {
  it("reads a Phone column added after the fixed ones, wherever it sits", () => {
    const text = [
      BANNER,
      `${HEADER},Extra,Phone(s)`,
      `${row()},x,+44 7700 900123`,
      `${row({ surname: "Other" })},x,`,
    ].join("\n");
    const { rows } = parseGuestCsv(text);
    expect(rows[0]?.contactPhone).toBe("+44 7700 900123");
    expect(rows[1]).not.toHaveProperty("contactPhone");
  });

  it("leaves the phone absent when the sheet has no Phone column", () => {
    expect(parseGuestCsv(sheet(row())).rows[0]).not.toHaveProperty("contactPhone");
  });

  it("skips the banner and header and reads from row 3", () => {
    const { rows, warnings } = parseGuestCsv(sheet(row()));
    expect(warnings).toEqual([]);
    expect(rows).toEqual([
      {
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
      },
    ]);
  });

  it("skips the trailing totals row, which has no name", () => {
    const totals = ",,,,,612,,,,,,,,,,";
    const { rows, warnings } = parseGuestCsv(sheet(row(), totals));
    expect(rows).toHaveLength(1);
    expect(warnings).toEqual([]);
  });

  it("accepts a party with no surname", () => {
    const { rows } = parseGuestCsv(sheet(row({ name: "Lucy", surname: "", headCount: "1", totalHeadCount: "1" })));
    expect(rows[0]?.surname).toBe("");
    expect(rows[0]?.importKey).toBe("lucy|");
  });

  it("derives a missing head count from the sheet's own total and warns", () => {
    const { rows, warnings } = parseGuestCsv(
      sheet(row({ name: "? & Wasim", surname: "Alexandroff", headCount: "", totalHeadCount: "2", plusOne: "FALSE" })),
    );
    expect(rows[0]?.headCount).toBe(2);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("? & Wasim");
    expect(warnings[0]).toContain("derived 2");
  });

  it("subtracts the plus-one when deriving a missing head count", () => {
    const { rows } = parseGuestCsv(sheet(row({ headCount: "", totalHeadCount: "3", plusOne: "TRUE" })));
    expect(rows[0]?.headCount).toBe(2);
  });

  it("refuses to invent a head count when the total is missing too", () => {
    expect(() => parseGuestCsv(sheet(row({ headCount: "", totalHeadCount: "" })))).toThrow(GuestCsvError);
  });

  it("treats a blank plus-one as false and warns", () => {
    const { rows, warnings } = parseGuestCsv(
      sheet(row({ name: "Alex", surname: "Mteini", plusOne: "", headCount: "1", totalHeadCount: "1" })),
    );
    expect(rows[0]?.plusOneAllowed).toBe(false);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('"Any +1" is blank');
  });

  it("warns when the sheet's own total no longer adds up", () => {
    const { rows, warnings } = parseGuestCsv(sheet(row({ headCount: "2", totalHeadCount: "5", plusOne: "FALSE" })));
    expect(rows[0]?.headCount).toBe(2);
    expect(warnings[0]).toContain("totals have drifted");
  });

  it("keeps a note containing a quoted comma intact", () => {
    const { rows } = parseGuestCsv(sheet(row({ note: `"Married on 26/06/27, so unlikely"` })));
    expect(rows[0]?.note).toBe("Married on 26/06/27, so unlikely");
  });

  it("maps every Who value the sheet uses", () => {
    const sheetValues = ["Lo", "Lu", "Mutual", "Zeina & Michel", "Nayla & Paul"];
    const { rows } = parseGuestCsv(sheet(...sheetValues.map((who, index) => row({ name: `Party ${index}`, who }))));
    expect(rows.map((party) => party.who)).toEqual(["laura", "lucien", "mutual", "zeina", "nayla"]);
  });

  it("maps both Link values", () => {
    const { rows } = parseGuestCsv(sheet(row({ name: "A", link: "Family" }), row({ name: "B", link: "Friends" })));
    expect(rows.map((party) => party.link)).toEqual(["family", "friends"]);
  });

  it("maps both Wave values", () => {
    const { rows } = parseGuestCsv(sheet(row({ name: "A", wave: "Tier 1" }), row({ name: "B", wave: "Tier 2" })));
    expect(rows.map((party) => party.wave)).toEqual(["tier1", "tier2"]);
  });

  it("maps StD Sent and an early RSVP of No", () => {
    const { rows } = parseGuestCsv(
      sheet(row({ name: "A", stdSent: "Yes", rsvp: "No" }), row({ name: "B", stdSent: "", rsvp: "" })),
    );
    expect(rows[0]).toMatchObject({ saveTheDateSent: true, earlyDecline: true });
    expect(rows[1]).toMatchObject({ saveTheDateSent: false, earlyDecline: false });
  });

  it("omits optional fields rather than storing empty strings", () => {
    const { rows } = parseGuestCsv(sheet(row({ whereFrom: "", note: "", email: "" })));
    expect(rows[0]).not.toHaveProperty("whereFrom");
    expect(rows[0]).not.toHaveProperty("note");
    expect(rows[0]).not.toHaveProperty("contactEmail");
  });

  it("ignores the Engagement and Visible? helper columns, including a spreadsheet error", () => {
    const { rows, warnings } = parseGuestCsv(sheet(row({ engagement: "Yes", visible: "#VALUE!" })));
    expect(rows).toHaveLength(1);
    expect(warnings).toEqual([]);
  });

  it("rejects an unknown enum value instead of guessing", () => {
    expect(() => parseGuestCsv(sheet(row({ who: "Grandma" })))).toThrow(/unknown Who "Grandma"/);
    expect(() => parseGuestCsv(sheet(row({ link: "Colleagues" })))).toThrow(/unknown Link "Colleagues"/);
    expect(() => parseGuestCsv(sheet(row({ wave: "Tier 3" })))).toThrow(/unknown Wave "Tier 3"/);
  });

  it("reports every bad row at once rather than failing on the first", () => {
    try {
      parseGuestCsv(sheet(row({ name: "A", who: "Grandma" }), row({ name: "B", wave: "Tier 3" })));
      expect.unreachable("expected a GuestCsvError");
    } catch (error) {
      expect(error).toBeInstanceOf(GuestCsvError);
      expect((error as GuestCsvError).problems).toHaveLength(2);
    }
  });

  it("refuses to merge two rows that share a name and surname", () => {
    expect(() => parseGuestCsv(sheet(row(), row({ name: "  nayla & PAUL  " })))).toThrow(/duplicates Row 3/);
  });

  it("allows the same name under different surnames", () => {
    const { rows } = parseGuestCsv(
      sheet(row({ name: "Michael", surname: "Sahyoun" }), row({ name: "Michael", surname: "Tabet" })),
    );
    expect(rows).toHaveLength(2);
  });

  it("names the spreadsheet row number in a problem, so it can be found in the sheet", () => {
    expect(() => parseGuestCsv(sheet(row(), row({ name: "B", surname: "", who: "Grandma" })))).toThrow(/Row 4 \("B"\)/);
  });

  it("rejects a sheet whose columns have moved", () => {
    const moved = [BANNER, "Surname,Name(s),Head Count", row()].join("\n");
    expect(() => parseGuestCsv(moved)).toThrow(/columns have moved/);
  });

  it("rejects a file with no data rows", () => {
    expect(() => parseGuestCsv([BANNER, HEADER].join("\n"))).toThrow(GuestCsvError);
  });
});
