import { v } from "convex/values";

import type { EventFlags } from "../src/lib/rsvp-rules";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

import { SKIP_REASONS, type SkipReason } from "../src/lib/email-campaign";
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

export type { SkipReason };
export const skipReason = v.union(...SKIP_REASONS.map((reason) => v.literal(reason)));

/** Why a queued message was not sent after all, written on its row. */
const SKIPPED_AT_SEND: Record<SkipReason, string> = {
  replied: "they replied",
  declinedEarly: "they declined on the sheet",
  noEvents: "they are invited to no events",
  noEmail: "they have no email address",
  complained: "they marked our email as spam",
  bounced: "their address bounced before",
  alreadySent: "they were already emailed this invitation",
  notInvited: "their invitation never reached them",
};

export function normaliseEmail(address: string): string {
  return address.trim().toLowerCase();
}

/**
 * Addresses never to email again, from every party's sends. A bounce means the
 * address does not work; a complaint means its owner asked us to stop. Both are
 * by address, so a second party sharing a dead address is spared too.
 */
export type Suppression = { bounced: ReadonlySet<string>; complained: ReadonlySet<string> };

export async function loadSuppression(ctx: QueryCtx): Promise<Suppression> {
  const addresses = async (status: "bounced" | "complained") => {
    const rows = await ctx.db
      .query("sends")
      .withIndex("by_status", (q) => q.eq("status", status))
      .collect();
    return new Set(rows.flatMap((row) => (row.to ? [normaliseEmail(row.to)] : [])));
  };
  return { bounced: await addresses("bounced"), complained: await addresses("complained") };
}

/** An invitation that actually reached the party: not stopped, failed, bounced or reported as spam. */
const reachedThem = (send: Doc<"sends">) =>
  send.status !== "failed" && send.status !== "cancelled" && send.status !== "bounced" && send.status !== "complained";

/**
 * Why a party is left out of a run, or null when it should get the email. The
 * one rule set for the composer's breakdown, the start of a run and the moment
 * each message goes, so the three cannot disagree.
 *
 * A reply of any kind ends both emails: the sheet's early "No" as much as one
 * given on the form. An address that bounced or reported us as spam is never
 * mailed again, and a party that reported us is not mailed at any address. A
 * reminder only follows an invitation that reached them, on either channel, and
 * an invitation already emailed is not sent twice unless the couple say so.
 */
export function skipReasonFor(
  kind: CampaignKind,
  party: Doc<"parties">,
  guests: readonly { invitedTo?: EventFlags }[],
  sends: readonly Doc<"sends">[],
  options: { includeAlreadySent?: boolean; suppression?: Suppression } = {},
): SkipReason | null {
  if (party.respondedAt !== undefined) return "replied";
  if (party.earlyDecline) return "declinedEarly";

  const invited = partyInvitedTo(party, guests);
  if (!RSVP_EVENTS.some((event) => invited[event.key])) return "noEvents";
  const address = party.contactEmail ? normaliseEmail(party.contactEmail) : "";
  if (!address) return "noEmail";

  const suppression = options.suppression;
  if (sends.some((send) => send.status === "complained") || suppression?.complained.has(address)) {
    return "complained";
  }
  const bouncedHere = sends.some((send) => send.status === "bounced" && send.to && normaliseEmail(send.to) === address);
  if (bouncedHere || suppression?.bounced.has(address)) return "bounced";

  if (kind === "invite") {
    const emailed = sends.some((send) => send.channel === "email" && send.kind === "invite" && reachedThem(send));
    if (emailed && !options.includeAlreadySent) return "alreadySent";
  } else if (!sends.some((send) => send.kind === "invite" && reachedThem(send))) {
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
  invite: "You are invited: Laura & Lucien, 17 July 2027",
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
 * address or got a new event in the minutes since gets the current version,
 * and one that no longer qualifies is skipped, its row cancelled with the reason.
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
      await ctx.db.patch(sendId, { status: "cancelled", cancelKind: "stopped", scheduledId: undefined, error: STOPPED });
      return null;
    }

    const party = await ctx.db.get(send.partyId);
    if (!party) {
      await ctx.db.patch(sendId, {
        status: "cancelled",
        cancelKind: "skipped",
        scheduledId: undefined,
        error: "The party was deleted.",
      });
      return null;
    }

    // The same rules the run started with, asked again now: minutes have passed,
    // and a party may have replied or an address bounced in the meantime. This
    // row is left out, or it would count as the invitation already sent.
    const kind = send.kind === "reminder" ? "reminder" : "invite";
    const guests = await guestsOf(ctx, party._id);
    const sends = (await sendsOf(ctx, party._id)).filter((row) => row._id !== sendId);
    const reason = skipReasonFor(kind, party, guests, sends, {
      includeAlreadySent: campaign?.includeAlreadySent === true,
      suppression: await loadSuppression(ctx),
    });
    if (reason) {
      await ctx.db.patch(sendId, {
        status: "cancelled",
        cancelKind: "skipped",
        skipReason: reason,
        scheduledId: undefined,
        error: `Skipped at send time: ${SKIPPED_AT_SEND[reason]}.`,
      });
      return null;
    }

    const to = (party.contactEmail ?? "").trim();
    const message = invitationMessage(kind, party, guests, { sendId });
    await ctx.scheduler.runAfter(0, internal.email.send.sendEmail, { to, ...message, sendId });
    await ctx.db.patch(sendId, { scheduledId: undefined, sentAt: Date.now(), to });
    return null;
  },
});
