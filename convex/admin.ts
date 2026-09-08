import { ConvexError, v, type ObjectType } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

import { buildImportKey } from "../src/lib/guest-csv";
import { MAX_BULK } from "../src/lib/party-bulk";
import { deriveRsvp, type RsvpState } from "../src/lib/party-filters";
import { mutation, query } from "./_generated/server";
import { requireAdmin } from "./lib/adminAuth";
import { generateToken } from "./parties";

const partyLink = v.union(v.literal("family"), v.literal("friends"));
const partyWho = v.union(
  v.literal("lucien"),
  v.literal("laura"),
  v.literal("mutual"),
  v.literal("zeina"),
  v.literal("nayla"),
);
const partyWave = v.union(v.literal("tier1"), v.literal("tier2"));

/**
 * The fields /admin owns. `token` and `importKey` are
 * absent: the first two must survive an edit, and the last two are the sheet's to
 * set — the importer would overwrite anything typed here on the next run.
 */
const partyEditableFields = {
  displayName: v.string(),
  surname: v.string(),
  headCount: v.number(),
  plusOneAllowed: v.boolean(),
  under50: v.optional(v.boolean()),
  earlyDecline: v.boolean(),
  link: partyLink,
  whereFrom: v.optional(v.string()),
  who: partyWho,
  wave: partyWave,
  invitedToPreWedding: v.boolean(),
  invitedToWedding: v.boolean(),
  invitedToBrunch: v.boolean(),
  saveTheDateSent: v.boolean(),
  note: v.optional(v.string()),
  contactEmail: v.optional(v.string()),
};

/** The subset of party fields that are meaningful to set on many rows at once. */
const partyBulkFields = {
  invitedToPreWedding: v.optional(v.boolean()),
  invitedToWedding: v.optional(v.boolean()),
  invitedToBrunch: v.optional(v.boolean()),
  saveTheDateSent: v.optional(v.boolean()),
  wave: v.optional(partyWave),
  who: v.optional(partyWho),
  link: v.optional(partyLink),
  plusOneAllowed: v.optional(v.boolean()),
  earlyDecline: v.optional(v.boolean()),
};

export type PartyBulkFields = ObjectType<typeof partyBulkFields>;

function validateBulkIds(partyIds: Doc<"parties">["_id"][]) {
  if (partyIds.length === 0) throw new ConvexError("Select at least one party");
  if (partyIds.length > MAX_BULK) throw new ConvexError(`Choose no more than ${MAX_BULK} parties per batch`);
}

const rsvpSummary = v.object({
  state: v.union(v.literal("attending"), v.literal("declined"), v.literal("awaiting"), v.literal("notInvited")),
  attending: v.number(),
  guestCount: v.number(),
});

const partyRow = v.object({
  _id: v.id("parties"),
  importKey: v.string(),
  displayName: v.string(),
  surname: v.string(),
  token: v.string(),
  headCount: v.number(),
  plusOneAllowed: v.boolean(),
  link: partyLink,
  whereFrom: v.optional(v.string()),
  who: partyWho,
  wave: partyWave,
  under50: v.optional(v.boolean()),
  invitedToPreWedding: v.boolean(),
  invitedToWedding: v.boolean(),
  invitedToBrunch: v.boolean(),
  saveTheDateSent: v.boolean(),
  earlyDecline: v.boolean(),
  note: v.optional(v.string()),
  contactEmail: v.optional(v.string()),
  rsvp: rsvpSummary,
  editedInAdminAt: v.optional(v.number()),
});

export type PartyRow = {
  _id: Doc<"parties">["_id"];
  rsvp: { state: RsvpState; attending: number; guestCount: number };
} & Omit<Doc<"parties">, "_id" | "_creationTime">;

/**
 * Loads every party with its RSVP summary attached.
 *
 * Two full scans, both deliberate. `parties` is one wedding's guest list (~400
 * rows), and `guests` is scanned once and bucketed by party rather than queried
 * per row, which would be 400 index reads to produce the same answer. Neither
 * table grows with time — they are sized by the venue.
 */
async function loadParties(ctx: QueryCtx): Promise<PartyRow[]> {
  const parties = await ctx.db.query("parties").collect();
  const guests = await ctx.db.query("guests").collect();

  const guestsByParty = new Map<string, Doc<"guests">[]>();
  for (const guest of guests) {
    const bucket = guestsByParty.get(guest.partyId);
    if (bucket) bucket.push(guest);
    else guestsByParty.set(guest.partyId, [guest]);
  }

  return parties.map(({ _creationTime: _ignored, ...party }) => ({
    ...party,
    rsvp: deriveRsvp(party, guestsByParty.get(party._id) ?? []),
  }));
}

/**
 * The whole guest list for an allowlisted admin, in one query.
 *
 * Searching, filtering, sorting and paging all happen in the browser inside
 * TanStack Table: at ~400 rows the entire set is a small payload, it is fetched
 * once, and every interaction after that is instant with no round trip. Pushing
 * the filters back to the server would cost a request per keystroke to save
 * nothing. This is a private admin tool behind `requireAdmin`, so the set is not
 * sensitive to over-fetch beyond that gate.
 *
 * Stats are computed here rather than in the browser so the table and the header
 * cannot disagree, and they cover the whole list — the stat row sits above the
 * toolbar and answers "how big is this wedding", which should not move when
 * someone narrows the table.
 */
export const listParties = query({
  args: {},
  returns: v.object({
    rows: v.array(partyRow),
    stats: v.object({
      parties: v.number(),
      maximumGuests: v.number(),
      saveTheDateSent: v.number(),
      saveTheDateSentGuests: v.number(),
      responded: v.number(),
      declinedEarly: v.number(),
      declinedEarlyGuests: v.number(),
    }),
  }),
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const rows = await loadParties(ctx);

    return {
      rows,
      stats: {
        parties: rows.length,
        maximumGuests: rows.reduce((sum, party) => sum + party.headCount + (party.plusOneAllowed ? 1 : 0), 0),
        saveTheDateSent: rows.filter((party) => party.saveTheDateSent).length,
        // Guest-equivalents, so the row can state its unit rather than leaving
        // the reader to guess which stats count parties and which count people.
        saveTheDateSentGuests: rows
          .filter((party) => party.saveTheDateSent)
          .reduce((sum, party) => sum + party.headCount + (party.plusOneAllowed ? 1 : 0), 0),
        responded: rows.filter((party) => party.rsvp.guestCount > 0).length,
        declinedEarly: rows.filter((party) => party.earlyDecline).length,
        declinedEarlyGuests: rows
          .filter((party) => party.earlyDecline)
          .reduce((sum, party) => sum + party.headCount + (party.plusOneAllowed ? 1 : 0), 0),
      },
    };
  },
});

/** Mints a token that no existing party is already using. */
async function mintToken(ctx: MutationCtx): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const token = generateToken();
    const clash = await ctx.db
      .query("parties")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    if (!clash) return token;
  }
  // 132 bits of entropy: five collisions in a row is a broken RNG, not bad luck.
  throw new Error("Could not mint a unique magic-link token");
}

export const createParty = mutation({
  args: partyEditableFields,
  returns: v.id("parties"),
  handler: async (ctx, fields) => {
    await requireAdmin(ctx);

    const importKey = buildImportKey(fields.displayName, fields.surname);
    const clash = await ctx.db
      .query("parties")
      .withIndex("by_import_key", (q) => q.eq("importKey", importKey))
      .unique();

    if (clash) {
      // ConvexError, not Error: a plain Error's message is redacted to "Server
      // Error" on a production deployment, and this one is the whole point.
      throw new ConvexError(
        `"${`${clash.displayName} ${clash.surname}`.trim()}" already exists. Edit that party instead — two ` +
          `parties sharing a name would collide on the next CSV import.`,
      );
    }

    return await ctx.db.insert("parties", {
      ...fields,
      importKey,
      token: await mintToken(ctx),
      earlyDecline: fields.earlyDecline,
    });
  },
});

export const updateParty = mutation({
  args: { partyId: v.id("parties"), fields: v.object(partyEditableFields) },
  returns: v.null(),
  handler: async (ctx, { partyId, fields }) => {
    await requireAdmin(ctx);

    const party = await ctx.db.get(partyId);
    if (!party) throw new ConvexError("That party no longer exists");

    // `fields` cannot carry token or importKey — the validator has no such keys —
    // so a rename keeps both. The next CSV import still matches this row, and the
    // magic link already sent to the family keeps working.
    // Marks this party as admin-owned so importParties stops overwriting it.
    await ctx.db.patch(partyId, { ...fields, editedInAdminAt: Date.now() });
    return null;
  },
});

export const deleteParty = mutation({
  args: { partyId: v.id("parties") },
  returns: v.object({ deletedGuests: v.number() }),
  handler: async (ctx, { partyId }) => {
    await requireAdmin(ctx);

    const party = await ctx.db.get(partyId);
    if (!party) throw new ConvexError("That party no longer exists");

    // Guest rows are meaningless without their party, and leaving them behind
    // would silently inflate every count that scans the table.
    const guests = await ctx.db
      .query("guests")
      .withIndex("by_party", (q) => q.eq("partyId", partyId))
      .collect();

    for (const guest of guests) {
      await ctx.db.delete(guest._id);
    }

    await ctx.db.delete(partyId);
    return { deletedGuests: guests.length };
  },
});

export const bulkUpdateParties = mutation({
  args: { partyIds: v.array(v.id("parties")), fields: v.object(partyBulkFields) },
  returns: v.object({ updated: v.number(), unchanged: v.number(), missing: v.number() }),
  handler: async (ctx, { partyIds, fields }) => {
    await requireAdmin(ctx);
    validateBulkIds(partyIds);

    const patch = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
    if (Object.keys(patch).length === 0) throw new ConvexError("Choose at least one field to update");

    let updated = 0;
    let unchanged = 0;
    let missing = 0;
    const editedInAdminAt = Date.now();
    for (const partyId of new Set(partyIds)) {
      const party = await ctx.db.get(partyId);
      if (!party) {
        missing++;
        continue;
      }

      // A row that already holds these values is left alone, the way the importer's
      // own diff does. Stamping it would mark it admin-edited, and parties.ts then
      // ignores the sheet for it forever and warns about it on every future import.
      // One "mark all 400 as sent" over a list that is mostly already sent would
      // otherwise detach the whole guest list from the spreadsheet.
      if (Object.entries(patch).every(([field, value]) => party[field as keyof typeof party] === value)) {
        unchanged++;
        continue;
      }

      await ctx.db.patch(partyId, { ...patch, editedInAdminAt });
      updated++;
    }
    return { updated, unchanged, missing };
  },
});

export const bulkDeleteParties = mutation({
  args: { partyIds: v.array(v.id("parties")) },
  returns: v.object({ deletedParties: v.number(), deletedGuests: v.number(), missing: v.number() }),
  handler: async (ctx, { partyIds }) => {
    await requireAdmin(ctx);
    validateBulkIds(partyIds);

    let deletedParties = 0;
    let deletedGuests = 0;
    let missing = 0;
    for (const partyId of new Set(partyIds)) {
      if (!(await ctx.db.get(partyId))) {
        missing++;
        continue;
      }
      const guests = await ctx.db
        .query("guests")
        .withIndex("by_party", (q) => q.eq("partyId", partyId))
        .collect();
      for (const guest of guests) await ctx.db.delete(guest._id);
      await ctx.db.delete(partyId);
      deletedParties++;
      deletedGuests += guests.length;
    }
    return { deletedParties, deletedGuests, missing };
  },
});
