import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// App-level schema. Auth tables live in the betterAuth component
// (see convex/betterAuth/schema.ts) and are not declared here.
//
// Add your application tables below as your product grows.
/** Per-event RSVP state. `pending` is the pre-reply default, not a "maybe". */
const rsvpStatus = v.union(v.literal("pending"), v.literal("yes"), v.literal("no"));

export default defineSchema({
  /**
   * One row per invitation. The invite unit is a party, not a person: the couple's
   * sheet is party-shaped ("Rae & Cherif et famille", head count 4), and `token` is
   * what a party's magic link carries.
   *
   * Imported from the guest-list CSV — see convex/parties.ts and src/lib/guest-csv.ts.
   */
  parties: defineTable({
    /** Normalised `${name}|${surname}`, the sheet's natural key. */
    importKey: v.string(),
    displayName: v.string(),
    /** May be empty: a couple of parties in the sheet have no surname. */
    surname: v.string(),
    token: v.string(),
    /** Named seats from the sheet, excluding any plus-one. */
    headCount: v.number(),
    plusOneAllowed: v.boolean(),
    link: v.union(v.literal("family"), v.literal("friends")),
    whereFrom: v.optional(v.string()),
    who: v.union(v.literal("lucien"), v.literal("laura"), v.literal("mutual"), v.literal("zeina"), v.literal("nayla")),
    wave: v.union(v.literal("tier1"), v.literal("tier2")),
    under50: v.optional(v.boolean()),
    invitedToPreWedding: v.boolean(),
    invitedToWedding: v.boolean(),
    invitedToBrunch: v.boolean(),
    saveTheDateSent: v.boolean(),
    /** The sheet's RSVP column already says "No" — they declined before being asked. */
    earlyDecline: v.boolean(),
    /**
     * Set when the couple edit a party in /admin. The importer then leaves that
     * party alone: a hand correction is deliberate and the sheet is the stale
     * copy, so re-importing must not quietly revert it.
     */
    editedInAdminAt: v.optional(v.number()),
    note: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
  })
    .index("by_import_key", ["importKey"])
    .index("by_token", ["token"])
    .index("by_wave", ["wave"])
    .index("by_who", ["who"]),

  /**
   * Individual attendees. Not created by the import — the sheet mostly does not name
   * people, only parties. A guest row appears when a party RSVPs and says who is coming.
   */
  guests: defineTable({
    partyId: v.id("parties"),
    firstName: v.string(),
    lastName: v.string(),
    email: v.optional(v.string()),
    isPlusOne: v.boolean(),
    dietaryNotes: v.optional(v.string()),
    preWedding: rsvpStatus,
    preWeddingAt: v.optional(v.number()),
    wedding: rsvpStatus,
    weddingAt: v.optional(v.number()),
    brunch: rsvpStatus,
    brunchAt: v.optional(v.number()),
  }).index("by_party", ["partyId"]),

  /**
   * Background sync job state. See convex/sync/README.md.
   * One row per (userId, source). Status drives the dispatcher.
   */
  syncJobs: defineTable({
    userId: v.string(),
    source: v.string(),
    status: v.union(v.literal("idle"), v.literal("running"), v.literal("failed"), v.literal("disabled")),
    cursor: v.optional(v.string()),
    nextRunAt: v.number(),
    lastRunAt: v.optional(v.number()),
    lastSuccessAt: v.optional(v.number()),
    attempts: v.number(),
    error: v.optional(v.string()),
  })
    .index("by_user_source", ["userId", "source"])
    .index("by_status_next_run", ["status", "nextRunAt"]),
});
