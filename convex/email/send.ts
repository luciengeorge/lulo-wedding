"use node";

import type { ReactElement } from "react";

import { render } from "@react-email/components";
import { v } from "convex/values";
import { Resend } from "resend";

import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
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
 * Internal action: render a React Email template and send via Resend.
 *
 * Called from auth flows, billing webhooks, scheduled jobs, etc. Use the
 * `"use node"` directive (above) so React Email's render runs in Node, not V8.
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
  },
  handler: async (ctx, { to, subject, template, props }) => {
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

    if (!apiKey || !from) {
      throw new Error("RESEND_API_KEY and RESEND_FROM_EMAIL must be set");
    }

    const resend = new Resend(apiKey);

    const result = await resend.emails.send({
      from,
      to,
      subject,
      html,
      text,
    });

    if (result.error) {
      throw new Error(`Resend error: ${result.error.message}`);
    }

    return { id: result.data?.id ?? null };
  },
});
