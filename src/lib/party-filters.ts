/**
 * Search folding, the invite predicate, and RSVP derivation for the admin guest list.
 *
 * Deliberately free of Convex imports — `deriveRsvp` runs inside the
 * `admin.listParties` query while the rest drives TanStack Table's global filter
 * and column filters in the browser, and keeping it all pure means it can be
 * unit-tested without a deployment. Same reasoning as src/lib/guest-csv.ts.
 */

import type { PartyLink, PartyWave, PartyWho } from "./guest-csv";

/** Toolbar dropdown values. `"all"` is the no-filter sentinel the selects need. */
export type WaveFilter = "all" | PartyWave;
export type WhoFilter = "all" | PartyWho;
export type LinkFilter = "all" | PartyLink;
export type InvitedToFilter = "all" | "preWedding" | "wedding" | "brunch" | "none";

/** The subset of a party row the filters read. */
export type FilterableParty = {
  displayName: string;
  surname: string;
  invitedToPreWedding: boolean;
  invitedToWedding: boolean;
  invitedToBrunch: boolean;
};

/**
 * Folds a name for the search box: NFD, combining marks dropped, whitespace
 * collapsed, lowercased.
 *
 * Unlike `normaliseKeyPart` in guest-csv.ts this *does* strip accents. The two
 * want opposite things: a search that cannot find "Abou Jaoudé" when you type
 * "jaoude" is broken, whereas an import key that folded accents away could
 * collide two genuinely different families.
 */
export function foldForSearch(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * What the global filter matches against. Name and surname are searched as one
 * string so "rae cherif" and "cherif" both hit, without needing the couple to
 * know which column a word lives in.
 */
export function partySearchText(party: Pick<FilterableParty, "displayName" | "surname">): string {
  return foldForSearch(`${party.displayName} ${party.surname}`);
}

/** Backs the INVITED TO column's filter. `"none"` means invited to nothing yet. */
export function matchesInvitedTo(party: FilterableParty, invitedTo: InvitedToFilter): boolean {
  switch (invitedTo) {
    case "all":
      return true;
    case "preWedding":
      return party.invitedToPreWedding;
    case "wedding":
      return party.invitedToWedding;
    case "brunch":
      return party.invitedToBrunch;
    case "none":
      return !party.invitedToPreWedding && !party.invitedToWedding && !party.invitedToBrunch;
  }
}

export type RsvpState = "attending" | "declined" | "awaiting" | "notInvited";

export const RSVP_LABEL: Record<RsvpState, string> = {
  attending: "Attending",
  declined: "Declined",
  awaiting: "Awaiting reply",
  notInvited: "Not yet invited",
};

export type RsvpSummary = {
  state: RsvpState;
  /** Guests who said yes to at least one event this party is invited to. */
  attending: number;
  guestCount: number;
};

type RsvpStatus = "pending" | "yes" | "no";

export type RsvpParty = {
  earlyDecline: boolean;
  invitedToPreWedding: boolean;
  invitedToWedding: boolean;
  invitedToBrunch: boolean;
};

export type RsvpGuest = {
  preWedding: RsvpStatus;
  wedding: RsvpStatus;
  brunch: RsvpStatus;
};

/**
 * Collapses a party plus its guest rows into the one state the table shows.
 *
 * Only events the party is actually invited to are consulted: a `yes` on the
 * brunch from someone who was never invited to it is stale data, not an RSVP.
 * `earlyDecline` wins over everything — the sheet already recorded a "No", and
 * that is a real answer even though no guest row exists to carry it.
 */
export function deriveRsvp(party: RsvpParty, guests: readonly RsvpGuest[]): RsvpSummary {
  if (party.earlyDecline) {
    return { state: "declined", attending: 0, guestCount: guests.length };
  }

  const invitedToAnything = party.invitedToPreWedding || party.invitedToWedding || party.invitedToBrunch;

  const attending = guests.filter(
    (guest) =>
      (party.invitedToPreWedding && guest.preWedding === "yes") ||
      (party.invitedToWedding && guest.wedding === "yes") ||
      (party.invitedToBrunch && guest.brunch === "yes"),
  ).length;

  if (attending > 0) return { state: "attending", attending, guestCount: guests.length };

  // Guest rows only exist once a party has replied, so rows with nobody
  // attending mean the whole party declined.
  if (guests.length > 0) return { state: "declined", attending: 0, guestCount: guests.length };

  if (!invitedToAnything) return { state: "notInvited", attending: 0, guestCount: 0 };

  return { state: "awaiting", attending: 0, guestCount: 0 };
}
