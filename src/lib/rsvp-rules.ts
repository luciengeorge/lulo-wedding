/**
 * The rules a reply has to satisfy, as pure functions.
 *
 * Free of Convex imports on purpose, the same way src/lib/party-filters.ts is:
 * `convex/rsvp.ts` enforces these server-side and the form runs the identical
 * checks in the browser, so a guest sees the problem next to the field instead
 * of as a rejected submit. One copy of the rules, two callers.
 */

/** The three events, and the party flag that says whether this party is asked about each. */
export const RSVP_EVENTS = [
  { key: "preWedding", invitedFlag: "invitedToPreWedding", label: "Pre-wedding" },
  { key: "wedding", invitedFlag: "invitedToWedding", label: "Wedding" },
  { key: "brunch", invitedFlag: "invitedToBrunch", label: "Brunch" },
] as const;

export type RsvpEventKey = (typeof RSVP_EVENTS)[number]["key"];
export type RsvpStatus = "pending" | "yes" | "no";

export type ReplyParty = {
  headCount: number;
  plusOneAllowed: boolean;
  invitedToPreWedding: boolean;
  invitedToWedding: boolean;
  invitedToBrunch: boolean;
};

type InviteFlags = Pick<ReplyParty, "invitedToPreWedding" | "invitedToWedding" | "invitedToBrunch">;

/** Which events one seat is asked about. */
export type EventFlags = Record<RsvpEventKey, boolean>;

/** One card on the form. `attending` only carries the events the party was asked about. */
export type ReplyGuest = {
  firstName: string;
  lastName: string;
  /** Absent means "this person has no email address", which the form asks explicitly. */
  email?: string;
  isPlusOne: boolean;
  attending: Partial<Record<RsvpEventKey, boolean>>;
  /** The couple's per-person invite, when they set one. Absent means the party's flags. */
  invitedTo?: EventFlags;
};

export type ReplyIssue = { guestIndex?: number; field?: string; message: string };

export function invitedEvents(party: InviteFlags): readonly RsvpEventKey[] {
  return RSVP_EVENTS.filter((event) => party[event.invitedFlag]).map((event) => event.key);
}

export function partyFlags(party: InviteFlags): EventFlags {
  return {
    preWedding: party.invitedToPreWedding,
    wedding: party.invitedToWedding,
    brunch: party.invitedToBrunch,
  };
}

/**
 * What one person is asked about. The party's flags are the default for every
 * seat the couple did not single out: unnamed seats, cards a guest adds, plus-ones.
 */
export function effectiveInvite(party: InviteFlags, guest: { invitedTo?: EventFlags }): EventFlags {
  return guest.invitedTo ?? partyFlags(party);
}

export function guestInvitedEvents(party: InviteFlags, guest: { invitedTo?: EventFlags }): readonly RsvpEventKey[] {
  const invite = effectiveInvite(party, guest);
  return RSVP_EVENTS.filter((event) => invite[event.key]).map((event) => event.key);
}

/**
 * Whether the party as a whole is asked about each event: its own flag, or any
 * one person the couple invited to it. Two of five asked to the brunch makes the
 * party a brunch party for counts and filters, without asking the other three.
 */
export function partyInvitedTo(party: InviteFlags, guests: readonly { invitedTo?: EventFlags }[]): EventFlags {
  const flags = partyFlags(party);
  for (const guest of guests) {
    if (!guest.invitedTo) continue;
    for (const event of RSVP_EVENTS) flags[event.key] ||= guest.invitedTo[event.key];
  }
  return flags;
}

/**
 * The stored status for one event.
 *
 * An event the party was never invited to stays `pending` rather than becoming
 * `no`: they did not decline it, they were never asked, and collapsing the two
 * would make the admin's counts lie.
 */
export function statusFor(invited: boolean, ticked: boolean | undefined): RsvpStatus {
  if (!invited) return "pending";
  return ticked ? "yes" : "no";
}

/** Trimmed, so a card holding only spaces counts as blank rather than as a person. */
export function isBlankCard(guest: ReplyGuest): boolean {
  return guest.firstName.trim() === "" && guest.lastName.trim() === "";
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isEmailish(value: string): boolean {
  return EMAIL.test(value.trim()) && value.trim().length <= 254;
}

/**
 * Validates a whole reply. Returns every problem at once rather than the first,
 * so a family of five is not walked through five separate submits.
 *
 * `existingPlusOne` matters: if the couple withdraw a plus-one after a party has
 * already named one, that named person stays valid. Rejecting them would trap the
 * party behind an error they cannot clear, and silently dropping a named human
 * from their reply is worse than either.
 */
export function validateReply(
  party: ReplyParty,
  guests: readonly ReplyGuest[],
  options: { existingPlusOne?: boolean } = {},
): ReplyIssue[] {
  const issues: ReplyIssue[] = [];
  const invited = partyInvitedTo(party, guests);

  if (!RSVP_EVENTS.some((event) => invited[event.key])) {
    return [{ message: "This invitation has no events attached to it yet." }];
  }

  const filled = guests.filter((guest) => !isBlankCard(guest));
  if (filled.length === 0) {
    return [{ message: "Tell us at least one name, or let us know you cannot make it." }];
  }

  const named = filled.filter((guest) => !guest.isPlusOne).length;
  if (named > party.headCount) {
    issues.push({
      message: `Your invitation is for ${party.headCount}, and this reply names ${named}. Get in touch and we will see what we can do.`,
    });
  }

  const plusOnes = filled.filter((guest) => guest.isPlusOne).length;
  const plusOneBudget = party.plusOneAllowed || options.existingPlusOne ? 1 : 0;
  if (plusOnes > plusOneBudget) {
    issues.push({
      message:
        plusOneBudget === 0 ? "This invitation does not include a plus one." : "This invitation includes one plus one.",
    });
  }

  guests.forEach((guest, guestIndex) => {
    if (isBlankCard(guest)) return;

    if (guest.firstName.trim() === "") {
      issues.push({ guestIndex, field: "firstName", message: "A first name, so we can write a place card." });
    }

    if (guest.email !== undefined && !isEmailish(guest.email)) {
      issues.push({ guestIndex, field: "email", message: "That does not look like an email address." });
    }

    // A name with no day ticked is the one genuinely ambiguous state: it reads
    // equally as "coming, forgot to say when" and as "not coming". Guessing
    // either way costs a seat, so ask.
    if (!guestInvitedEvents(party, guest).some((event) => guest.attending[event] === true)) {
      issues.push({
        guestIndex,
        field: "attending",
        message: `Which days is ${guest.firstName.trim() || "this guest"} coming? Leave the card blank if that seat is not being used.`,
      });
    }
  });

  return issues;
}

/** True when every named guest said no to everything they were asked about. */
export function isEffectiveDecline(party: ReplyParty, guests: readonly ReplyGuest[]): boolean {
  return guests
    .filter((guest) => !isBlankCard(guest))
    .every((guest) => !guestInvitedEvents(party, guest).some((event) => guest.attending[event] === true));
}

/**
 * How much of the invitation has been spoken for.
 *
 * A party may reply for some seats now and the rest later, so "3 of 4 seats" and
 * "4 of 4" are different states and both the confirmation screen and the admin
 * table have to tell them apart. Without this a partial reply looks finished.
 */
export function seatsAccountedFor(guests: readonly ReplyGuest[]): number {
  return guests.filter((guest) => !isBlankCard(guest) && !guest.isPlusOne).length;
}
