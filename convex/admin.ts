import { ConvexError, v, type ObjectType } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

import { buildImportKey } from "../src/lib/guest-csv";
import { MAX_BULK } from "../src/lib/party-bulk";
import { deriveRsvp, type RsvpState } from "../src/lib/party-filters";
import { replyOutcome } from "../src/lib/pipeline";
import { type EventFlags, partyInvitedTo } from "../src/lib/rsvp-rules";
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
  contactPhone: v.optional(v.string()),
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

const eventFlags = v.object({ preWedding: v.boolean(), wedding: v.boolean(), brunch: v.boolean() });
const invitedVia = v.union(v.literal("email"), v.literal("whatsapp"), v.literal("both"));
const sendStatus = v.union(
  v.literal("queued"),
  v.literal("sent"),
  v.literal("delivered"),
  v.literal("delivery_delayed"),
  v.literal("bounced"),
  v.literal("complained"),
  v.literal("failed"),
);

const rsvpSummary = v.object({
  state: v.union(v.literal("attending"), v.literal("declined"), v.literal("awaiting"), v.literal("notInvited")),
  attending: v.number(),
  seatsNamed: v.number(),
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
  contactPhone: v.optional(v.string()),
  respondedAt: v.optional(v.number()),
  declined: v.optional(v.boolean()),
  guestNote: v.optional(v.string()),
  rsvp: rsvpSummary,
  editedInAdminAt: v.optional(v.number()),
  /** The flags above OR any couple-named guest's own invite. What "invited to" filters on. */
  invitedTo: eventFlags,
  lastVisitAt: v.optional(v.number()),
  visitCount: v.number(),
  emailBounced: v.boolean(),
  invitedVia: v.optional(invitedVia),
});

export type PartyRow = {
  _id: Doc<"parties">["_id"];
  rsvp: { state: RsvpState; attending: number; guestCount: number; seatsNamed: number };
  invitedTo: EventFlags;
  lastVisitAt?: number;
  visitCount: number;
  emailBounced: boolean;
  invitedVia?: "email" | "whatsapp" | "both";
} & Omit<Doc<"parties">, "_id" | "_creationTime">;

function bucketByParty<T extends { partyId: Id<"parties"> }>(rows: readonly T[]): Map<Id<"parties">, T[]> {
  const buckets = new Map<Id<"parties">, T[]>();
  for (const row of rows) {
    const bucket = buckets.get(row.partyId);
    if (bucket) bucket.push(row);
    else buckets.set(row.partyId, [row]);
  }
  return buckets;
}

/**
 * Everything the admin views read, each table scanned once and bucketed by party.
 *
 * `parties` and `guests` are sized by the venue. `sends` and `visits` do grow, but
 * with a throttle on visits and a handful of messages per party they stay in the
 * low thousands for one wedding — scanning them beats 400 index reads per table.
 */
async function loadAll(ctx: QueryCtx) {
  const [parties, guests, sends, visits] = await Promise.all([
    ctx.db.query("parties").collect(),
    ctx.db.query("guests").collect(),
    ctx.db.query("sends").collect(),
    ctx.db.query("visits").collect(),
  ]);
  return {
    parties,
    guestsByParty: bucketByParty(guests),
    sendsByParty: bucketByParty(sends),
    visitsByParty: bucketByParty(visits),
  };
}

const isEmailInvite = (send: Doc<"sends">) =>
  send.channel === "email" && (send.kind === "invite" || send.kind === "update");

function engagementOf(sends: readonly Doc<"sends">[], visits: readonly Doc<"visits">[]) {
  const invites = sends.filter((send) => send.kind === "invite");
  const viaEmail = invites.some((send) => send.channel === "email");
  const viaWhatsApp = invites.some((send) => send.channel === "whatsapp");
  const emails = sends.filter((send) => send.channel === "email").sort((a, b) => b.sentAt - a.sentAt);

  return {
    lastVisitAt: visits.length > 0 ? Math.max(...visits.map((visit) => visit.at)) : undefined,
    visitCount: visits.length,
    emailBounced: emails.some((send) => send.status === "bounced"),
    invitedVia:
      viaEmail && viaWhatsApp
        ? ("both" as const)
        : viaEmail
          ? ("email" as const)
          : viaWhatsApp
            ? ("whatsapp" as const)
            : undefined,
  };
}

const stillDeclinedEarly = (party: PartyRow) => party.earlyDecline && party.respondedAt === undefined;

/** Loads every party with its RSVP summary and engagement attached. */
async function loadParties(ctx: QueryCtx): Promise<PartyRow[]> {
  const { parties, guestsByParty, sendsByParty, visitsByParty } = await loadAll(ctx);

  return parties.map(({ _creationTime: _ignored, ...party }) => {
    const guests = guestsByParty.get(party._id) ?? [];
    const engagement = engagementOf(sendsByParty.get(party._id) ?? [], visitsByParty.get(party._id) ?? []);
    return {
      ...party,
      rsvp: deriveRsvp(party, guests),
      invitedTo: partyInvitedTo(party, guests),
      ...engagement,
    };
  });
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
        // An early "No" the party has since replaced online no longer counts.
        declinedEarly: rows.filter(stillDeclinedEarly).length,
        declinedEarlyGuests: rows
          .filter(stillDeclinedEarly)
          .reduce((sum, party) => sum + party.headCount + (party.plusOneAllowed ? 1 : 0), 0),
      },
    };
  },
});

/**
 * Removes a party's dependent rows. Guest rows are meaningless without their
 * party, and sends and visits left behind would silently inflate every count that
 * scans those tables. Returns how many guest rows went, which is what the couple
 * are warned about.
 */
async function deleteDependents(ctx: MutationCtx, partyId: Id<"parties">): Promise<number> {
  const guests = await ctx.db
    .query("guests")
    .withIndex("by_party", (q) => q.eq("partyId", partyId))
    .collect();
  const sends = await ctx.db
    .query("sends")
    .withIndex("by_party", (q) => q.eq("partyId", partyId))
    .collect();
  const visits = await ctx.db
    .query("visits")
    .withIndex("by_party", (q) => q.eq("partyId", partyId))
    .collect();

  for (const row of [...guests, ...sends, ...visits]) await ctx.db.delete(row._id);
  return guests.length;
}

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

    const deletedGuests = await deleteDependents(ctx, partyId);
    await ctx.db.delete(partyId);
    return { deletedGuests };
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
      deletedGuests += await deleteDependents(ctx, partyId);
      await ctx.db.delete(partyId);
      deletedParties++;
    }
    return { deletedParties, deletedGuests, missing };
  },
});

/** Trimmed, and refused when empty: a place card needs a first name. */
function guestName(firstName: string, lastName: string) {
  const first = firstName.trim();
  if (first === "") throw new ConvexError("A first name, so we can write a place card.");
  return { firstName: first, lastName: lastName.trim() };
}

function hasAnswers(guest: Doc<"guests">): boolean {
  return guest.preWedding !== "pending" || guest.wedding !== "pending" || guest.brunch !== "pending";
}

/**
 * Names someone in a party ahead of the reply, usually to invite them to a
 * different set of events from the rest of it. `invitedTo` absent means the
 * party's flags, the same as any seat the couple did not single out.
 *
 * Refused once the party's named seats are full. The reply form will not accept
 * more names than the head count, and a party that could not reply because of a
 * guest the couple added would have no way out.
 */
export const addNamedGuest = mutation({
  args: {
    partyId: v.id("parties"),
    firstName: v.string(),
    lastName: v.string(),
    invitedTo: v.optional(eventFlags),
  },
  returns: v.id("guests"),
  handler: async (ctx, { partyId, firstName, lastName, invitedTo }) => {
    await requireAdmin(ctx);

    const party = await ctx.db.get(partyId);
    if (!party) throw new ConvexError("That party no longer exists");

    const guests = await ctx.db
      .query("guests")
      .withIndex("by_party", (q) => q.eq("partyId", partyId))
      .collect();
    if (guests.filter((guest) => !guest.isPlusOne).length >= party.headCount) {
      throw new ConvexError(
        `${party.displayName} already has ${party.headCount} named seat(s). Raise the head count first.`,
      );
    }

    return await ctx.db.insert("guests", {
      partyId,
      ...guestName(firstName, lastName),
      isPlusOne: false,
      preWedding: "pending",
      wedding: "pending",
      brunch: "pending",
      addedByCouple: true,
      ...(invitedTo ? { invitedTo } : {}),
    });
  },
});

/** `invitedTo: null` clears the person's own invite, so the party's flags apply again. */
export const updateNamedGuest = mutation({
  args: {
    guestId: v.id("guests"),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    invitedTo: v.optional(v.union(eventFlags, v.null())),
  },
  returns: v.null(),
  handler: async (ctx, { guestId, firstName, lastName, invitedTo }) => {
    await requireAdmin(ctx);

    const guest = await ctx.db.get(guestId);
    if (!guest) throw new ConvexError("That guest no longer exists");

    const name = guestName(firstName ?? guest.firstName, lastName ?? guest.lastName);
    await ctx.db.patch(guestId, {
      ...name,
      ...(invitedTo === undefined ? {} : { invitedTo: invitedTo ?? undefined }),
    });
    return null;
  },
});

/**
 * Only for someone the couple added and who has not answered. Anyone else is the
 * party's own reply, and deleting it from here would silently drop a person the
 * party told us about.
 */
export const removeNamedGuest = mutation({
  args: { guestId: v.id("guests") },
  returns: v.null(),
  handler: async (ctx, { guestId }) => {
    await requireAdmin(ctx);

    const guest = await ctx.db.get(guestId);
    if (!guest) throw new ConvexError("That guest no longer exists");
    if (!guest.addedByCouple) throw new ConvexError("Only people you added yourselves can be removed here.");
    if (hasAnswers(guest)) {
      throw new ConvexError(`${guest.firstName} has already replied. Their answer stays on the list.`);
    }

    await ctx.db.delete(guestId);
    return null;
  },
});

/** The couple-named guests of one party, for the party form's "People" section. */
export const namedGuests = query({
  args: { partyId: v.id("parties") },
  returns: v.array(
    v.object({
      _id: v.id("guests"),
      firstName: v.string(),
      lastName: v.string(),
      /** Absent when this person follows the party's flags. */
      invitedTo: v.optional(eventFlags),
      hasAnswers: v.boolean(),
    }),
  ),
  handler: async (ctx, { partyId }) => {
    await requireAdmin(ctx);

    const guests = await ctx.db
      .query("guests")
      .withIndex("by_party", (q) => q.eq("partyId", partyId))
      .collect();

    return guests
      .filter((guest) => guest.addedByCouple)
      .map((guest) => ({
        _id: guest._id,
        firstName: guest.firstName,
        lastName: guest.lastName,
        invitedTo: guest.invitedTo,
        hasAnswers: hasAnswers(guest),
      }));
  },
});

async function whatsAppInvites(ctx: QueryCtx, partyId: Id<"parties">): Promise<Doc<"sends">[]> {
  const sends = await ctx.db
    .query("sends")
    .withIndex("by_party", (q) => q.eq("partyId", partyId))
    .collect();
  return sends.filter((send) => send.channel === "whatsapp" && send.kind === "invite");
}

/**
 * Records that the couple sent these parties their invitation on WhatsApp, by
 * hand. Idempotent: a party already stamped is skipped, so selecting the whole
 * list after a second evening of sending does not count anyone twice.
 */
export const markInvitedOnWhatsApp = mutation({
  args: { partyIds: v.array(v.id("parties")) },
  returns: v.object({ marked: v.number(), alreadyMarked: v.number(), missing: v.number() }),
  handler: async (ctx, { partyIds }) => {
    await requireAdmin(ctx);
    validateBulkIds(partyIds);

    let marked = 0;
    let alreadyMarked = 0;
    let missing = 0;
    const sentAt = Date.now();
    for (const partyId of new Set(partyIds)) {
      if (!(await ctx.db.get(partyId))) {
        missing++;
        continue;
      }
      if ((await whatsAppInvites(ctx, partyId)).length > 0) {
        alreadyMarked++;
        continue;
      }
      await ctx.db.insert("sends", {
        partyId,
        channel: "whatsapp",
        kind: "invite",
        status: "sent",
        sentAt,
        openCount: 0,
        clickCount: 0,
      });
      marked++;
    }
    return { marked, alreadyMarked, missing };
  },
});

/** The undo for `markInvitedOnWhatsApp`. */
export const unmarkInvitedOnWhatsApp = mutation({
  args: { partyIds: v.array(v.id("parties")) },
  returns: v.object({ unmarked: v.number() }),
  handler: async (ctx, { partyIds }) => {
    await requireAdmin(ctx);
    validateBulkIds(partyIds);

    let unmarked = 0;
    for (const partyId of new Set(partyIds)) {
      const invites = await whatsAppInvites(ctx, partyId);
      for (const send of invites) await ctx.db.delete(send._id);
      if (invites.length > 0) unmarked++;
    }
    return { unmarked };
  },
});

const channelConversion = v.object({ parties: v.number(), visited: v.number(), replied: v.number() });

/**
 * The invitation funnel, counted in parties throughout.
 *
 * Email engagement counts invites and updates only: a receipt is opened by people
 * who have already replied, and would flatter the numbers.
 *
 * `byFirstChannel` splits parties by whichever invite reached them first, so a
 * party emailed after a WhatsApp is credited to WhatsApp.
 */
export const funnel = query({
  args: {},
  returns: v.object({
    parties: v.number(),
    invited: v.object({ email: v.number(), whatsapp: v.number(), any: v.number() }),
    email: v.object({
      /** Parties with any invitation or update email. Zero until the app sends them. */
      sent: v.number(),
      delivered: v.number(),
      opened: v.number(),
      clicked: v.number(),
      bounced: v.number(),
      complained: v.number(),
    }),
    visited: v.number(),
    replied: v.number(),
    byFirstChannel: v.object({ email: channelConversion, whatsapp: channelConversion }),
  }),
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const { parties, sendsByParty, visitsByParty } = await loadAll(ctx);

    const counts = {
      parties: parties.length,
      invited: { email: 0, whatsapp: 0, any: 0 },
      email: { sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, complained: 0 },
      visited: 0,
      replied: 0,
      byFirstChannel: {
        email: { parties: 0, visited: 0, replied: 0 },
        whatsapp: { parties: 0, visited: 0, replied: 0 },
      },
    };

    for (const party of parties) {
      const sends = sendsByParty.get(party._id) ?? [];
      const invites = sends.filter((send) => send.kind === "invite").sort((a, b) => a.sentAt - b.sentAt);
      const emails = sends.filter(isEmailInvite);
      const visited = (visitsByParty.get(party._id)?.length ?? 0) > 0;
      const replied = party.respondedAt !== undefined || party.earlyDecline;

      if (invites.some((send) => send.channel === "email")) counts.invited.email++;
      if (invites.some((send) => send.channel === "whatsapp")) counts.invited.whatsapp++;
      if (invites.length > 0) counts.invited.any++;

      if (emails.length > 0) counts.email.sent++;
      // An open or a click proves delivery even when the delivered event was lost.
      if (emails.some((send) => send.deliveredAt !== undefined || send.firstOpenedAt !== undefined)) {
        counts.email.delivered++;
      }
      if (emails.some((send) => send.openCount > 0)) counts.email.opened++;
      if (emails.some((send) => send.clickCount > 0)) counts.email.clicked++;
      if (emails.some((send) => send.status === "bounced")) counts.email.bounced++;
      if (emails.some((send) => send.status === "complained")) counts.email.complained++;

      if (visited) counts.visited++;
      if (replied) counts.replied++;

      const first = invites[0];
      if (first) {
        const bucket = counts.byFirstChannel[first.channel];
        bucket.parties++;
        if (visited) bucket.visited++;
        if (replied) bucket.replied++;
      }
    }

    return counts;
  },
});

const sendFields = {
  sendId: v.id("sends"),
  channel: v.union(v.literal("email"), v.literal("whatsapp")),
  kind: v.union(v.literal("invite"), v.literal("update"), v.literal("receipt"), v.literal("reminder")),
  to: v.optional(v.string()),
  status: sendStatus,
  deliveredAt: v.optional(v.number()),
  firstOpenedAt: v.optional(v.number()),
  lastOpenedAt: v.optional(v.number()),
  openCount: v.number(),
  firstClickedAt: v.optional(v.number()),
  lastClickedAt: v.optional(v.number()),
  clickCount: v.number(),
  bouncedAt: v.optional(v.number()),
  bounceReason: v.optional(v.string()),
  complainedAt: v.optional(v.number()),
  failedAt: v.optional(v.number()),
  error: v.optional(v.string()),
};

/**
 * One party's messages and visits as a single timeline, newest first.
 *
 * Listed field by field, like the guest-facing projections in rsvp.ts: the
 * timeline is for reading, and nothing on it should be a link into the party.
 */
export const partyActivity = query({
  args: { partyId: v.id("parties") },
  returns: v.array(
    v.union(
      v.object({ type: v.literal("send"), at: v.number(), ...sendFields }),
      v.object({
        type: v.literal("visit"),
        at: v.number(),
        source: v.union(v.literal("link"), v.literal("email"), v.literal("lookup"), v.literal("remembered")),
        sendId: v.optional(v.id("sends")),
      }),
    ),
  ),
  handler: async (ctx, { partyId }) => {
    await requireAdmin(ctx);

    const sends = await ctx.db
      .query("sends")
      .withIndex("by_party", (q) => q.eq("partyId", partyId))
      .collect();
    const visits = await ctx.db
      .query("visits")
      .withIndex("by_party", (q) => q.eq("partyId", partyId))
      .collect();

    return [
      ...sends.map((send) => ({
        type: "send" as const,
        at: send.sentAt,
        sendId: send._id,
        channel: send.channel,
        kind: send.kind,
        to: send.to,
        status: send.status,
        deliveredAt: send.deliveredAt,
        firstOpenedAt: send.firstOpenedAt,
        lastOpenedAt: send.lastOpenedAt,
        openCount: send.openCount,
        firstClickedAt: send.firstClickedAt,
        lastClickedAt: send.lastClickedAt,
        clickCount: send.clickCount,
        bouncedAt: send.bouncedAt,
        bounceReason: send.bounceReason,
        complainedAt: send.complainedAt,
        failedAt: send.failedAt,
        error: send.error,
      })),
      ...visits.map((visit) => ({ type: "visit" as const, at: visit.at, source: visit.source, sendId: visit.sendId })),
    ].sort((a, b) => b.at - a.at);
  },
});

const emailProgress = v.object({
  kind: v.union(v.literal("invite"), v.literal("update")),
  status: sendStatus,
  delivered: v.boolean(),
  opened: v.boolean(),
  clicked: v.boolean(),
});

/** The latest moment anything happened to a party: a message, an email event, a visit or a reply. */
function lastActivityOf(party: Doc<"parties">, sends: readonly Doc<"sends">[], visits: readonly Doc<"visits">[]) {
  const moments = [
    party.respondedAt,
    ...visits.map((visit) => visit.at),
    ...sends.flatMap((send) => [
      send.sentAt,
      send.deliveredAt,
      send.lastOpenedAt,
      send.lastClickedAt,
      send.bouncedAt,
      send.complainedAt,
    ]),
  ].filter((at): at is number => at !== undefined);
  return moments.length > 0 ? Math.max(...moments) : undefined;
}

/**
 * One card per party for the pipeline board on /admin/insights, with only what a
 * card shows. The stage itself is placed in the browser by `derivePipeline`, as
 * two of its flags are about elapsed time and a query result does not age.
 *
 * `reply` is derived here, where the guest rows are, so the board never ships them.
 */
export const pipeline = query({
  args: {},
  returns: v.array(
    v.object({
      partyId: v.id("parties"),
      displayName: v.string(),
      surname: v.string(),
      headCount: v.number(),
      plusOneAllowed: v.boolean(),
      who: partyWho,
      wave: partyWave,
      invitedTo: eventFlags,
      invitedVia: v.optional(invitedVia),
      firstInvitedAt: v.optional(v.number()),
      lastVisitAt: v.optional(v.number()),
      lastActivityAt: v.optional(v.number()),
      reply: v.optional(v.union(v.literal("coming"), v.literal("partly"), v.literal("declined"))),
      emailTrouble: v.optional(v.union(v.literal("bounced"), v.literal("complained"), v.literal("failed"))),
      /** The latest invitation or update email. Receipts go to people who already replied. */
      latestEmail: v.optional(emailProgress),
    }),
  ),
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const { parties, guestsByParty, sendsByParty, visitsByParty } = await loadAll(ctx);

    return parties.map((party) => {
      const guests = guestsByParty.get(party._id) ?? [];
      const sends = sendsByParty.get(party._id) ?? [];
      const visits = visitsByParty.get(party._id) ?? [];
      const { invitedVia: via } = engagementOf(sends, visits);
      const invites = sends.filter((send) => send.kind === "invite");
      const emails = sends.filter((send) => send.channel === "email").sort((a, b) => b.sentAt - a.sentAt);
      const latest = emails.find(isEmailInvite);
      const trouble = emails[0]?.status;

      return {
        partyId: party._id,
        displayName: party.displayName,
        surname: party.surname,
        headCount: party.headCount,
        plusOneAllowed: party.plusOneAllowed,
        who: party.who,
        wave: party.wave,
        invitedTo: partyInvitedTo(party, guests),
        invitedVia: via,
        firstInvitedAt: invites.length > 0 ? Math.min(...invites.map((send) => send.sentAt)) : undefined,
        lastVisitAt: visits.length > 0 ? Math.max(...visits.map((visit) => visit.at)) : undefined,
        lastActivityAt: lastActivityOf(party, sends, visits),
        reply: replyOutcome(party, guests),
        emailTrouble: trouble === "bounced" || trouble === "complained" || trouble === "failed" ? trouble : undefined,
        latestEmail:
          latest && (latest.kind === "invite" || latest.kind === "update")
            ? {
                kind: latest.kind,
                status: latest.status,
                // An open or a click proves delivery even when the delivered event was lost.
                delivered: latest.deliveredAt !== undefined || latest.openCount > 0 || latest.clickCount > 0,
                opened: latest.openCount > 0,
                clicked: latest.clickCount > 0,
              }
            : undefined,
      };
    });
  },
});
