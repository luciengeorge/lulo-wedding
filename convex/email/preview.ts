"use node";

import { ConvexError, v } from "convex/values";
import { render } from "react-email";

import { internal } from "../_generated/api";
import { action } from "../_generated/server";
import { campaignKind, type InvitationMessage } from "../campaigns";
import { MONOGRAM_CID } from "./monogram";
import { buildTemplate } from "./send";

/**
 * One party's invitation or reminder, rendered for the composer's preview.
 *
 * An action because rendering needs Node, the same as sending. The admin check
 * happens in `composePreview`, which runs as the signed-in caller.
 *
 * The monogram is an attachment referenced as `cid:monogram`, which a browser
 * cannot resolve, so the preview points it at the same artwork on the site.
 */
export const previewEmail = action({
  args: { kind: campaignKind, partyId: v.id("parties") },
  returns: v.object({ subject: v.string(), html: v.string() }),
  handler: async (ctx, { kind, partyId }): Promise<{ subject: string; html: string }> => {
    const message: InvitationMessage | null = await ctx.runQuery(internal.campaigns.composePreview, { kind, partyId });
    if (!message) throw new ConvexError("That party no longer exists");

    const html = await render(buildTemplate(message.template, message.props));
    return { subject: message.subject, html: html.replaceAll(`cid:${MONOGRAM_CID}`, "/art/monogram-email.png") };
  },
});
