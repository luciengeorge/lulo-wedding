import type { EmailEvent } from "@convex-dev/resend";

import { vOnEmailEventArgs } from "@convex-dev/resend";
import { v } from "convex/values";

import type { Doc } from "./_generated/dataModel";

import { internalMutation } from "./_generated/server";

/**
 * Outbound messages to parties, and what became of them.
 *
 * Email rows are written before the message is queued and matched back to it by
 * the Resend component's EmailId once queued. Delivery, open and click events
 * then arrive through the component's webhook into `handleEmailEvent`.
 */

type SendStatus = Doc<"sends">["status"];

/** Once one of these is recorded nothing later replaces it, whatever order events arrive in. */
const TERMINAL: ReadonlySet<SendStatus> = new Set(["bounced", "complained", "failed"]);

/**
 * How far along a message is. Webhook events can arrive out of order, and a late
 * `email.sent` must not drag a delivered message back to "sent".
 */
const PROGRESS: Record<SendStatus, number> = {
  queued: 0,
  sent: 1,
  delivery_delayed: 2,
  delivered: 3,
  bounced: 4,
  complained: 4,
  failed: 4,
};

function advance(current: SendStatus, next: SendStatus): SendStatus {
  if (TERMINAL.has(current)) return current;
  return PROGRESS[next] >= PROGRESS[current] ? next : current;
}

/**
 * The patch one webhook event makes to a send row. Pure, so the precedence rules
 * are tested without a database.
 *
 * Opens and clicks never move the status, they only stamp times and counters.
 * The clicked URL is never stored: every link in an invitation carries the
 * party's token.
 */
export function applyEmailEvent(send: Doc<"sends">, event: EmailEvent): Partial<Doc<"sends">> {
  const parsed = Date.parse(event.created_at);
  const at = Number.isNaN(parsed) ? Date.now() : parsed;

  switch (event.type) {
    case "email.sent":
      return { status: advance(send.status, "sent") };
    case "email.delivery_delayed":
      return { status: advance(send.status, "delivery_delayed") };
    case "email.delivered":
      return { status: advance(send.status, "delivered"), deliveredAt: send.deliveredAt ?? at };
    case "email.bounced":
      return TERMINAL.has(send.status)
        ? {}
        : { status: "bounced", bouncedAt: at, bounceReason: event.data.bounce.message };
    case "email.complained":
      return TERMINAL.has(send.status) ? {} : { status: "complained", complainedAt: at };
    case "email.failed":
      return TERMINAL.has(send.status) ? {} : { status: "failed", failedAt: at, error: event.data.failed.reason };
    case "email.opened":
      return {
        firstOpenedAt: Math.min(send.firstOpenedAt ?? at, at),
        lastOpenedAt: Math.max(send.lastOpenedAt ?? at, at),
        openCount: send.openCount + 1,
      };
    case "email.clicked":
      return {
        firstClickedAt: Math.min(send.firstClickedAt ?? at, at),
        lastClickedAt: Math.max(send.lastClickedAt ?? at, at),
        clickCount: send.clickCount + 1,
      };
  }
}

/**
 * The component's callback for every webhook event.
 *
 * Auth email (magic links, password resets) goes through the same component but
 * has no send row, so an unknown id is the ordinary case, not an error.
 */
export const handleEmailEvent = internalMutation({
  args: vOnEmailEventArgs,
  returns: v.null(),
  handler: async (ctx, { id, event }) => {
    const send = await ctx.db
      .query("sends")
      .withIndex("by_email_id", (q) => q.eq("emailId", id))
      .unique();
    if (!send) return null;

    const patch = applyEmailEvent(send, event);
    if (Object.keys(patch).length > 0) await ctx.db.patch(send._id, patch);
    return null;
  },
});

export const attachEmailId = internalMutation({
  args: { sendId: v.id("sends"), emailId: v.string() },
  returns: v.null(),
  handler: async (ctx, { sendId, emailId }) => {
    if (await ctx.db.get(sendId)) await ctx.db.patch(sendId, { emailId });
    return null;
  },
});

/** For a message that never reached the queue, such as a deployment missing its Resend key. */
export const markFailed = internalMutation({
  args: { sendId: v.id("sends"), error: v.string() },
  returns: v.null(),
  handler: async (ctx, { sendId, error }) => {
    if (await ctx.db.get(sendId)) await ctx.db.patch(sendId, { status: "failed", failedAt: Date.now(), error });
    return null;
  },
});
