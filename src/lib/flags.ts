/**
 * Build-time feature flags.
 *
 * Only the save-the-date ships today; everything else is written but must not be
 * reachable. That is a deploy-time on/off, not a rollout, so it is an environment
 * variable rather than PostHog: a dashboard toggle can be flipped by accident and
 * an unfinished RSVP form going live would take real replies from real guests.
 *
 * Set `VITE_FEATURE_RSVP=1` per environment on Vercel, so a preview deploy can
 * have it while production does not.
 */
export const FEATURES = {
  rsvp: import.meta.env.VITE_FEATURE_RSVP === "1",
} as const;
