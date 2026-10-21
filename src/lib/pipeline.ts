/**
 * Where each party has got to, for the board on /admin/insights.
 *
 * Pure and free of Convex imports, like party-filters.ts: `replyOutcome` runs
 * inside the `admin.pipeline` query, where the guest rows are, and
 * `derivePipeline` runs in the browser against the shared minute clock, so the
 * "7 days" and "14 days" flags move on their own without a refetch.
 */

import type { RsvpGuest, RsvpParty } from "./party-filters";
import type { EventFlags } from "./rsvp-rules";

import { deriveRsvp, hasReplied } from "./party-filters";
import { effectiveInvite, RSVP_EVENTS } from "./rsvp-rules";

export const STAGES = ["notInvited", "invited", "seen", "replied"] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABEL: Record<Stage, string> = {
  notInvited: "Not invited",
  invited: "Invited",
  seen: "Seen",
  replied: "Replied",
};

export type ReplyOutcome = "coming" | "partly" | "declined";

export const REPLY_OUTCOMES: readonly ReplyOutcome[] = ["coming", "partly", "declined"];

export const REPLY_LABEL: Record<ReplyOutcome, string> = {
  coming: "Coming",
  partly: "Partly",
  declined: "Declined",
};

export type AttentionFlag =
  | { kind: "emailBounced" }
  | { kind: "emailComplained" }
  | { kind: "emailFailed" }
  | { kind: "noEvents" }
  | { kind: "seenNoReply"; days: number }
  | { kind: "neverSeen"; days: number };

const DAY = 24 * 60 * 60 * 1000;
/** Long enough that a party who looked on Sunday is not chased on Monday. */
export const SEEN_NO_REPLY_DAYS = 7;
/** WhatsApp previews and busy inboxes: two weeks before an unopened invite is worth a nudge. */
export const NEVER_SEEN_DAYS = 14;

/**
 * What a reply amounts to, read through `deriveRsvp` so the board and the guest
 * list cannot disagree: the sheet's early "No" counts until the party replies
 * online, and then the online reply wins.
 *
 * "Coming" means every named seat said yes to something. A party that answered
 * for some seats, or where some said no, is "Partly": the couple cater against
 * those differently. Plus ones are left out, as they hold no seat of their own.
 */
export function replyOutcome(
  party: RsvpParty & { headCount: number },
  guests: readonly RsvpGuest[],
): ReplyOutcome | undefined {
  const rsvp = deriveRsvp(party, guests);
  if (rsvp.state === "declined") return "declined";
  if (rsvp.state === "attending") {
    const seatsComing = guests.filter((guest) => {
      if (guest.isPlusOne) return false;
      const invite = effectiveInvite(party, guest);
      return RSVP_EVENTS.some((event) => invite[event.key] && guest[event.key] === "yes");
    }).length;
    return seatsComing >= party.headCount ? "coming" : "partly";
  }
  // The form was sent but left nobody's answer behind. Still a reply, just not a whole one.
  return hasReplied(party) ? "partly" : undefined;
}

/** The facts the board needs about one party, as `admin.pipeline` returns them. */
export type PipelineFacts = {
  /** The first invitation on any channel. Absent: never sent one. */
  firstInvitedAt?: number;
  /** The latest visit, so a party who came back yesterday is not chased for one a fortnight ago. */
  lastVisitAt?: number;
  reply?: ReplyOutcome;
  /** The latest email's status, when it did not land. */
  emailTrouble?: "bounced" | "complained" | "failed";
  /** The party's flags OR any couple-named guest's own invite. */
  invitedTo: EventFlags;
};

export type PipelinePlacement = { stage: Stage; reply?: ReplyOutcome; flags: AttentionFlag[] };

/**
 * The furthest stage a party has reached, plus anything worth a look.
 *
 * Replied beats seen beats invited: a party who found their name and replied
 * without ever being sent anything still lands in Replied, not Not invited.
 * A party can sit in any stage and still be flagged.
 */
export function derivePipeline(facts: PipelineFacts, now: number): PipelinePlacement {
  const stage: Stage =
    facts.reply !== undefined
      ? "replied"
      : facts.lastVisitAt !== undefined
        ? "seen"
        : facts.firstInvitedAt !== undefined
          ? "invited"
          : "notInvited";

  const flags: AttentionFlag[] = [];
  if (facts.emailTrouble === "bounced") flags.push({ kind: "emailBounced" });
  if (facts.emailTrouble === "complained") flags.push({ kind: "emailComplained" });
  if (facts.emailTrouble === "failed") flags.push({ kind: "emailFailed" });
  if (!facts.invitedTo.preWedding && !facts.invitedTo.wedding && !facts.invitedTo.brunch) {
    flags.push({ kind: "noEvents" });
  }
  if (stage === "seen" && facts.lastVisitAt !== undefined) {
    const days = Math.floor((now - facts.lastVisitAt) / DAY);
    if (days >= SEEN_NO_REPLY_DAYS) flags.push({ kind: "seenNoReply", days });
  }
  if (stage === "invited" && facts.firstInvitedAt !== undefined) {
    const days = Math.floor((now - facts.firstInvitedAt) / DAY);
    if (days >= NEVER_SEEN_DAYS) flags.push({ kind: "neverSeen", days });
  }

  return { stage, ...(stage === "replied" ? { reply: facts.reply } : {}), flags };
}

/** One line per flag, in the couple's words. */
export function attentionReason(flag: AttentionFlag): string {
  switch (flag.kind) {
    case "emailBounced":
      return "Email bounced";
    case "emailComplained":
      return "Email marked as spam";
    case "emailFailed":
      return "Email failed";
    case "noEvents":
      return "Invited to no events";
    case "seenNoReply":
      return `Seen ${flag.days} days ago, no reply`;
    case "neverSeen":
      return `Invited ${flag.days} days ago, not seen`;
  }
}

export type StageCounts = Record<Stage, number>;

export function countStages(stages: readonly Stage[]): StageCounts {
  const counts: StageCounts = { notInvited: 0, invited: 0, seen: 0, replied: 0 };
  for (const stage of stages) counts[stage]++;
  return counts;
}

function share(part: number, whole: number): number | undefined {
  return whole === 0 ? undefined : Math.round((part / whole) * 100);
}

/**
 * Each step as a share of the one before, read off each party's own facts
 * rather than its lane. A sheet "No" lands in Replied but was never sent or
 * seen anything, so it must not count as invited or seen. That is the same
 * reading as `admin.funnel`'s per-channel rows: invited means an invite was
 * sent, seen means an invited party visited. Undefined with no base.
 *
 * - Invited: of every party on the list.
 * - Seen: of the invited.
 * - Replied: of the invited who have seen it.
 */
export function stageConversion(
  parties: readonly Pick<PipelineFacts, "firstInvitedAt" | "lastVisitAt" | "reply">[],
  stage: Stage,
): number | undefined {
  const invited = parties.filter((party) => party.firstInvitedAt !== undefined);
  const seen = invited.filter((party) => party.lastVisitAt !== undefined);
  switch (stage) {
    case "notInvited":
      return undefined;
    case "invited":
      return share(invited.length, parties.length);
    case "seen":
      return share(seen.length, invited.length);
    case "replied":
      return share(seen.filter((party) => party.reply !== undefined).length, seen.length);
  }
}
