import type { PartyLink, PartyWave, PartyWho } from "./guest-csv";

/**
 * Human labels for the party enums. The stored values are the sheet's codes
 * ("Lo", "Tier 1") already normalised; these turn them back into words.
 */

/** Short forms for the table, where the WHOSE lane is 90px wide. */
export const WHO_LABEL: Record<PartyWho, string> = {
  lucien: "Lucien",
  laura: "Laura",
  mutual: "Mutual",
  zeina: "Zeina",
  nayla: "Nayla",
};

/** Full forms for the form's dropdown, where there is room to be unambiguous. */
export const WHO_LONG_LABEL: Record<PartyWho, string> = {
  lucien: "Lucien",
  laura: "Laura",
  mutual: "Mutual",
  zeina: "Zeina & Michel",
  nayla: "Nayla & Paul",
};

export const WAVE_LABEL: Record<PartyWave, string> = {
  tier1: "Tier 1",
  tier2: "Tier 2",
};

export const LINK_LABEL: Record<PartyLink, string> = {
  family: "Family",
  friends: "Friends",
};

export type InviteFlag = "invitedToPreWedding" | "invitedToWedding" | "invitedToBrunch";

/**
 * The three events, in running order. `chip` is clipped so all three fit the
 * 190px INVITED TO lane; `label` is the full name used in the form and as the
 * chip's tooltip.
 */
export const INVITE_EVENTS: readonly { flag: InviteFlag; label: string; chip: string }[] = [
  { flag: "invitedToPreWedding", label: "Pre-wedding", chip: "Pre-wed" },
  { flag: "invitedToWedding", label: "Wedding", chip: "Wedding" },
  { flag: "invitedToBrunch", label: "Brunch", chip: "Brunch" },
];
