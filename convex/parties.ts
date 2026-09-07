import { type Infer, v } from "convex/values";

import { mutation } from "./_generated/server";
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
});

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
 * `dryRun` produces the identical report without touching the table, so the admin
 * UI can show the couple exactly what an import would do before they commit to it.
 * Running the real logic beats reimplementing a preview that could disagree with it.
 */
export const importParties = mutation({
  args: { rows: v.array(partyCsvFields), dryRun: v.optional(v.boolean()) },
  returns: v.object({
    created: v.number(),
    updated: v.number(),
    unchanged: v.number(),
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
    const skippedAdminEdited: { importKey: string; displayName: string }[] = [];

    for (const row of rows) {
      const existing = byImportKey.get(row.importKey);

      if (!existing) {
        let token = generateToken();
        while (usedTokens.has(token)) token = generateToken();
        usedTokens.add(token);

        if (!dryRun) {
          await ctx.db.insert("parties", {
            ...row,
            token,
            // Set once, on insert. The couple owns these from the admin UI afterwards.
            invitedToPreWedding: false,
            invitedToWedding: true,
            invitedToBrunch: false,
          });
        }
        created++;
        continue;
      }

      const patch = diffSheetFields(existing, row);
      if (!patch) {
        unchanged++;
        continue;
      }

      // Admin edits win. A correction typed in /admin is deliberate and current;
      // the sheet is the stale copy. Skipping loudly rather than silently, so a
      // real divergence between the two is visible instead of being discovered
      // months later when a name is wrong on a place card.
      if (existing.editedInAdminAt !== undefined) {
        skippedAdminEdited.push({ importKey: existing.importKey, displayName: existing.displayName });
        continue;
      }

      if (!dryRun) await ctx.db.patch(existing._id, patch);
      updated++;
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

    return { created, updated, unchanged, missingFromCsv, warnings };
  },
});
