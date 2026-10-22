"use node";

import type { ReactElement } from "react";

import { v } from "convex/values";
import { render } from "react-email";
import { Resend as ResendSdk } from "resend";

import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { MONOGRAM_CID, MONOGRAM_PNG_BASE64 } from "./monogram";
import { resend } from "./resend";
import AccountDeletedEmail from "./templates/accountDeleted";
import ChangeEmail from "./templates/changeEmail";
import DeleteAccount from "./templates/deleteAccount";
import InviteEmail from "./templates/invite";
import MagicLinkEmail from "./templates/magicLink";
import ReminderEmail from "./templates/reminder";
import ResetPasswordEmail from "./templates/resetPassword";
import RsvpConfirmationEmail from "./templates/rsvpConfirmation";
import VerifyEmail from "./templates/verify";
import WelcomeEmail from "./templates/welcome";

const TEMPLATES = {
  welcome: WelcomeEmail,
  verify: VerifyEmail,
  resetPassword: ResetPasswordEmail,
  magicLink: MagicLinkEmail,
  changeEmail: ChangeEmail,
  deleteAccount: DeleteAccount,
  accountDeleted: AccountDeletedEmail,
  rsvpConfirmation: RsvpConfirmationEmail,
  invite: InviteEmail,
  reminder: ReminderEmail,
} as const;

export type TemplateName = keyof typeof TEMPLATES;

/** Guests answer these, so a reply should reach the couple rather than the sending address. */
const REPLYABLE: ReadonlySet<TemplateName> = new Set(["invite", "reminder"]);

export function buildTemplate(name: TemplateName, props: Record<string, unknown>): ReactElement {
  const Template = TEMPLATES[name] as (props: Record<string, unknown>) => ReactElement;
  return Template(props);
}

/**
 * Internal action: render a React Email template and queue it with the Resend
 * component.
 *
 * Called from auth flows, billing webhooks, scheduled jobs, etc. Use the
 * `"use node"` directive (above) so React Email's render runs in Node, not V8.
 *
 * `sendId` ties the message to a row in `sends`, so the webhook's delivery and
 * open events can be matched back to the party it went to. Auth email passes
 * none and is not tracked.
 */
type SendOptions = Parameters<ResendSdk["emails"]["send"]>[0];

/**
 * One send, retried briefly when Resend says we are going too fast. The
 * idempotency key (a request option, not an email header) makes a retry safe:
 * Resend sends a given key once.
 */
async function sendWithRetry(
  sdk: ResendSdk,
  options: SendOptions,
  idempotencyKey: string,
  attempt = 0,
): Promise<string> {
  const { data, error } = await sdk.emails.send(options, { idempotencyKey });
  if (data?.id) return data.id;

  if (error?.name === "rate_limit_exceeded" && attempt < 3) {
    await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
    return sendWithRetry(sdk, options, idempotencyKey, attempt + 1);
  }
  throw new Error(`Resend error: ${error?.message ?? "no id returned"}`);
}

export const sendEmail = internalAction({
  args: {
    to: v.string(),
    subject: v.string(),
    template: v.union(
      v.literal("welcome"),
      v.literal("verify"),
      v.literal("resetPassword"),
      v.literal("magicLink"),
      v.literal("changeEmail"),
      v.literal("deleteAccount"),
      v.literal("accountDeleted"),
      v.literal("rsvpConfirmation"),
      v.literal("invite"),
      v.literal("reminder"),
    ),
    props: v.any(),
    sendId: v.optional(v.id("sends")),
  },
  handler: async (ctx, { to, subject, template, props, sendId }) => {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL;
    const capture = process.env.E2E_CAPTURE_EMAILS === "1";

    let emailId;
    try {
      const element = buildTemplate(template, props ?? {});
      const html = await render(element);

      // The seam the browser tests use. Capturing the email rather than bypassing
      // the auth means the tests sign in through the real magic-link flow, and the
      // worst case if this flag ever leaked into production is undelivered mail
      // rather than a way to mint a session. Capturing deployments carry no Resend
      // credentials and should not need any.
      if (capture) {
        await ctx.runMutation(internal.email.captured.record, { to, subject, template, html });
        // As far as the app can tell, a captured email went out. Without this the
        // row would sit at "queued" on every deployment that captures.
        if (sendId) await ctx.runMutation(internal.sends.markSent, { sendId });
        return { id: null };
      }

      if (!apiKey || !from) {
        throw new Error("RESEND_API_KEY and RESEND_FROM_EMAIL must be set");
      }
      const text = await render(element, { plainText: true });
      // Sent directly, not through the component's batch queue: Resend's batch
      // endpoint takes no attachments, and the monogram travels as one. The
      // component still records the email, so status and webhooks work as before.
      const sdk = new ResendSdk(apiKey);
      const replyTo = REPLYABLE.has(template) ? process.env.SUPPORT_EMAIL : undefined;
      emailId = await resend.sendEmailManually(
        ctx,
        { from, to, subject, ...(replyTo ? { replyTo: [replyTo] } : {}) },
        (id) =>
          sendWithRetry(
            sdk,
            {
              from,
              to,
              subject,
              html,
              text,
              ...(replyTo ? { replyTo } : {}),
              attachments: html.includes(`cid:${MONOGRAM_CID}`)
                ? [{ filename: "monogram.png", content: MONOGRAM_PNG_BASE64, contentId: MONOGRAM_CID }]
                : undefined,
            },
            id,
          ),
      );
    } catch (error) {
      // Otherwise the row sits at "queued" forever and /admin reads it as in flight.
      // Failures after this point, inside the Resend component, are caught by the
      // `reconcileQueued` cron in convex/sends.ts.
      if (sendId) {
        await ctx.runMutation(internal.sends.markFailed, { sendId, error: String(error) });
      }
      throw error;
    }

    if (sendId) await ctx.runMutation(internal.sends.attachEmailId, { sendId, emailId });

    return { id: emailId };
  },
});
