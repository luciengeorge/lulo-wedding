import type { RsvpState } from "./party-filters";

import { RSVP_LABEL } from "./party-filters";
import { LINK_LABEL, WAVE_LABEL, WHO_LONG_LABEL } from "./party-labels";

/**
 * CSV export of the admin table's current filtered set.
 *
 * Deliberately *not* the importer's format. The import sheet is the couple's
 * own document with a totals banner and columns the app does not store; this
 * export is for using the list elsewhere — a WhatsApp mail merge needs the
 * magic link spelled out, which the sheet has never held.
 */

export type ExportableParty = {
  displayName: string;
  surname: string;
  headCount: number;
  plusOneAllowed: boolean;
  link: keyof typeof LINK_LABEL;
  whereFrom?: string;
  who: keyof typeof WHO_LONG_LABEL;
  wave: keyof typeof WAVE_LABEL;
  token: string;
  invitedToPreWedding: boolean;
  invitedToWedding: boolean;
  invitedToBrunch: boolean;
  saveTheDateSent: boolean;
  note?: string;
  contactEmail?: string;
  contactPhone?: string;
  rsvp: { state: RsvpState; attending: number; guestCount: number };
};

const COLUMNS = [
  "Name(s)",
  "Surname",
  "Head Count",
  "Any +1",
  "Link",
  "Where From",
  "Who",
  "Wave",
  "Pre-wedding",
  "Wedding",
  "Brunch",
  "StD Sent",
  "RSVP",
  "Attending",
  "Magic link",
  "Email(s)",
  "Phone(s)",
  "Note",
] as const;

/** Quotes only when it has to; a quoted field escapes `"` by doubling it. */
function escapeCsvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function yesNo(value: boolean): string {
  return value ? "Yes" : "No";
}

/**
 * Renders the rows as CSV. `siteUrl` builds each party's magic link; it is
 * passed in rather than read from the environment so this stays pure.
 */
export function partiesToCsv(rows: readonly ExportableParty[], siteUrl: string): string {
  const base = siteUrl.replace(/\/+$/, "");

  const lines = [COLUMNS.join(",")];

  for (const party of rows) {
    lines.push(
      [
        party.displayName,
        party.surname,
        String(party.headCount),
        yesNo(party.plusOneAllowed),
        LINK_LABEL[party.link],
        party.whereFrom ?? "",
        WHO_LONG_LABEL[party.who],
        WAVE_LABEL[party.wave],
        yesNo(party.invitedToPreWedding),
        yesNo(party.invitedToWedding),
        yesNo(party.invitedToBrunch),
        yesNo(party.saveTheDateSent),
        RSVP_LABEL[party.rsvp.state],
        String(party.rsvp.attending),
        `${base}/rsvp/${party.token}`,
        party.contactEmail ?? "",
        party.contactPhone ?? "",
        party.note ?? "",
      ]
        .map(escapeCsvField)
        .join(","),
    );
  }

  // Excel and Numbers both need the trailing newline to stop treating the last
  // row as a fragment.
  return `${lines.join("\r\n")}\r\n`;
}

/** e.g. `guest-list-2026-09-07.csv` */
export function csvFilename(now: Date): string {
  return `guest-list-${now.toISOString().slice(0, 10)}.csv`;
}
