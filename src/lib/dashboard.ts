/**
 * The aggregates behind /admin/dashboard, as one pure pass over the guest list.
 *
 * Free of Convex imports like pipeline.ts: `admin.dashboard` feeds it the
 * tables it has already loaded, and the tests feed it plain objects. Every
 * reading of a reply goes through `deriveRsvp`, so a party counted as declined
 * here is the party the guest list shows as declined.
 */

import type { PartyLink, PartyWave, PartyWho } from "./guest-csv";
import type { RsvpGuest, RsvpParty } from "./party-filters";
import type { RsvpEventKey } from "./rsvp-rules";

import { deriveRsvp, hasReplied } from "./party-filters";
import { effectiveInvite, RSVP_EVENTS } from "./rsvp-rules";

const DAY = 24 * 60 * 60 * 1000;

/** Fewer replies than this and the yes-rate is noise, so the projection stays hidden. */
export const MIN_REPLIES_FOR_PROJECTION = 10;
/** Longer than any send run is worth plotting day by day on a phone. */
export const VISIT_DAYS = 60;
/** The latest runs; older ones are history nobody is acting on. */
export const CAMPAIGN_LIMIT = 8;
/** whereFrom is free text, so the long tail is folded into "Other". */
export const WHERE_FROM_LIMIT = 7;

export type VisitSource = "link" | "email" | "lookup" | "remembered";
export const VISIT_SOURCES: readonly VisitSource[] = ["link", "email", "lookup", "remembered"];

export type DashboardParty = RsvpParty & {
  headCount: number;
  plusOneAllowed: boolean;
  who: PartyWho;
  link: PartyLink;
  wave: PartyWave;
  whereFrom?: string;
  firstRespondedAt?: number;
};

export type DashboardGuest = RsvpGuest & {
  firstName: string;
  lastName: string;
  dietaryNotes?: string;
  preWeddingAt?: number;
  weddingAt?: number;
  brunchAt?: number;
};

/**
 * When the party first replied. `respondedAt` moves on every edit, so it is the
 * last resort. Replies from before `firstRespondedAt` existed fall back to the
 * earliest per-event answer, which only moves when that answer changes.
 */
function firstReplyAt(party: DashboardParty, guests: readonly DashboardGuest[]): number | undefined {
  if (party.firstRespondedAt !== undefined) return party.firstRespondedAt;
  if (party.respondedAt === undefined) return undefined;
  const answered = guests.flatMap((guest) => [guest.preWeddingAt, guest.weddingAt, guest.brunchAt]);
  return Math.min(party.respondedAt, ...answered.filter((at): at is number => at !== undefined));
}

export type DashboardSend = {
  channel: "email" | "whatsapp";
  kind: "invite" | "update" | "receipt" | "reminder";
  status: string;
  sentAt: number;
  deliveredAt?: number;
  openCount: number;
  clickCount: number;
  campaignId?: string;
};

export type DashboardVisit = { at: number; source: VisitSource };
export type DashboardCampaign = { id: string; kind: "invite" | "reminder"; createdAt: number };

export type DashboardEntry = {
  party: DashboardParty;
  guests: readonly DashboardGuest[];
  /** Sends that went out: rows stopped before sending are left out by the caller. */
  sends: readonly DashboardSend[];
  visits: readonly DashboardVisit[];
};

export type EventSeats = {
  event: RsvpEventKey;
  /** Named seats invited to this event. Plus-ones hold no seat. */
  seats: number;
  coming: number;
  notComing: number;
  noAnswer: number;
  plusOnesComing: number;
};

export type EventProjection = {
  event: RsvpEventKey;
  /** Seats and plus-ones who said yes. */
  confirmed: number;
  /** Seats nobody has answered for yet. */
  pending: number;
  /** Seats with an answer, the base of the yes-rate. */
  answered: number;
  /** Absent until there are enough replies to trust it. */
  projected?: number;
  yesRate?: number;
};

export type GroupRate = { group: string; base: number; replied: number; coming: number };
export type DayCount = { day: string; coming: number; declined: number };
export type CampaignHealth = {
  kind: "invite" | "reminder";
  createdAt: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  failed: number;
  complained: number;
};
export type ChannelFunnel = { parties: number; visited: number; replied: number };
export type VisitDay = { day: string } & Record<VisitSource, number>;

export const TIME_TO_REPLY_BINS = [
  { label: "<1", min: 0, max: 1 },
  { label: "1", min: 1, max: 2 },
  { label: "2", min: 2, max: 3 },
  { label: "3–6", min: 3, max: 7 },
  { label: "7–13", min: 7, max: 14 },
  { label: "14–29", min: 14, max: 30 },
  { label: "30+", min: 30, max: Number.POSITIVE_INFINITY },
] as const;

export type Dashboard = {
  parties: number;
  /** Parties with an answer of any kind, the sheet's early "No" included. */
  replies: number;
  seats: EventSeats[];
  projection: { minReplies: number; shown: boolean; events: EventProjection[] };
  plusOnes: { allowed: number; named: number; coming: number };
  dietary: { name: string; note: string }[];
  repliesOverTime: {
    days: DayCount[];
    campaigns: { day: string; kind: "invite" | "reminder" }[];
    /** Sheet declines carry no date, so they sit outside the timeline. */
    undatedDeclines: number;
  };
  groups: { who: GroupRate[]; link: GroupRate[]; wave: GroupRate[]; whereFrom: GroupRate[] };
  timeToReply: {
    bins: { label: string; parties: number }[];
    medianDays?: number;
    /** Replied without an invitation on record, or before it: found their own way in. */
    unprompted: number;
  };
  channels: { email: ChannelFunnel; whatsapp: ChannelFunnel };
  campaigns: CampaignHealth[];
  visits: { days: VisitDay[]; total: number; earlierDays: number };
};

export const dayKey = (at: number) => new Date(at).toISOString().slice(0, 10);

/** Every day from `first` to `last` inclusive, so quiet days still take a slot. */
function daysBetween(first: string, last: string): string[] {
  const days: string[] = [];
  for (let at = Date.parse(first); at <= Date.parse(last); at += DAY) days.push(dayKey(at));
  return days;
}

const isAnswered = (guest: RsvpGuest) => RSVP_EVENTS.some((event) => guest[event.key] !== "pending");

/** Says yes to something they were asked about. */
function attends(party: DashboardParty, guest: DashboardGuest): boolean {
  const invite = effectiveInvite(party, guest);
  return RSVP_EVENTS.some((event) => invite[event.key] && guest[event.key] === "yes");
}

/**
 * Seats per event for one party.
 *
 * A seat the couple gave its own invite follows that invite; every other seat
 * follows the party's flags. A whole-party decline (sheet or form) counts every
 * invited seat as not coming. Otherwise each named seat speaks for itself and
 * the rest are still waiting on an answer.
 */
function partySeats(party: DashboardParty, guests: readonly DashboardGuest[], declined: boolean): EventSeats[] {
  const named = guests.filter((guest) => !guest.isPlusOne);
  const ownInvite = named.filter((guest) => guest.invitedTo);
  const defaultSeats = Math.max(0, party.headCount - ownInvite.length);
  const answered = named.filter(isAnswered);

  return RSVP_EVENTS.map(({ key, invitedFlag }) => {
    const invited =
      (party[invitedFlag] ? defaultSeats : 0) + ownInvite.filter((guest) => guest.invitedTo?.[key]).length;
    if (declined) {
      return { event: key, seats: invited, coming: 0, notComing: invited, noAnswer: 0, plusOnesComing: 0 };
    }
    const asked = (guest: DashboardGuest) => effectiveInvite(party, guest)[key];
    const coming = answered.filter((guest) => asked(guest) && guest[key] === "yes").length;
    const notComing = answered.filter((guest) => asked(guest) && guest[key] === "no").length;
    const plusOnesComing = guests.filter((guest) => guest.isPlusOne && asked(guest) && guest[key] === "yes").length;
    // Stale data can name more people than seats; the answers win over the count.
    const seats = Math.max(invited, coming + notComing);
    return { event: key, seats, coming, notComing, noAnswer: seats - coming - notComing, plusOnesComing };
  });
}

function median(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

type GroupKey = keyof Dashboard["groups"];

function groupRates(counts: Map<string, GroupRate>): GroupRate[] {
  const share = (rate: GroupRate) => (rate.base === 0 ? -1 : rate.replied / rate.base);
  return [...counts.values()].sort((a, b) => share(b) - share(a) || b.base - a.base);
}

/** Keeps the biggest places and folds the tail into "Other", so the chart stays legible. */
function capWhereFrom(counts: Map<string, GroupRate>): Map<string, GroupRate> {
  const bySize = [...counts.values()].sort((a, b) => b.base - a.base);
  if (bySize.length <= WHERE_FROM_LIMIT + 1) return counts;
  const capped = new Map(bySize.slice(0, WHERE_FROM_LIMIT).map((rate) => [rate.group, rate]));
  const other: GroupRate = { group: "Other", base: 0, replied: 0, coming: 0 };
  for (const rate of bySize.slice(WHERE_FROM_LIMIT)) {
    other.base += rate.base;
    other.replied += rate.replied;
    other.coming += rate.coming;
  }
  capped.set(other.group, other);
  return capped;
}

export function buildDashboard(entries: readonly DashboardEntry[], campaigns: readonly DashboardCampaign[]): Dashboard {
  const seats = new Map<RsvpEventKey, EventSeats>(
    RSVP_EVENTS.map(({ key }) => [
      key,
      { event: key, seats: 0, coming: 0, notComing: 0, noAnswer: 0, plusOnesComing: 0 },
    ]),
  );
  const plusOnes = { allowed: 0, named: 0, coming: 0 };
  const dietary: Dashboard["dietary"] = [];
  const replyDays = new Map<string, { coming: number; declined: number }>();
  let undatedDeclines = 0;
  let replies = 0;
  const groups: Record<GroupKey, Map<string, GroupRate>> = {
    who: new Map(),
    link: new Map(),
    wave: new Map(),
    whereFrom: new Map(),
  };
  const replyDelays: number[] = [];
  let unprompted = 0;
  const channels = {
    email: { parties: 0, visited: 0, replied: 0 },
    whatsapp: { parties: 0, visited: 0, replied: 0 },
  };
  const campaignSends = new Map<string, DashboardSend[]>();
  const visitDays = new Map<string, Record<VisitSource, number>>();
  let visitTotal = 0;

  for (const { party, guests, sends, visits } of entries) {
    const rsvp = deriveRsvp(party, guests);
    const declined = rsvp.state === "declined";
    const replied = hasReplied(party);
    if (replied) replies++;

    for (const row of partySeats(party, guests, declined)) {
      const total = seats.get(row.event);
      if (!total) continue;
      total.seats += row.seats;
      total.coming += row.coming;
      total.notComing += row.notComing;
      total.noAnswer += row.noAnswer;
      total.plusOnesComing += row.plusOnesComing;
    }

    if (party.plusOneAllowed) plusOnes.allowed++;
    for (const guest of guests) {
      const coming = !declined && attends(party, guest);
      if (guest.isPlusOne && isAnswered(guest)) plusOnes.named++;
      if (guest.isPlusOne && coming) plusOnes.coming++;
      const note = guest.dietaryNotes?.trim();
      if (coming && note) dietary.push({ name: `${guest.firstName} ${guest.lastName}`.trim(), note });
    }

    const repliedAt = firstReplyAt(party, guests);
    if (repliedAt !== undefined && (rsvp.state === "attending" || declined)) {
      const day = dayKey(repliedAt);
      const counts = replyDays.get(day) ?? { coming: 0, declined: 0 };
      if (declined) counts.declined++;
      else counts.coming++;
      replyDays.set(day, counts);
    } else if (declined) {
      undatedDeclines++;
    }

    const invites = sends.filter((send) => send.kind === "invite").sort((a, b) => a.sentAt - b.sentAt);
    const firstInvite = invites[0];
    const groupKeys: Record<GroupKey, string> = {
      who: party.who,
      link: party.link,
      wave: party.wave,
      whereFrom: party.whereFrom?.trim() || "Not set",
    };
    // The base is everyone the question was put to: invited, or answered anyway.
    if (firstInvite || replied) {
      for (const key of Object.keys(groupKeys) as GroupKey[]) {
        const group = groupKeys[key];
        const rate = groups[key].get(group) ?? { group, base: 0, replied: 0, coming: 0 };
        rate.base++;
        if (replied) rate.replied++;
        if (rsvp.state === "attending") rate.coming++;
        groups[key].set(group, rate);
      }
    }

    if (repliedAt !== undefined) {
      if (firstInvite && repliedAt >= firstInvite.sentAt) {
        replyDelays.push((repliedAt - firstInvite.sentAt) / DAY);
      } else {
        unprompted++;
      }
    }

    // Same reading as `admin.funnel`'s byFirstChannel, so the two never disagree.
    if (firstInvite) {
      const bucket = channels[firstInvite.channel];
      bucket.parties++;
      if (visits.length > 0) bucket.visited++;
      if (replied) bucket.replied++;
    }

    for (const send of sends) {
      if (!send.campaignId) continue;
      const rows = campaignSends.get(send.campaignId);
      if (rows) rows.push(send);
      else campaignSends.set(send.campaignId, [send]);
    }

    for (const visit of visits) {
      const day = dayKey(visit.at);
      const counts = visitDays.get(day) ?? { link: 0, email: 0, lookup: 0, remembered: 0 };
      counts[visit.source]++;
      visitDays.set(day, counts);
      visitTotal++;
    }
  }

  // A run stopped before anything went out has no rows left here: no line on the
  // replies chart, no "0 emails" row, no slot taken from runs that did send.
  const orderedCampaigns = campaigns
    .filter((campaign) => campaignSends.has(campaign.id))
    .sort((a, b) => a.createdAt - b.createdAt);

  const sortedReplyDays = [...replyDays.keys()].sort();
  let days: DayCount[] = [];
  if (sortedReplyDays.length > 0) {
    const campaignDays = orderedCampaigns.map((campaign) => dayKey(campaign.createdAt));
    const span = [...sortedReplyDays, ...campaignDays].sort();
    let coming = 0;
    let declined = 0;
    days = daysBetween(span[0], span[span.length - 1]).map((day) => {
      coming += replyDays.get(day)?.coming ?? 0;
      declined += replyDays.get(day)?.declined ?? 0;
      return { day, coming, declined };
    });
  }

  const sortedVisitDays = [...visitDays.keys()].sort();
  let visitSeries: VisitDay[] = [];
  let earlierDays = 0;
  if (sortedVisitDays.length > 0) {
    const all = daysBetween(sortedVisitDays[0], sortedVisitDays[sortedVisitDays.length - 1]);
    earlierDays = Math.max(0, all.length - VISIT_DAYS);
    visitSeries = all.slice(earlierDays).map((day) => ({
      day,
      ...(visitDays.get(day) ?? { link: 0, email: 0, lookup: 0, remembered: 0 }),
    }));
  }

  const seatRows = [...seats.values()];

  return {
    parties: entries.length,
    replies,
    seats: seatRows,
    projection: {
      minReplies: MIN_REPLIES_FOR_PROJECTION,
      shown: replies >= MIN_REPLIES_FOR_PROJECTION,
      events: seatRows.map((row) => {
        const confirmed = row.coming + row.plusOnesComing;
        const answered = row.coming + row.notComing;
        const base = { event: row.event, confirmed, pending: row.noAnswer, answered };
        if (replies < MIN_REPLIES_FOR_PROJECTION || answered === 0) return base;
        const yesRate = row.coming / answered;
        return { ...base, yesRate, projected: confirmed + Math.round(row.noAnswer * yesRate) };
      }),
    },
    plusOnes,
    dietary: dietary.sort((a, b) => a.name.localeCompare(b.name)),
    repliesOverTime: {
      days,
      campaigns: orderedCampaigns.map((campaign) => ({ day: dayKey(campaign.createdAt), kind: campaign.kind })),
      undatedDeclines,
    },
    groups: {
      who: groupRates(groups.who),
      link: groupRates(groups.link),
      wave: groupRates(groups.wave),
      whereFrom: groupRates(capWhereFrom(groups.whereFrom)),
    },
    timeToReply: {
      bins: TIME_TO_REPLY_BINS.map((bin) => ({
        label: bin.label,
        parties: replyDelays.filter((days) => days >= bin.min && days < bin.max).length,
      })),
      medianDays: median(replyDelays),
      unprompted,
    },
    channels,
    campaigns: orderedCampaigns.slice(-CAMPAIGN_LIMIT).map((campaign) => {
      const rows = campaignSends.get(campaign.id) ?? [];
      return {
        kind: campaign.kind,
        createdAt: campaign.createdAt,
        sent: rows.length,
        // An open or a click proves delivery even when the delivered event was lost.
        delivered: rows.filter((row) => row.deliveredAt !== undefined || row.openCount > 0 || row.clickCount > 0)
          .length,
        opened: rows.filter((row) => row.openCount > 0).length,
        clicked: rows.filter((row) => row.clickCount > 0).length,
        bounced: rows.filter((row) => row.status === "bounced").length,
        failed: rows.filter((row) => row.status === "failed").length,
        complained: rows.filter((row) => row.status === "complained").length,
      };
    }),
    visits: { days: visitSeries, total: visitTotal, earlierDays },
  };
}
