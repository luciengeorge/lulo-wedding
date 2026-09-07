/**
 * Parser for the couple's exported guest-list sheet.
 *
 * The invite unit is a party, not a person: one row is one invitation, and
 * `Head Count` is how many named seats it carries. Per-person names mostly do not
 * exist in the sheet ("Rae & Cherif et famille", head count 4), so this parser
 * produces parties only — guests are created later, when a party RSVPs.
 *
 * Deliberately free of Convex imports so the admin UI can reuse it in the browser.
 */

export type PartyLink = "family" | "friends";
export type PartyWho = "lucien" | "laura" | "mutual" | "zeina" | "nayla";
export type PartyWave = "tier1" | "tier2";

export type ParsedParty = {
  importKey: string;
  displayName: string;
  surname: string;
  headCount: number;
  plusOneAllowed: boolean;
  link: PartyLink;
  whereFrom?: string;
  who: PartyWho;
  wave: PartyWave;
  under50?: boolean;
  saveTheDateSent: boolean;
  earlyDecline: boolean;
  note?: string;
  contactEmail?: string;
};

export type ParseGuestCsvResult = { rows: ParsedParty[]; warnings: string[] };

/**
 * Thrown when the sheet contains something we refuse to guess at — an unknown enum
 * value, a duplicate party, a head count we cannot recover. Every problem in the
 * file is collected before throwing so the couple can fix them in one pass instead
 * of rerunning the importer once per bad row.
 */
export class GuestCsvError extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(`Guest CSV has ${problems.length} unresolved problem(s):\n  - ${problems.join("\n  - ")}`);
    this.name = "GuestCsvError";
    this.problems = problems;
  }
}

/**
 * Row 1 of the export is a spreadsheet totals banner, row 2 is this header, and the
 * data starts at row 3. Columns 16+ are an empty pivot overflow and are ignored.
 * The header is asserted on every import: if the couple reorders a column, silently
 * reading the wrong field would mislabel 400 invitations.
 */
const EXPECTED_HEADERS = [
  "Name(s)",
  "Surname",
  "Head Count",
  "Email(s)",
  "Any +1",
  "Total Head Count",
  "<50?",
  "Link",
  "Where From",
  "Who",
  "Wave",
  "StD Sent",
  "RSVP",
  "Engagement",
  "Note",
  "Visible?",
] as const;

const HEADER_ROW_INDEX = 1;
const FIRST_DATA_ROW_INDEX = 2;

const COL = {
  name: 0,
  surname: 1,
  headCount: 2,
  email: 3,
  plusOne: 4,
  totalHeadCount: 5,
  under50: 6,
  link: 7,
  whereFrom: 8,
  who: 9,
  wave: 10,
  stdSent: 11,
  rsvp: 12,
  note: 14,
} as const;

const LINK_BY_SHEET_VALUE: Record<string, PartyLink | undefined> = {
  Family: "family",
  Friends: "friends",
};

const WHO_BY_SHEET_VALUE: Record<string, PartyWho | undefined> = {
  Lo: "laura",
  Lu: "lucien",
  Mutual: "mutual",
  "Zeina & Michel": "zeina",
  "Nayla & Paul": "nayla",
};

const WAVE_BY_SHEET_VALUE: Record<string, PartyWave | undefined> = {
  "Tier 1": "tier1",
  "Tier 2": "tier2",
};

/**
 * Splits CSV text into records. A hand-rolled state machine rather than a split on
 * commas: at least one `Note` in the sheet contains a comma inside quotes, and
 * quoted fields may also hold escaped quotes (`""`) and newlines.
 */
export function parseCsvRecords(text: string): string[][] {
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (quoted) {
      if (char !== '"') {
        field += char;
        continue;
      }
      if (input[i + 1] === '"') {
        field += '"';
        i++;
        continue;
      }
      quoted = false;
      continue;
    }

    if (char === '"') {
      quoted = true;
      continue;
    }

    if (char === ",") {
      record.push(field);
      field = "";
      continue;
    }

    if (char === "\r" || char === "\n") {
      // Treat CRLF as a single terminator.
      if (char === "\r" && input[i + 1] === "\n") i++;
      record.push(field);
      records.push(record);
      record = [];
      field = "";
      continue;
    }

    field += char;
  }

  // A file not ending in a newline still has one last record to flush; a file that
  // does end in one must not gain a phantom empty record.
  if (field !== "" || record.length > 0) {
    record.push(field);
    records.push(record);
  }

  return records;
}

/**
 * Folds a name for use in the import key: NFKC, collapsed whitespace, lowercased.
 * Accents and apostrophes are preserved ("d'Hauteville", "Abou Jaoudé") — folding
 * them away would risk colliding two genuinely different families.
 */
export function normaliseKeyPart(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}

/** The sheet's natural key. Surname may be empty; the separator keeps that unambiguous. */
export function buildImportKey(displayName: string, surname: string): string {
  return `${normaliseKeyPart(displayName)}|${normaliseKeyPart(surname)}`;
}

function cell(record: readonly string[], index: number): string {
  return (record[index] ?? "").trim();
}

/** `TRUE`/`FALSE` as the sheet writes them; blank is "not filled in", not `false`. */
function parseSheetBoolean(raw: string): boolean | undefined | "invalid" {
  if (raw === "") return undefined;
  if (raw === "TRUE") return true;
  if (raw === "FALSE") return false;
  return "invalid";
}

function parseSeatCount(raw: string): number | undefined {
  if (!/^\d+$/.test(raw)) return undefined;
  const value = Number(raw);
  return value >= 1 ? value : undefined;
}

export function parseGuestCsv(text: string): ParseGuestCsvResult {
  const records = parseCsvRecords(text);

  if (records.length <= FIRST_DATA_ROW_INDEX) {
    throw new GuestCsvError(["The file has no data rows (expected a banner on row 1 and a header on row 2)."]);
  }

  const header = records[HEADER_ROW_INDEX] ?? [];
  const headerMismatch = EXPECTED_HEADERS.map((expected, index) => {
    const actual = cell(header, index);
    return expected === actual
      ? null
      : `column ${index}: expected ${JSON.stringify(expected)}, found ${JSON.stringify(actual)}`;
  }).filter((problem) => problem !== null);

  if (headerMismatch.length > 0) {
    throw new GuestCsvError([
      `Row 2 is not the expected header — the sheet's columns have moved. ${headerMismatch.join("; ")}`,
    ]);
  }

  const rows: ParsedParty[] = [];
  const warnings: string[] = [];
  const problems: string[] = [];
  const seenKeys = new Map<string, string>();

  for (let index = FIRST_DATA_ROW_INDEX; index < records.length; index++) {
    const record = records[index] ?? [];
    const rowNumber = index + 1;

    const displayName = cell(record, COL.name);
    // The export's final row is a totals row with no name. Any nameless row is a
    // spreadsheet artefact, not a party.
    if (displayName === "") continue;

    const surname = cell(record, COL.surname);
    const label = `Row ${rowNumber} (${JSON.stringify(surname === "" ? displayName : `${displayName} ${surname}`)})`;
    const rowProblems: string[] = [];

    const link = LINK_BY_SHEET_VALUE[cell(record, COL.link)];
    if (!link) rowProblems.push(`unknown Link ${JSON.stringify(cell(record, COL.link))}`);

    const who = WHO_BY_SHEET_VALUE[cell(record, COL.who)];
    if (!who) rowProblems.push(`unknown Who ${JSON.stringify(cell(record, COL.who))}`);

    const wave = WAVE_BY_SHEET_VALUE[cell(record, COL.wave)];
    if (!wave) rowProblems.push(`unknown Wave ${JSON.stringify(cell(record, COL.wave))}`);

    const plusOneRaw = parseSheetBoolean(cell(record, COL.plusOne));
    if (plusOneRaw === "invalid") {
      rowProblems.push(`unknown "Any +1" value ${JSON.stringify(cell(record, COL.plusOne))}`);
    } else if (plusOneRaw === undefined) {
      warnings.push(`${label}: "Any +1" is blank — treated as no plus-one.`);
    }
    const plusOneAllowed = plusOneRaw === true;

    const under50Raw = parseSheetBoolean(cell(record, COL.under50));
    if (under50Raw === "invalid") {
      rowProblems.push(`unknown "<50?" value ${JSON.stringify(cell(record, COL.under50))}`);
    }

    const totalHeadCount = parseSeatCount(cell(record, COL.totalHeadCount));
    let headCount = parseSeatCount(cell(record, COL.headCount));

    if (headCount === undefined) {
      // Falling back to the sheet's own total keeps the seat count honest. The
      // identity below holds on every row of the current export, so subtracting the
      // plus-one recovers the named seats exactly rather than guessing at 0 or 1.
      const derived = totalHeadCount === undefined ? undefined : totalHeadCount - (plusOneAllowed ? 1 : 0);
      if (derived === undefined || derived < 1) {
        rowProblems.push(
          `"Head Count" is ${JSON.stringify(cell(record, COL.headCount))} and cannot be recovered from ` +
            `"Total Head Count" ${JSON.stringify(cell(record, COL.totalHeadCount))} — fix the sheet`,
        );
      } else {
        headCount = derived;
        warnings.push(
          `${label}: "Head Count" is blank — derived ${derived} from "Total Head Count" ` +
            `${totalHeadCount} minus the plus-one. Confirm this with the couple.`,
        );
      }
    } else if (totalHeadCount !== undefined && totalHeadCount !== headCount + (plusOneAllowed ? 1 : 0)) {
      // Not fatal, but it means the sheet's own arithmetic has drifted and the
      // derivation above can no longer be trusted for other rows.
      warnings.push(
        `${label}: "Total Head Count" ${totalHeadCount} does not equal "Head Count" ${headCount} plus the ` +
          `plus-one — the sheet's totals have drifted.`,
      );
    }

    const importKey = buildImportKey(displayName, surname);
    const clash = seenKeys.get(importKey);
    if (clash !== undefined) {
      rowProblems.push(
        `duplicates ${clash} — (Name(s), Surname) must be unique, and merging two families would lose one of them`,
      );
    }

    if (
      rowProblems.length > 0 ||
      link === undefined ||
      who === undefined ||
      wave === undefined ||
      headCount === undefined ||
      under50Raw === "invalid"
    ) {
      problems.push(`${label}: ${rowProblems.join("; ")}`);
      continue;
    }

    seenKeys.set(importKey, label);

    const whereFrom = cell(record, COL.whereFrom);
    const note = cell(record, COL.note);
    const contactEmail = cell(record, COL.email);

    rows.push({
      importKey,
      displayName,
      surname,
      headCount,
      plusOneAllowed,
      link,
      ...(whereFrom === "" ? {} : { whereFrom }),
      who,
      wave,
      ...(under50Raw === undefined ? {} : { under50: under50Raw }),
      saveTheDateSent: cell(record, COL.stdSent) === "Yes",
      earlyDecline: cell(record, COL.rsvp) === "No",
      ...(note === "" ? {} : { note }),
      ...(contactEmail === "" ? {} : { contactEmail }),
    });
  }

  if (problems.length > 0) throw new GuestCsvError(problems);

  return { rows, warnings };
}
