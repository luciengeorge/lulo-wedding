import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// App-level schema. Auth tables live in the betterAuth component
// (see convex/betterAuth/schema.ts) and are not declared here.
//
// Add your application tables below as your product grows.
/** Per-event RSVP state. `pending` is the pre-reply default, not a "maybe". */
const rsvpStatus = v.union(v.literal("pending"), v.literal("yes"), v.literal("no"));

/** Which of the three events a seat is asked about. */
const eventFlags = v.object({ preWedding: v.boolean(), wedding: v.boolean(), brunch: v.boolean() });

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
    /** Free text: the couple send WhatsApp invites by hand, so this is never dialled by the app. */
    contactPhone: v.optional(v.string()),
    /**
     * When the party last submitted the RSVP form. `earlyDecline` is the sheet
     * recording a no before anyone was asked; this is the form being used.
     */
    respondedAt: v.optional(v.number()),
    /**
     * Stored rather than derived. A party that accepts and then ticks nothing is
     * also a decline, and "no guest row says yes" cannot tell that apart from
     * "has not replied yet".
     */
    declined: v.optional(v.boolean()),
    /** What the guest typed on the decline screen. `note` is the couple's own. */
    guestNote: v.optional(v.string()),
  })
    .index("by_import_key", ["importKey"])
    .index("by_token", ["token"])
    .index("by_wave", ["wave"])
    .index("by_who", ["who"]),

  /**
   * Individual attendees. Not created by the import — the sheet mostly does not name
   * people, only parties. A guest row appears when a party RSVPs and says who is coming,
   * or when the couple name someone in /admin to invite them to different events from
   * the rest of their party.
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
    /**
     * This person's own invite, set only by the couple. Absent means the party's
     * flags apply, which is every seat the couple did not single out.
     */
    invitedTo: v.optional(eventFlags),
    /**
     * Named by the couple rather than by the party. Such a row is never deleted by
     * a reply: clearing the card marks the person as not coming instead.
     */
    addedByCouple: v.optional(v.boolean()),
  }).index("by_party", ["partyId"]),

  /**
   * One row per message sent to a party, on any channel. Email rows are queued
   * through the Resend component and updated by its webhook; WhatsApp is sent by
   * hand, so those rows are the couple stamping it in /admin and stay "sent".
   */
  sends: defineTable({
    partyId: v.id("parties"),
    channel: v.union(v.literal("email"), v.literal("whatsapp")),
    kind: v.union(v.literal("invite"), v.literal("update"), v.literal("receipt"), v.literal("reminder")),
    /** The address mailed. Absent for WhatsApp. */
    to: v.optional(v.string()),
    /** The Resend component's EmailId, which is how webhook events find this row. */
    emailId: v.optional(v.string()),
    status: v.union(
      v.literal("queued"),
      v.literal("sent"),
      v.literal("delivered"),
      v.literal("delivery_delayed"),
      v.literal("bounced"),
      v.literal("complained"),
      v.literal("failed"),
      /** Part of a send run the couple stopped before this one went out. Never reached Resend. */
      v.literal("cancelled"),
    ),
    /** When it was handed to Resend. A campaign row is written early and restamped when it goes. */
    sentAt: v.number(),
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
    /** The send run this message belongs to, for one sent from the /admin composer. */
    campaignId: v.optional(v.id("campaigns")),
    /**
     * The pending job that will send it. Present only until that job runs, which
     * is how stopping a run tells "not sent yet" from "already on its way".
     */
    scheduledId: v.optional(v.id("_scheduled_functions")),
  })
    .index("by_party", ["partyId", "sentAt"])
    .index("by_email_id", ["emailId"])
    .index("by_channel", ["channel", "sentAt"])
    .index("by_status", ["status", "sentAt"])
    .index("by_campaign", ["campaignId"]),

  /**
   * One run of invitations or reminders from the /admin composer. Its progress is
   * read off its `sends` rows rather than kept here, so the two cannot disagree.
   */
  campaigns: defineTable({
    kind: v.union(v.literal("invite"), v.literal("reminder")),
    createdAt: v.number(),
    /** The admin who started it, by email address. */
    createdBy: v.string(),
    /** Parties it is going to, after the skipped ones were left out. */
    total: v.number(),
    /** "Done" is not stored: it is a run with nothing left to send. */
    status: v.union(v.literal("sending"), v.literal("cancelled")),
    cancelledAt: v.optional(v.number()),
    /** Minted by the composer per confirm, so a double click starts one run, not two. */
    clientRequestId: v.string(),
  })
    .index("by_client_request", ["clientRequestId"])
    .index("by_created", ["createdAt"]),

  /** A party's link being opened. The receiving end of every channel, WhatsApp included. */
  visits: defineTable({
    partyId: v.id("parties"),
    at: v.number(),
    source: v.union(v.literal("link"), v.literal("email"), v.literal("lookup"), v.literal("remembered")),
    /** The email the visit came from, when the link carried one. */
    sendId: v.optional(v.id("sends")),
  }).index("by_party", ["partyId", "at"]),

  /**
   * Outbound email, captured instead of sent.
   *
   * Only ever written when E2E_CAPTURE_EMAILS is set on the deployment, which is
   * true for the throwaway backend the browser tests run against and false
   * everywhere else. It exists so the tests can sign in through the real
   * magic-link flow rather than through a back door that mints a session: a
   * capture table that leaks costs an undelivered email, whereas a session-minting
   * mutation living in the production bundle is a way in.
   */
  capturedEmails: defineTable({
    to: v.string(),
    subject: v.string(),
    template: v.string(),
    /** The rendered HTML, so a test can pull a link or assert on the copy. */
    html: v.string(),
  }).index("by_to", ["to"]),

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
