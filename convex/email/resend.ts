import { Resend } from "@convex-dev/resend";

import { components, internal } from "../_generated/api";

/**
 * The Resend component: queued, retried, idempotent sends, plus the webhook that
 * reports what happened to each message afterwards.
 *
 * `testMode` defaults to true in the component, which silently drops every email
 * not addressed to a resend.dev test inbox. Real guests need it off.
 */
export const resend: Resend = new Resend(components.resend, {
  testMode: false,
  onEmailEvent: internal.sends.handleEmailEvent,
});
