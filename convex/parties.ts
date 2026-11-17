import { type Infer, v } from "convex/values";

import type { Doc } from "./_generated/dataModel";

import { buildImportKey } from "../src/lib/guest-csv";
import { internalMutation, type MutationCtx, mutation } from "./_generated/server";
import { requireAdmin } from "./lib/adminAuth";

/**
 * The party fields the couple's sheet owns. Everything else on a party row — the
 * magic-link token and the three invite flags — is owned by the app and must survive
 * a re-import untouched.
 */
const partyCsvFields = v.object({
  importKey: v.string(),
  displayName: v.string(),
  surname: v.string(),
  headCount: v.number(),
  plusOneAllowed: v.boolean(),
  link: v.union(v.literal("family"), v.literal("friends")),
  whereFrom: v.optional(v.string()),
  who: v.union(v.literal("lucien"), v.literal("laura"), v.literal("mutual"), v.literal("zeina"), v.literal("nayla")),
  wave: v.union(v.literal("tier1"), v.literal("tier2")),
  under50: v.optional(v.boolean()),
  saveTheDateSent: v.boolean(),
  earlyDecline: v.boolean(),
  note: v.optional(v.string()),
  contactEmail: v.optional(v.string()),
  contactPhone: v.optional(v.string()),
});

const guestName = v.object({ firstName: v.string(), lastName: v.string() });

/** A sheet row: the party's own fields, plus who sits in its seats when the sheet says. */
const partyCsvRow = v.object({
  ...partyCsvFields.fields,
  guests: v.optional(v.array(guestName)),
  plusOne: v.optional(guestName),
});

type PartyCsvRow = Infer<typeof partyCsvRow>;

export type PartyCsvFields = Infer<typeof partyCsvFields>;

/**
 * Fields refreshed from the sheet on every import. `importKey` is the match key and
 * so is identical by construction; the token and invite flags are absent on purpose.
 */
const SHEET_OWNED_FIELDS = [
  "displayName",
  "surname",
  "headCount",
  "plusOneAllowed",
  "link",
  "whereFrom",
  "who",
  "wave",
  "under50",
  "saveTheDateSent",
  "earlyDecline",
  "note",
  "contactEmail",
  "contactPhone",
] as const satisfies readonly (keyof PartyCsvFields)[];

const TOKEN_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** 22 characters drawn from a 64-symbol alphabet — 132 bits, well past guessable. */
const TOKEN_LENGTH = 22;

/**
 * Mints a magic-link token.
 *
 * Convex functions run on V8, not Node, so `node:crypto` is unavailable — but the web
 * `crypto.getRandomValues` is. Masking each random byte to its low 6 bits stays
 * uniform (256 is a clean multiple of 64), so no rejection sampling is needed, and
 * every symbol in the alphabet is URL-safe unescaped.
 */
export function generateToken(): string {
  const bytes = new Uint8Array(TOKEN_LENGTH);
  crypto.getRandomValues(bytes);

  let token = "";
  for (const byte of bytes) {
    token += TOKEN_ALPHABET[byte & 63];
  }
  return token;
}

/**
 * Returns the fields that need patching, or `null` when the stored party already
 * matches the sheet. A field that has gone blank patches to `undefined`, which is how
 * Convex removes an optional field — leaving a stale value behind would be worse.
 */
export function diffSheetFields(existing: PartyCsvFields, desired: PartyCsvFields): Partial<PartyCsvFields> | null {
  const patch: Record<string, unknown> = {};
  let changed = false;

  for (const field of SHEET_OWNED_FIELDS) {
    if (existing[field] === desired[field]) continue;
    patch[field] = desired[field];
    changed = true;
  }

  return changed ? (patch as Partial<PartyCsvFields>) : null;
}

/**
 * Names a party's seats from the sheet, the same way naming someone in /admin
 * does: the RSVP form then shows each person instead of empty name fields.
 *
 * Only ever fills empty seats. A party that has replied, or that already has
 * someone named, is left alone: those names came from the guests or the couple
 * and are newer than the sheet. Returns how many guests were (or, in a dry run,
 * would be) created, and why a party was skipped when the sheet and the stored
 * party disagree.
 */
async function nameSeats(
  ctx: MutationCtx,
  party: { _id?: Doc<"parties">["_id"]; displayName: string; headCount: number; plusOneAllowed: boolean; respondedAt?: number },
  row: PartyCsvRow,
  dryRun: boolean,
): Promise<{ named: number; mismatch?: string }> {
  if (!row.guests && !row.plusOne) return { named: 0 };
  if (party.respondedAt !== undefined) return { named: 0 };

  const existing = party._id
    ? await ctx.db
        .query("guests")
        .withIndex("by_party", (q) => q.eq("partyId", party._id!))
        .collect()
    : [];

  const toName: (Infer<typeof guestName> & { isPlusOne: boolean })[] = [];
  let mismatch: string | undefined;

  if (row.guests && !existing.some((guest) => !guest.isPlusOne)) {
    // An admin edit to the head count wins over the sheet, so the sheet's names may no longer fit.
    if (row.guests.length === party.headCount) toName.push(...row.guests.map((g) => ({ ...g, isPlusOne: false })));
    else mismatch = `${party.displayName} (sheet names ${row.guests.length}, head count is ${party.headCount})`;
  }
  if (row.plusOne && party.plusOneAllowed && !existing.some((guest) => guest.isPlusOne)) {
    toName.push({ ...row.plusOne, isPlusOne: true });
  }

  if (!dryRun && party._id) {
    for (const guest of toName) {
      await ctx.db.insert("guests", {
        partyId: party._id,
        firstName: guest.firstName,
        lastName: guest.lastName,
        isPlusOne: guest.isPlusOne,
        preWedding: "pending",
        wedding: "pending",
        brunch: "pending",
        addedByCouple: true,
      });
    }
  }

  return { named: toName.length, mismatch };
}

/**
 * Upserts the parsed sheet into the `parties` table.
 *
 * Idempotent by design: matching is on `importKey`, existing parties keep their token
 * and their invite flags, and nothing is ever deleted. Parties that have vanished from
 * the sheet are reported rather than removed — they are usually renames, and dropping
 * one would take a family's RSVP with it.
 *
 * Admin-only. A public mutation here would let anyone who knows the deployment URL
 * rewrite the entire guest list, and the /admin UI calls it straight from the browser.
 *
 * Seats are named from the sheet's names too (see `nameSeats`), so a re-import
 * after filling in `Guests` names everyone who has not replied yet.
 *
 * `dryRun` produces the identical report without touching the table, so the admin
 * UI can show the couple exactly what an import would do before they commit to it.
 * Running the real logic beats reimplementing a preview that could disagree with it.
 */
export const importParties = mutation({
  args: { rows: v.array(partyCsvRow), dryRun: v.optional(v.boolean()) },
  returns: v.object({
    created: v.number(),
    updated: v.number(),
    unchanged: v.number(),
    guestsNamed: v.number(),
    missingFromCsv: v.array(v.object({ importKey: v.string(), displayName: v.string() })),
    warnings: v.array(v.string()),
  }),
  handler: async (ctx, { rows, dryRun = false }) => {
    await requireAdmin(ctx);

    const warnings: string[] = [];

    const incomingKeys = new Set<string>();
    for (const row of rows) {
      if (incomingKeys.has(row.importKey)) {
        // The parser catches this first; reaching it here means a caller bypassed it.
        throw new Error(
          `Refusing to import: two rows share the import key ${JSON.stringify(row.importKey)}. ` +
            `Merging them would silently lose a party.`,
        );
      }
      incomingKeys.add(row.importKey);
    }

    // A full scan is deliberate: the report has to name parties that are absent from
    // the CSV, which no index can answer, and the table is one wedding's guest list
    // (~400 rows), not a growing collection.
    const existingParties = await ctx.db.query("parties").collect();
    const byImportKey = new Map(existingParties.map((party) => [party.importKey, party]));
    const usedTokens = new Set(existingParties.map((party) => party.token));

    let created = 0;
    let updated = 0;
    let unchanged = 0;
    let guestsNamed = 0;
    const seatMismatches: string[] = [];
    const skippedAdminEdited: { importKey: string; displayName: string }[] = [];

    for (const row of rows) {
      const existing = byImportKey.get(row.importKey);
      const { guests: _guests, plusOne: _plusOne, ...fields } = row;
      let seated: Parameters<typeof nameSeats>[1];

      if (!existing) {
        let token = generateToken();
        while (usedTokens.has(token)) token = generateToken();
        usedTokens.add(token);

        const partyId = dryRun
          ? undefined
          : await ctx.db.insert("parties", {
              ...fields,
              token,
              // Set once, on insert. The couple owns these from the admin UI afterwards.
              invitedToPreWedding: false,
              invitedToWedding: true,
              invitedToBrunch: false,
            });
        created++;
        seated = { ...fields, _id: partyId };
      } else {
        const patch = diffSheetFields(existing, fields);
        if (!patch) {
          unchanged++;
          seated = existing;
        } else if (existing.editedInAdminAt !== undefined) {
          // Admin edits win. A correction typed in /admin is deliberate and current;
          // the sheet is the stale copy. Skipping loudly rather than silently, so a
          // real divergence between the two is visible instead of being discovered
          // months later when a name is wrong on a place card.
          skippedAdminEdited.push({ importKey: existing.importKey, displayName: existing.displayName });
          seated = existing;
        } else {
          if (!dryRun) await ctx.db.patch(existing._id, patch);
          updated++;
          seated = { ...existing, ...patch };
        }
      }

      const { named, mismatch } = await nameSeats(ctx, seated, row, dryRun);
      guestsNamed += named;
      if (mismatch) seatMismatches.push(mismatch);
    }

    if (seatMismatches.length > 0) {
      warnings.push(
        `${seatMismatches.length} party/parties were not named because the sheet and /admin disagree on the head ` +
          `count: ${seatMismatches.join(", ")}. Name them in /admin.`,
      );
    }

    if (skippedAdminEdited.length > 0) {
      warnings.push(
        `${skippedAdminEdited.length} party/parties differ from the sheet but were edited in /admin, so the ` +
          `sheet was ignored for them: ${skippedAdminEdited.map((p) => p.displayName).join(", ")}. ` +
          `Update the sheet to match, or the two will keep drifting apart.`,
      );
    }

    const missingFromCsv = existingParties
      .filter((party) => !incomingKeys.has(party.importKey))
      .map((party) => ({ importKey: party.importKey, displayName: party.displayName }));

    if (missingFromCsv.length > 0) {
      warnings.push(
        `${missingFromCsv.length} party/parties are in the database but not in this CSV. They were left ` +
          `untouched — check whether they were renamed before removing anything by hand.`,
      );
    }

    return { created, updated, unchanged, guestsNamed, missingFromCsv, warnings };
  },
});

/**
 * Follows a rename in the sheet. The import matches a party on its name and
 * surname, so a party renamed in the sheet would come back as a second party;
 * this moves the stored one to the new name instead, keeping its link, invites
 * and replies. Run by hand, once per rename:
 * `npx convex run --prod parties:renameToMatchSheet '{"importKey":"…","displayName":"…","surname":"…"}'`
 */
export const renameToMatchSheet = internalMutation({
  args: { importKey: v.string(), displayName: v.string(), surname: v.string() },
  returns: v.string(),
  handler: async (ctx, { importKey, displayName, surname }) => {
    const party = await ctx.db
      .query("parties")
      .withIndex("by_import_key", (q) => q.eq("importKey", importKey))
      .unique();
    if (!party) throw new Error(`No party has the import key ${JSON.stringify(importKey)}`);

    const next = buildImportKey(displayName, surname);
    const clash = await ctx.db
      .query("parties")
      .withIndex("by_import_key", (q) => q.eq("importKey", next))
      .unique();
    if (clash && clash._id !== party._id) {
      throw new Error(`${JSON.stringify(next)} already belongs to another party`);
    }

    await ctx.db.patch(party._id, { displayName: displayName.trim(), surname: surname.trim(), importKey: next });
    return next;
  },
});
