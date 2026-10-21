// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import type { EmailStatus } from "@convex-dev/resend";

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

import { internal } from "./_generated/api";
import schema from "./schema";
import { LOST_AFTER_MS, RECONCILE_AFTER_MS, reconcileWithStatus } from "./sends";

/** What the Resend component reports for each EmailId; absent means it has no record. */
const component = vi.hoisted(() => ({ statuses: new Map<string, unknown>() }));
vi.mock("./email/resend", () => ({
  resend: { status: vi.fn(async (_ctx: unknown, emailId: string) => component.statuses.get(emailId) ?? null) },
}));

const modules = import.meta.glob("./**/*.ts");
const NOW = Date.parse("2026-10-01T10:00:00.000Z");

function status(overrides: Partial<EmailStatus> = {}): EmailStatus {
  return {
    status: "queued",
    errorMessage: null,
    bounced: false,
    complained: false,
    failed: false,
    deliveryDelayed: false,
    opened: false,
    clicked: false,
    ...overrides,
  };
}

const send = (overrides: Partial<Doc<"sends">> = {}): Doc<"sends"> => ({
  _id: "s1" as Id<"sends">,
  _creationTime: 1,
  partyId: "p1" as Id<"parties">,
  channel: "email",
  kind: "invite",
  to: "rae@example.com",
  emailId: "email-1",
  status: "queued",
  sentAt: NOW - RECONCILE_AFTER_MS - 1,
  openCount: 0,
  clickCount: 0,
  ...overrides,
});

let parties = 0;
async function insertParty(ctx: MutationCtx): Promise<Id<"parties">> {
  parties++;
  return await ctx.db.insert("parties", {
    importKey: `k${parties}`,
    displayName: "Rae & Cherif",
    surname: "Haddad",
    token: `t${parties}`,
    headCount: 2,
    plusOneAllowed: false,
    link: "family",
    who: "laura",
    wave: "tier1",
    invitedToPreWedding: false,
    invitedToWedding: true,
    invitedToBrunch: false,
    saveTheDateSent: true,
    earlyDecline: false,
  });
}

describe("reconcileWithStatus", () => {
  it("marks a failed email failed, with the component's error", () => {
    expect(
      reconcileWithStatus(send(), status({ status: "failed", errorMessage: "Resend API error: 422" }), NOW),
    ).toEqual({ status: "failed", failedAt: NOW, error: "Resend API error: 422" });
  });

  it("marks a cancelled email failed, since it will never go out", () => {
    expect(
      reconcileWithStatus(
        send(),
        status({ status: "cancelled", errorMessage: "Resend API batch job was cancelled" }),
        NOW,
      ),
    ).toEqual({ status: "failed", failedAt: NOW, error: "Resend API batch job was cancelled" });
    expect(reconcileWithStatus(send(), status({ status: "cancelled" }), NOW)).toMatchObject({
      status: "failed",
      error: expect.any(String),
    });
  });

  it("marks an email the component has no record of failed", () => {
    expect(reconcileWithStatus(send(), null, NOW)).toMatchObject({ status: "failed", failedAt: NOW });
  });

  it("leaves an email still in the component's queue alone", () => {
    expect(reconcileWithStatus(send(), status({ status: "waiting" }), NOW)).toEqual({});
    expect(reconcileWithStatus(send(), status({ status: "queued" }), NOW)).toEqual({});
  });

  it("moves a sent, delayed or delivered email forward", () => {
    expect(reconcileWithStatus(send(), status({ status: "sent" }), NOW)).toEqual({ status: "sent" });
    expect(reconcileWithStatus(send(), status({ status: "delivery_delayed" }), NOW)).toEqual({
      status: "delivery_delayed",
    });
    expect(reconcileWithStatus(send(), status({ status: "delivered" }), NOW)).toEqual({
      status: "delivered",
      deliveredAt: NOW,
    });
  });

  it("records a bounce or a spam complaint the webhook missed", () => {
    expect(
      reconcileWithStatus(send(), status({ status: "bounced", bounced: true, errorMessage: "No mailbox" }), NOW),
    ).toEqual({ status: "bounced", bouncedAt: NOW, bounceReason: "No mailbox" });
    expect(reconcileWithStatus(send(), status({ status: "delivered", complained: true }), NOW)).toEqual({
      status: "complained",
      complainedAt: NOW,
    });
  });

  /** Same precedence as `applyEmailEvent`: nothing replaces a terminal status, nothing moves backwards. */
  it("never overrides a terminal status or drags a row backwards", () => {
    for (const terminal of ["bounced", "complained", "failed"] as const) {
      expect(reconcileWithStatus(send({ status: terminal }), status({ status: "delivered" }), NOW)).toEqual({});
      expect(reconcileWithStatus(send({ status: terminal }), null, NOW)).toEqual({});
    }
    expect(reconcileWithStatus(send({ status: "delivered" }), status({ status: "sent" }), NOW)).toEqual({
      status: "delivered",
    });
  });
});

describe("reconcileQueued", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    component.statuses.clear();
  });
  afterEach(() => vi.useRealTimers());

  async function insert(t: ReturnType<typeof convexTest>, overrides: Partial<Doc<"sends">>) {
    return await t.run(async (ctx) => {
      const partyId = await insertParty(ctx);
      const { _id, _creationTime, ...fields } = send({ partyId, ...overrides });
      return await ctx.db.insert("sends", fields);
    });
  }

  const read = (t: ReturnType<typeof convexTest>, id: Id<"sends">) => t.run((ctx) => ctx.db.get(id));

  it("settles stale queued rows from the component, and leaves the rest", async () => {
    const t = convexTest(schema, modules);
    const stale = NOW - RECONCILE_AFTER_MS - 1;

    component.statuses.set("failed", status({ status: "failed", errorMessage: "Resend API error: 500" }));
    component.statuses.set("cancelled", status({ status: "cancelled", errorMessage: "cancelled" }));
    component.statuses.set("delivered", status({ status: "delivered" }));
    component.statuses.set("waiting", status({ status: "waiting" }));
    component.statuses.set("fresh", status({ status: "failed" }));

    const failed = await insert(t, { emailId: "failed", sentAt: stale });
    const cancelled = await insert(t, { emailId: "cancelled", sentAt: stale });
    const delivered = await insert(t, { emailId: "delivered", sentAt: stale });
    const waiting = await insert(t, { emailId: "waiting", sentAt: stale });
    const fresh = await insert(t, { emailId: "fresh", sentAt: NOW - 1000 });
    const alreadySent = await insert(t, { emailId: "failed", sentAt: stale, status: "sent" });

    await t.mutation(internal.sends.reconcileQueued, {});

    expect(await read(t, failed)).toMatchObject({ status: "failed", failedAt: NOW, error: "Resend API error: 500" });
    expect(await read(t, cancelled)).toMatchObject({ status: "failed", error: "cancelled" });
    expect(await read(t, delivered)).toMatchObject({ status: "delivered", deliveredAt: NOW });
    expect(await read(t, waiting)).toMatchObject({ status: "queued" });
    // Too new to judge: the component may still be working on it.
    expect(await read(t, fresh)).toMatchObject({ status: "queued" });
    // Only queued rows are the cron's business; the webhook owns the rest.
    expect(await read(t, alreadySent)).toMatchObject({ status: "sent" });
  });

  it("fails a row that never got an EmailId, once it is clearly lost", async () => {
    const t = convexTest(schema, modules);
    const lost = await insert(t, { emailId: undefined, sentAt: NOW - LOST_AFTER_MS - 1 });
    const pending = await insert(t, { emailId: undefined, sentAt: NOW - RECONCILE_AFTER_MS - 1 });
    const whatsapp = await insert(t, { emailId: undefined, channel: "whatsapp", sentAt: NOW - LOST_AFTER_MS - 1 });

    await t.mutation(internal.sends.reconcileQueued, {});

    expect(await read(t, lost)).toMatchObject({ status: "failed", failedAt: NOW });
    expect(await read(t, pending)).toMatchObject({ status: "queued" });
    expect(await read(t, whatsapp)).toMatchObject({ status: "queued" });
  });
});

describe("markSent", () => {
  it("moves a queued row to sent and never drags a later status back", async () => {
    const t = convexTest(schema, modules);
    const [queued, delivered] = await t.run(async (ctx) => {
      const partyId = await insertParty(ctx);
      const fields = {
        partyId,
        channel: "email" as const,
        kind: "receipt" as const,
        sentAt: 1,
        openCount: 0,
        clickCount: 0,
      };
      return [
        await ctx.db.insert("sends", { ...fields, status: "queued" }),
        await ctx.db.insert("sends", { ...fields, status: "delivered" }),
      ];
    });

    await t.mutation(internal.sends.markSent, { sendId: queued });
    await t.mutation(internal.sends.markSent, { sendId: delivered });

    expect((await t.run((ctx) => ctx.db.get(queued)))?.status).toBe("sent");
    expect((await t.run((ctx) => ctx.db.get(delivered)))?.status).toBe("delivered");
  });
});
