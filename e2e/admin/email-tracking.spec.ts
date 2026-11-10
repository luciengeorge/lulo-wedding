import type { Page } from "@playwright/test";

import { randomBytes } from "node:crypto";
import { randomUUID } from "node:crypto";

import {
  ADMIN_STATE,
  backend,
  expect,
  funnelStep,
  invitedDetail,
  openAdmin,
  party,
  postResendEvent,
  resendEvent,
  showLane,
  signedWebhook,
  test,
  visit,
} from "../fixtures";
import { decline } from "../rsvp-form";

test.use({ storageState: ADMIN_STATE });

/**
 * Resend's webhook, end to end on the throwaway backend: a Svix-signed event is
 * posted to /resend-webhook, the Resend component matches it to the email it
 * recorded, its callback pool runs `sends.handleEmailEvent`, and the couple see
 * the result in /admin. Only the call to Resend's own API is skipped: the
 * fixture records the email as already accepted under a known id.
 */

const TOKEN = "e2e-tracking";
const EMAIL = "amal@example.com";

async function seedEmailedInvite(): Promise<{ sendId: string; resendId: string }> {
  await backend.seed([party({ token: TOKEN, displayName: "Amal", surname: "Khalil", contactEmail: EMAIL })]);
  const sendId = await backend.seedSend({ token: TOKEN, channel: "email", kind: "invite", to: EMAIL });
  const resendId = `re_${randomUUID()}`;
  await backend.linkSendToResend(sendId, resendId);
  return { sendId, resendId };
}

function partyRow(page: Page, name: string) {
  return page.getByRole("row").filter({ has: page.getByText(name, { exact: true }) });
}

/** Opens Amal's timeline from her card in one lane of the pipeline board. */
async function openTimeline(page: Page, lane: string) {
  await (await showLane(page, lane)).getByRole("button", { name: "Amal Khalil", exact: true }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("Amal Khalil", { exact: true })).toBeVisible();
  return sheet;
}

test.describe("an emailed invitation", () => {
  test("shows delivery, two opens and a click to the couple", async ({ page, request }) => {
    const { resendId } = await seedEmailedInvite();
    await openAdmin(page, "/admin?view=board");
    await expect(await invitedDetail(page)).toContainText("Emails: 1 sent, 0 opened");
    await page.keyboard.press("Escape");

    expect((await postResendEvent(request, resendEvent("email.delivered", resendId, EMAIL))).ok()).toBe(true);
    await expect.poll(async () => (await backend.activity(TOKEN)).sends[0].status).toBe("delivered");

    for (const type of ["email.opened", "email.opened", "email.clicked"] as const) {
      expect((await postResendEvent(request, resendEvent(type, resendId, EMAIL))).ok()).toBe(true);
    }
    await expect(await invitedDetail(page)).toContainText("Emails: 1 sent, 1 opened");
    await page.mouse.move(0, 0);
    await expect
      .poll(async () => (await backend.activity(TOKEN)).sends[0])
      .toEqual(expect.objectContaining({ status: "delivered", openCount: 2, clickCount: 1 }));

    const sheet = await openTimeline(page, "Invited");
    await expect(sheet.getByText(`Invitation emailed to ${EMAIL}`)).toBeVisible();
    await expect(sheet.getByText(/^Delivered/)).toBeVisible();
    await expect(sheet.getByText(/^Opened 2 times, last/)).toBeVisible();
    await expect(sheet.getByText(/^Link clicked once, last/)).toBeVisible();

    await openAdmin(page);
    await expect(await invitedDetail(page)).toContainText("1 opened");
  });

  test("flags a bounce for follow-up, and a late delivery does not clear it", async ({ page, request }) => {
    const { resendId } = await seedEmailedInvite();
    await backend.seed([party({ token: "e2e-fine", displayName: "Bassam", surname: "Aoun" })]);
    await openAdmin(page);

    expect((await postResendEvent(request, resendEvent("email.bounced", resendId, EMAIL))).ok()).toBe(true);
    await expect(partyRow(page, "Amal").getByText("Email bounced")).toBeVisible();

    // Events arrive out of order. A delivery reported after the bounce is still
    // recorded (it stamps `deliveredAt`, which is the barrier here), but it must
    // not turn a bounced address back into a good one.
    expect((await postResendEvent(request, resendEvent("email.delivered", resendId, EMAIL))).ok()).toBe(true);
    await expect.poll(async () => (await backend.activity(TOKEN)).sends[0].deliveredAt).toBeDefined();
    expect((await backend.activity(TOKEN)).sends[0].status).toBe("bounced");
    await expect(partyRow(page, "Amal").getByText("Email bounced")).toBeVisible();

    await expect(await invitedDetail(page)).toContainText("1 bounced");
    await page.mouse.move(0, 0);
    await page.getByRole("button", { name: "Bounced", exact: true }).click();
    await expect(partyRow(page, "Amal")).toBeVisible();
    await expect(partyRow(page, "Bassam")).toHaveCount(0);
    await expect(page.getByText("Showing all 1 (filtered from 2)")).toBeVisible();

    await openAdmin(page, "/admin?view=board");
    const attention = await showLane(page, "Needs attention");
    await expect(attention.getByRole("button", { name: "Amal Khalil", exact: true })).toContainText("Email bounced");
    const sheet = await openTimeline(page, "Invited");
    await expect(sheet.getByText("Bounced: Mailbox does not exist")).toBeVisible();
  });

  test("refuses an event that is not signed with the webhook secret, and changes nothing", async ({
    page,
    request,
  }) => {
    const { resendId } = await seedEmailedInvite();
    await openAdmin(page, "/admin?view=board");

    const forged = resendEvent("email.opened", resendId, EMAIL);
    const wrongKey = await postResendEvent(
      request,
      forged,
      signedWebhook(forged, `whsec_${randomBytes(24).toString("base64")}`),
    );
    expect(wrongKey.ok()).toBe(false);
    const unsigned = await postResendEvent(request, forged, { "content-type": "application/json" } as never);
    expect(unsigned.ok()).toBe(false);
    // A real signature over a different body does not cover this one.
    const tampered = await postResendEvent(
      request,
      forged,
      signedWebhook(resendEvent("email.delivered", resendId, EMAIL)),
    );
    expect(tampered.ok()).toBe(false);

    // A genuine event afterwards is the barrier: once it shows, anything the
    // forged ones could have done would have shown too.
    expect((await postResendEvent(request, resendEvent("email.delivered", resendId, EMAIL))).ok()).toBe(true);
    await expect.poll(async () => (await backend.activity(TOKEN)).sends[0].status).toBe("delivered");
    await expect(await invitedDetail(page)).toContainText("0 opened");
    expect((await backend.activity(TOKEN)).sends[0]).toEqual(
      expect.objectContaining({ openCount: 0, status: "delivered" }),
    );
  });

  test("accepts and ignores an event for an email it never sent", async ({ page, request }) => {
    const { resendId } = await seedEmailedInvite();
    await openAdmin(page, "/admin?view=board");

    const stranger = await postResendEvent(request, resendEvent("email.bounced", `re_${randomUUID()}`, EMAIL));
    expect(stranger.ok()).toBe(true);

    expect((await postResendEvent(request, resendEvent("email.delivered", resendId, EMAIL))).ok()).toBe(true);
    await expect.poll(async () => (await backend.activity(TOKEN)).sends[0].status).toBe("delivered");
    await expect(await invitedDetail(page)).toContainText("0 bounced");
  });
});

test.describe("a reply receipt", () => {
  /**
   * Receipts are tracked like any email, but they go to people who have already
   * replied, so they must not count towards the invitation funnel.
   */
  test("is tracked on the party's timeline without inflating the funnel", async ({ page, request, browser }) => {
    await backend.seed([party({ token: TOKEN, displayName: "Amal", surname: "Khalil", headCount: 1 })]);

    const guestContext = await browser.newContext();
    const guest = await guestContext.newPage();
    await visit(guest, `/rsvp/${TOKEN}`);
    await decline(guest, EMAIL);
    await expect(guest.getByRole("heading", { name: "We will miss you" })).toBeVisible();
    await guestContext.close();

    await expect.poll(async () => (await backend.activity(TOKEN)).sends.map((send) => send.kind)).toEqual(["receipt"]);
    const resendId = `re_${randomUUID()}`;
    await backend.linkSendToResend((await backend.activity(TOKEN)).sends[0]._id, resendId);
    for (const type of ["email.delivered", "email.opened"] as const) {
      expect((await postResendEvent(request, resendEvent(type, resendId, EMAIL))).ok()).toBe(true);
    }

    await openAdmin(page, "/admin?view=board");
    const sheet = await openTimeline(page, "Replied");
    await expect(sheet.getByText(`Reply receipt emailed to ${EMAIL}`)).toBeVisible();
    await expect(sheet.getByText(/^Opened once, last/)).toBeVisible();
    await page.keyboard.press("Escape");
    // The card shows no invitation email either: the receipt's open is not engagement.
    await expect(
      (await showLane(page, "Replied")).getByRole("button", { name: "Amal Khalil", exact: true }).getByText("Opened"),
    ).toHaveCount(0);
    // A receipt is not an invitation: nothing has been emailed in the funnel's terms.
    await expect(funnelStep(page, "Invited")).toContainText("Invited0of 1 party");
    await expect(funnelStep(page, "Invited").locator("[data-slot=invited-detail-trigger]")).toHaveCount(0);
  });
});
