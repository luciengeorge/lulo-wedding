import type { Page } from "@playwright/test";

import { randomUUID } from "node:crypto";

import {
  ADMIN_STATE,
  backend,
  expect,
  GUEST_STATE,
  openAdmin,
  party,
  postResendEvent,
  resendEvent,
  signedWebhook,
  test,
  visit,
} from "../fixtures";

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

function seedEmailedInvite(): { sendId: string; resendId: string } {
  backend.seed([party({ token: TOKEN, displayName: "Amal", surname: "Khalil", contactEmail: EMAIL })]);
  const sendId = backend.seedSend({ token: TOKEN, channel: "email", kind: "invite", to: EMAIL });
  const resendId = `re_${randomUUID()}`;
  backend.linkSendToResend(sendId, resendId);
  return { sendId, resendId };
}

function emailStat(page: Page, label: string) {
  return page.getByRole("region", { name: "Funnel by channel" }).getByText(label, { exact: true }).locator("..");
}

function funnelStep(page: Page, label: string) {
  return page.getByRole("region", { name: "Invitation funnel" }).getByText(label, { exact: true }).locator("..");
}

function partyRow(page: Page, name: string) {
  return page.getByRole("row").filter({ has: page.getByText(name, { exact: true }) });
}

async function openTimeline(page: Page, name: string) {
  await page.getByRole("region", { name: "Engagement" }).getByRole("button", { name, exact: true }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText(name, { exact: true })).toBeVisible();
  return sheet;
}

test.describe("an emailed invitation", () => {
  test("shows delivery, two opens and a click to the couple", async ({ page, request }) => {
    const { resendId } = seedEmailedInvite();
    await openAdmin(page, "/admin/insights");
    await expect(emailStat(page, "Delivered")).toHaveText("Delivered0 parties · 0%");

    expect((await postResendEvent(request, resendEvent("email.delivered", resendId, EMAIL))).ok()).toBe(true);
    await expect(emailStat(page, "Delivered")).toHaveText("Delivered1 party · 100%");

    for (const type of ["email.opened", "email.opened", "email.clicked"] as const) {
      expect((await postResendEvent(request, resendEvent(type, resendId, EMAIL))).ok()).toBe(true);
    }
    await expect(emailStat(page, "Opened")).toHaveText("Opened1 party · 100%");
    await expect(emailStat(page, "Clicked")).toHaveText("Clicked1 party · 100%");
    await expect
      .poll(() => backend.activity(TOKEN).sends[0])
      .toEqual(expect.objectContaining({ status: "delivered", openCount: 2, clickCount: 1 }));

    const sheet = await openTimeline(page, "Amal");
    await expect(sheet.getByText(`Invitation emailed to ${EMAIL}`)).toBeVisible();
    await expect(sheet.getByText(/^Delivered/)).toBeVisible();
    await expect(sheet.getByText(/^Opened 2 times, last/)).toBeVisible();
    await expect(sheet.getByText(/^Link clicked once, last/)).toBeVisible();

    await openAdmin(page);
    await expect(funnelStep(page, "Opened email")).toHaveText("Opened email1party· of 1 emailed");
  });

  test("flags a bounce for follow-up, and a late delivery does not clear it", async ({ page, request }) => {
    const { resendId } = seedEmailedInvite();
    backend.seed([party({ token: "e2e-fine", displayName: "Bassam", surname: "Aoun" })]);
    await openAdmin(page);

    expect((await postResendEvent(request, resendEvent("email.bounced", resendId, EMAIL))).ok()).toBe(true);
    await expect(partyRow(page, "Amal").getByText("Email bounced")).toBeVisible();

    // Events arrive out of order. A delivery reported after the bounce is still
    // recorded (it stamps `deliveredAt`, which is the barrier here), but it must
    // not turn a bounced address back into a good one.
    expect((await postResendEvent(request, resendEvent("email.delivered", resendId, EMAIL))).ok()).toBe(true);
    await expect.poll(() => backend.activity(TOKEN).sends[0].deliveredAt).toBeDefined();
    expect(backend.activity(TOKEN).sends[0].status).toBe("bounced");
    await expect(partyRow(page, "Amal").getByText("Email bounced")).toBeVisible();

    await expect(funnelStep(page, "Email bounced")).toHaveText("Email bounced1party");
    await page.getByRole("button", { name: "Bounced", exact: true }).click();
    await expect(partyRow(page, "Amal")).toBeVisible();
    await expect(partyRow(page, "Bassam")).toHaveCount(0);
    await expect(page.getByText("Showing all 1 (filtered from 2)")).toBeVisible();

    await openAdmin(page, "/admin/insights");
    const engagement = page.getByRole("region", { name: "Engagement" });
    await expect(engagement.getByRole("row").filter({ hasText: "Amal" })).toContainText("Bounced");
    const sheet = await openTimeline(page, "Amal");
    await expect(sheet.getByText("Bounced: Mailbox does not exist")).toBeVisible();
  });

  test("refuses an event that is not signed with the webhook secret, and changes nothing", async ({
    page,
    request,
  }) => {
    const { resendId } = seedEmailedInvite();
    await openAdmin(page, "/admin/insights");

    const forged = resendEvent("email.opened", resendId, EMAIL);
    const wrongKey = await postResendEvent(request, forged, signedWebhook(forged, "whsec_bm90LXRoZS1zZWNyZXQ="));
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
    await expect(emailStat(page, "Delivered")).toHaveText("Delivered1 party · 100%");
    await expect(emailStat(page, "Opened")).toHaveText("Opened0 parties · 0%");
    expect(backend.activity(TOKEN).sends[0]).toEqual(expect.objectContaining({ openCount: 0, status: "delivered" }));
  });

  test("accepts and ignores an event for an email it never sent", async ({ page, request }) => {
    const { resendId } = seedEmailedInvite();
    await openAdmin(page, "/admin/insights");

    const stranger = await postResendEvent(request, resendEvent("email.bounced", `re_${randomUUID()}`, EMAIL));
    expect(stranger.ok()).toBe(true);

    expect((await postResendEvent(request, resendEvent("email.delivered", resendId, EMAIL))).ok()).toBe(true);
    await expect(emailStat(page, "Delivered")).toHaveText("Delivered1 party · 100%");
    await expect(emailStat(page, "Bounced")).toHaveText("Bounced0 parties · 0%");
  });
});

test.describe("a reply receipt", () => {
  /**
   * Receipts are tracked like any email, but they go to people who have already
   * replied, so they must not count towards the invitation funnel.
   */
  test("is tracked on the party's timeline without inflating the funnel", async ({ page, request, browser }) => {
    backend.seed([party({ token: TOKEN, displayName: "Amal", surname: "Khalil", headCount: 1 })]);

    const guestContext = await browser.newContext({ storageState: GUEST_STATE });
    const guest = await guestContext.newPage();
    await visit(guest, `/rsvp/${TOKEN}`);
    await guest.getByRole("button", { name: "REGRETFULLY DECLINE" }).click();
    await guest.getByLabel("Your email").fill(EMAIL);
    await guest.getByRole("button", { name: "SEND OUR REGRETS" }).click();
    await expect(guest.getByRole("heading", { name: "We will miss you" })).toBeVisible();
    await guestContext.close();

    await expect.poll(() => backend.activity(TOKEN).sends.map((send) => send.kind)).toEqual(["receipt"]);
    const resendId = `re_${randomUUID()}`;
    backend.linkSendToResend(backend.activity(TOKEN).sends[0]._id, resendId);
    for (const type of ["email.delivered", "email.opened"] as const) {
      expect((await postResendEvent(request, resendEvent(type, resendId, EMAIL))).ok()).toBe(true);
    }

    await openAdmin(page, "/admin/insights");
    const sheet = await openTimeline(page, "Amal");
    await expect(sheet.getByText(`Reply receipt emailed to ${EMAIL}`)).toBeVisible();
    await expect(sheet.getByText(/^Opened once, last/)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(emailStat(page, "Opened")).toHaveText("Opened0 parties");
    await expect(emailStat(page, "Emailed")).toHaveText("Emailed0 parties");
  });
});
