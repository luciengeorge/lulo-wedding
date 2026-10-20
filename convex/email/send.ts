"use node";

import type { ReactElement } from "react";

import { v } from "convex/values";
import { render } from "react-email";

import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { resend } from "./resend";
import AccountDeletedEmail from "./templates/accountDeleted";
import ChangeEmail from "./templates/changeEmail";
import DeleteAccount from "./templates/deleteAccount";
import MagicLinkEmail from "./templates/magicLink";
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
} as const;

type TemplateName = keyof typeof TEMPLATES;

function buildTemplate(name: TemplateName, props: Record<string, unknown>): ReactElement {
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
    ),
    props: v.any(),
    sendId: v.optional(v.id("sends")),
  },
  handler: async (ctx, { to, subject, template, props, sendId }) => {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL;
    const capture = process.env.E2E_CAPTURE_EMAILS === "1";

    const element = buildTemplate(template, props ?? {});
    const html = await render(element);
    const text = await render(element, { plainText: true });

    // The seam the browser tests use. Capturing the email rather than bypassing
    // the auth means the tests sign in through the real magic-link flow, and the
    // worst case if this flag ever leaked into production is undelivered mail
    // rather than a way to mint a session. Capturing deployments carry no Resend
    // credentials and should not need any.
    if (capture) {
      await ctx.runMutation(internal.email.captured.record, { to, subject, template, html });
      return { id: null };
    }

    let emailId;
    try {
      if (!apiKey || !from) {
        throw new Error("RESEND_API_KEY and RESEND_FROM_EMAIL must be set");
      }
      emailId = await resend.sendEmail(ctx, { from, to, subject, html, text });
    } catch (error) {
      // Otherwise the row sits at "queued" forever and /admin reads it as in flight.
      if (sendId) {
        await ctx.runMutation(internal.sends.markFailed, { sendId, error: String(error) });
      }
      throw error;
    }

    if (sendId) await ctx.runMutation(internal.sends.attachEmailId, { sendId, emailId });

    return { id: emailId };
  },
});
