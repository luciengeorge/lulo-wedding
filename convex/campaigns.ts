import { v } from "convex/values";

import type { EventFlags } from "../src/lib/rsvp-rules";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

import { partyInvitedTo, RSVP_EVENTS } from "../src/lib/rsvp-rules";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";
import { requireAdmin } from "./lib/adminAuth";
import { EVENT_DATES } from "./rsvp";

/**
 * Invitations and reminders emailed from the /admin composer.
 *
 * The admin-facing functions live in convex/admin.ts with the rest of /admin.
 * This is what they share: who a run may go to, what each party's email says,
 * and the job that hands one message to Resend.
 */

export const campaignKind = v.union(v.literal("invite"), v.literal("reminder"));
export type CampaignKind = "invite" | "reminder";


export const SKIP_REASONS = ["replied", "declinedEarly", "noEvents", "noEmail", "alreadySent", "notInvited"] as const;
export type SkipReason = (typeof SKIP_REASONS)[number];
export const skipReason = v.union(...SKIP_REASONS.map((reason) => v.literal(reason)));

/** A send that never reached anyone does not count as having sent it. */
const reachedResend = (send: Doc<"sends">) => send.status !== "failed" && send.status !== "cancelled";

/**
 * Why a party is left out of a run, or null when it should get the email.
 *
 * A reply of any kind ends both emails: the sheet's early "No" as much as one
 * given on the form. A reminder only follows an invitation, on either channel,
 * and an invitation already emailed is not sent twice unless the couple say so.
 */
export function skipReasonFor(
  kind: CampaignKind,
  party: Doc<"parties">,
  guests: readonly { invitedTo?: EventFlags }[],
  sends: readonly Doc<"sends">[],
  includeAlreadySent = false,
): SkipReason | null {
  if (party.respondedAt !== undefined) return "replied";
  if (party.earlyDecline) return "declinedEarly";

  const invited = partyInvitedTo(party, guests);
  if (!RSVP_EVENTS.some((event) => invited[event.key])) return "noEvents";
  if (!party.contactEmail?.trim()) return "noEmail";

  if (kind === "invite") {
    const emailed = sends.some((send) => send.channel === "email" && send.kind === "invite" && reachedResend(send));
    if (emailed && !includeAlreadySent) return "alreadySent";
  } else if (!sends.some((send) => send.kind === "invite" && reachedResend(send))) {
    return "notInvited";
  }
  return null;
}

export type InvitationProps = {
  displayName: string;
  events: { label: string; date: string }[];
  rsvpUrl: string;
  /** "Tuesday 1 June 2027". Absent while the couple have not set a deadline. */
  replyBy?: string;
};

export type InvitationMessage = { subject: string; template: CampaignKind; props: InvitationProps };

export const SUBJECTS: Record<CampaignKind, string> = {
  invite: "You are invited: Laura & Lucien, July 2027",
  reminder: "A gentle reminder from Laura & Lucien",
};

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * RSVP_DEADLINE as a guest reads a date, in UTC so an ISO date stays that date.
 * A value that is not a date leaves the line out: rsvp.ts already refuses
 * replies over it, and an email is no place to argue about it.
 */
export function replyByDate(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const at = new Date(Date.parse(raw));
  if (Number.isNaN(at.getTime())) return undefined;
  return `${DAYS[at.getUTCDay()]} ${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]} ${at.getUTCFullYear()}`;
}

function siteUrl(): string {
  return (process.env.SITE_URL ?? "https://www.lauralucien.com").replace(/\/+$/, "");
}

/**
 * What one party's email says. Built from fields listed one by one, like the
 * guest-facing projection in rsvp.ts: who, wave, notes and the rest are the
 * couple's private notes, and nothing here may carry them into an inbox.
 *
 * `link.sendId` joins the visit the link produces back to this email. A test
 * copy carries `test=1` instead, so the couple opening it on a phone where they
 * are not signed in does not count as the party having seen it.
 */
export function invitationMessage(
  kind: CampaignKind,
  party: Pick<Doc<"parties">, "displayName" | "token" | "invitedToPreWedding" | "invitedToWedding" | "invitedToBrunch">,
  guests: readonly { invitedTo?: EventFlags }[],
  link: { sendId?: Id<"sends">; test?: boolean } = {},
  options: { siteUrl?: string; deadline?: string } = {},
): InvitationMessage {
  const invited = partyInvitedTo(party, guests);
  const query = link.sendId ? `?s=${link.sendId}` : link.test ? "?test=1" : "";
  const replyBy = replyByDate(options.deadline ?? process.env.RSVP_DEADLINE);

  return {
    subject: SUBJECTS[kind],
    template: kind,
    props: {
      displayName: party.displayName,
      events: RSVP_EVENTS.filter((event) => invited[event.key]).map((event) => ({
        label: event.label,
        date: EVENT_DATES[event.key],
      })),
      rsvpUrl: `${options.siteUrl ?? siteUrl()}/rsvp/${party.token}${query}`,
      ...(replyBy ? { replyBy } : {}),
    },
  };
}

export async function guestsOf(ctx: QueryCtx, partyId: Id<"parties">) {
  return await ctx.db
    .query("guests")
    .withIndex("by_party", (q) => q.eq("partyId", partyId))
    .collect();
}

export async function sendsOf(ctx: QueryCtx, partyId: Id<"parties">) {
  return await ctx.db
    .query("sends")
    .withIndex("by_party", (q) => q.eq("partyId", partyId))
    .collect();
}

/** One party's email for the composer's preview, with the plain link a test copy has. */
export const composePreview = internalQuery({
  args: { kind: campaignKind, partyId: v.id("parties") },
  returns: v.union(v.null(), v.object({ subject: v.string(), template: campaignKind, props: v.any() })),
  handler: async (ctx, { kind, partyId }) => {
    await requireAdmin(ctx);
    const party = await ctx.db.get(partyId);
    if (!party) return null;
    return invitationMessage(kind, party, await guestsOf(ctx, partyId), { test: true });
  },
});

export const STOPPED = "Stopped before it was sent.";

/**
 * Hands one message of a run to Resend. Scheduled by `admin.startCampaign`, one
 * every SEND_SPACING_MS.
 *
 * The email is built here, not when the run started: a party that fixed its
 * address or got a new event in the minutes since gets the current version.
 * A row that is no longer waiting (stopped, or already gone) is left alone.
 */
export const dispatch = internalMutation({
  args: { sendId: v.id("sends") },
  returns: v.null(),
  handler: async (ctx, { sendId }) => {
    const send = await ctx.db.get(sendId);
    if (!send || send.status !== "queued" || send.scheduledId === undefined) return null;

    const campaign = send.campaignId ? await ctx.db.get(send.campaignId) : null;
    if (campaign?.status === "cancelled") {
      await ctx.db.patch(sendId, { status: "cancelled", scheduledId: undefined, error: STOPPED });
      return null;
    }

    const party = await ctx.db.get(send.partyId);
    const to = party?.contactEmail?.trim();
    if (!party || !to) {
      await ctx.db.patch(sendId, {
        status: "failed",
        scheduledId: undefined,
        failedAt: Date.now(),
        error: "The party no longer has an email address.",
      });
      return null;
    }

    const kind = send.kind === "reminder" ? "reminder" : "invite";
    const message = invitationMessage(kind, party, await guestsOf(ctx, party._id), { sendId });
    await ctx.scheduler.runAfter(0, internal.email.send.sendEmail, { to, ...message, sendId });
    await ctx.db.patch(sendId, { scheduledId: undefined, sentAt: Date.now(), to });
    return null;
  },
});
