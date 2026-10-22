/**
 * Limits for emailing invitations and reminders from /admin. Shared by
 * convex/campaigns.ts, which enforces them, and the composer, which explains them.
 */

/**
 * Resend allows two requests a second unless asked for more. One every 600 ms
 * stays under that with room for a reply receipt going out at the same moment.
 */
export const SEND_SPACING_MS = 600;

/** The whole guest list with room to spare, and well inside a mutation's 1,000 scheduled jobs. */
export const MAX_CAMPAIGN = 500;

/** Why a party is left out of a run, at the start or at the moment its email would go. */
export const SKIP_REASONS = [
  "replied",
  "declinedEarly",
  "noEvents",
  "noEmail",
  "complained",
  "bounced",
  "alreadySent",
  "notInvited",
] as const;
export type SkipReason = (typeof SKIP_REASONS)[number];

/** Resend's free plan. A bigger run is warned about, not refused: the couple may be on a paid plan. */
export const FREE_PLAN_DAILY_LIMIT = 100;
