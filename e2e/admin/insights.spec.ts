import type { Page } from "@playwright/test";

import { randomUUID } from "node:crypto";

import { ADMIN_STATE, backend, expect, openAdmin, party, postResendEvent, resendEvent, test } from "../fixtures";

test.use({ storageState: ADMIN_STATE });

/**
 * The numbers the couple will chase 400 households from. One scripted scenario,
 * small enough to count by hand:
 *
 * - Amal: emailed (delivered, opened twice), opened the link three times, no reply.
 * - Bassam: stamped as invited on WhatsApp, opened the link twice, replied.
 * - Chadi: never sent anything, but said no on the sheet (an early decline).
 * - Dalia: nothing at all.
 */

const HOUR = 60 * 60 * 1000;

async function scenario(request: Parameters<typeof postResendEvent>[0]) {
  const now = Date.now();
  backend.seed([
    party({ token: "e2e-amal", displayName: "Amal", surname: "Khalil", contactEmail: "amal@example.com" }),
    party({ token: "e2e-bassam", displayName: "Bassam", surname: "Aoun", respondedAt: now - HOUR }),
    party({ token: "e2e-chadi", displayName: "Chadi", surname: "Mrad", earlyDecline: true }),
    party({ token: "e2e-dalia", displayName: "Dalia", surname: "Saab" }),
  ]);
  backend.seedGuests("e2e-bassam", [{ firstName: "Bassam", lastName: "Aoun", wedding: "yes" }]);

  const sendId = backend.seedSend({
    token: "e2e-amal",
    channel: "email",
    kind: "invite",
    to: "amal@example.com",
    sentAt: now - 6 * HOUR,
  });
  const resendId = `re_${randomUUID()}`;
  backend.linkSendToResend(sendId, resendId);
  for (const type of ["email.delivered", "email.opened", "email.opened"] as const) {
    expect((await postResendEvent(request, resendEvent(type, resendId, "amal@example.com"))).ok()).toBe(true);
  }
  await expect.poll(() => backend.activity("e2e-amal").sends[0].openCount).toBe(2);

  backend.seedSend({ token: "e2e-bassam", channel: "whatsapp", kind: "invite", sentAt: now - 5 * HOUR });
  for (const hoursAgo of [5, 4, 3])
    backend.seedVisit({ token: "e2e-amal", source: "email", at: now - hoursAgo * HOUR });
  for (const hoursAgo of [2, 1]) backend.seedVisit({ token: "e2e-bassam", source: "link", at: now - hoursAgo * HOUR });
}

function funnelStep(page: Page, label: string) {
  return page.getByRole("region", { name: "Invitation funnel" }).getByText(label, { exact: true }).locator("..");
}

function channelRow(page: Page, label: string) {
  return page.getByRole("region", { name: "Funnel by channel" }).getByRole("row", { name: new RegExp(`^${label}`) });
}

function emailStat(page: Page, label: string) {
  return page.getByRole("region", { name: "Funnel by channel" }).getByText(label, { exact: true }).locator("..");
}

/** Party names in the engagement table, top to bottom. */
async function engagementOrder(page: Page): Promise<string[]> {
  const rows = page
    .getByRole("region", { name: "Engagement" })
    .getByRole("row")
    .filter({ has: page.getByRole("button") });
  return (await rows.locator("td:first-child").allTextContents()).map((name) => name.trim());
}

test.describe("the funnel above the guest list", () => {
  test("counts each stage in parties", async ({ page, request }) => {
    await scenario(request);
    await openAdmin(page);

    await expect(funnelStep(page, "Invited")).toHaveText("Invited2parties· 1 by email · 1 on WhatsApp");
    await expect(funnelStep(page, "Opened email")).toHaveText("Opened email1party· of 1 emailed");
    await expect(funnelStep(page, "Seen link")).toHaveText("Seen link2parties· 100% of invited");
    // Chadi's early "no" is a reply even though nothing was sent.
    await expect(funnelStep(page, "Replied")).toHaveText("Replied2parties· 100% of invited");
    await expect(funnelStep(page, "Email bounced")).toHaveText("Email bounced0parties");
    // Amal was emailed an invitation, so the zeros mean something and need no excuse.
    await expect(page.getByText(/Email invites aren't sent from here yet/)).toHaveCount(0);
  });

  test("shows each party's channel and when it was last seen", async ({ page, request }) => {
    await scenario(request);
    await openAdmin(page);

    const row = (name: string) => page.getByRole("row").filter({ has: page.getByText(name, { exact: true }) });
    await expect(row("Amal").getByRole("cell").nth(8)).toHaveText("Email");
    await expect(row("Amal").getByRole("cell").nth(9)).toHaveText("3 hours ago");
    await expect(row("Bassam").getByRole("cell").nth(8)).toHaveText("WhatsApp");
    await expect(row("Bassam").getByRole("cell").nth(9)).toHaveText("1 hour ago");
    await expect(row("Dalia").getByRole("cell").nth(8)).toHaveText("Not yet");
    await expect(row("Dalia").getByRole("cell").nth(9)).toHaveText("Never");

    // The one list worth chasing: looked, has not answered.
    await page.getByRole("button", { name: "Seen, not replied", exact: true }).click();
    await expect(page.getByRole("button", { name: "Seen, not replied", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(row("Amal")).toBeVisible();
    for (const name of ["Bassam", "Chadi", "Dalia"]) await expect(row(name)).toHaveCount(0);
    await expect(page.getByText("Showing all 1 (filtered from 4)")).toBeVisible();

    await page.getByRole("button", { name: "Seen, not replied", exact: true }).click();
    await expect(page.getByText("Showing all 4")).toBeVisible();
  });
});

test.describe("/admin/insights", () => {
  test("splits the funnel by the channel that reached each party first", async ({ page, request }) => {
    await scenario(request);
    await openAdmin(page, "/admin/insights");

    await expect(channelRow(page, "Email first").getByRole("cell")).toHaveText([
      "1 party",
      "1 party · 100%",
      "0 parties · 0%",
    ]);
    await expect(channelRow(page, "WhatsApp first").getByRole("cell")).toHaveText([
      "1 party",
      "1 party · 100%",
      "1 party · 100%",
    ]);
    await expect(channelRow(page, "Whole list").getByRole("cell")).toHaveText([
      "4 parties · 2 not sent yet",
      "2 parties · 50%",
      "2 parties · 50%",
    ]);

    await expect(emailStat(page, "Emailed")).toHaveText("Emailed1 party");
    await expect(emailStat(page, "Delivered")).toHaveText("Delivered1 party · 100%");
    await expect(emailStat(page, "Opened")).toHaveText("Opened1 party · 100%");
    await expect(emailStat(page, "Clicked")).toHaveText("Clicked0 parties · 0%");
    await expect(emailStat(page, "Bounced")).toHaveText("Bounced0 parties · 0%");
  });

  test("sorts the engagement table and narrows it to the people to chase", async ({ page, request }) => {
    await scenario(request);
    await openAdmin(page, "/admin/insights");
    const engagement = page.getByRole("region", { name: "Engagement" });

    // Most recently seen first, the never-seen at the bottom by name.
    await expect.poll(() => engagementOrder(page)).toEqual(["Bassam", "Amal", "Chadi", "Dalia"]);

    await engagement.getByRole("button", { name: /^Visits/ }).click();
    await expect.poll(() => engagementOrder(page)).toEqual(["Amal", "Bassam", "Chadi", "Dalia"]);
    await engagement.getByRole("button", { name: /^Visits/ }).click();
    await expect.poll(() => engagementOrder(page)).toEqual(["Chadi", "Dalia", "Bassam", "Amal"]);
    await engagement.getByRole("button", { name: /^Party/ }).click();
    await expect.poll(() => engagementOrder(page)).toEqual(["Amal", "Bassam", "Chadi", "Dalia"]);

    await engagement.getByRole("button", { name: /^Seen, not replied/ }).click();
    await expect.poll(() => engagementOrder(page)).toEqual(["Amal"]);
    await engagement.getByRole("button", { name: /^Never seen/ }).click();
    await expect.poll(() => engagementOrder(page)).toEqual(["Chadi", "Dalia"]);
  });

  test("opens one party's messages and visits, newest first", async ({ page, request }) => {
    await scenario(request);
    await openAdmin(page, "/admin/insights");

    await page.getByRole("region", { name: "Engagement" }).getByRole("button", { name: "Amal", exact: true }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByText("Amal", { exact: true })).toBeVisible();

    const entries = sheet.getByRole("listitem");
    await expect(entries).toHaveCount(4);
    await expect(entries.nth(0)).toContainText("Opened their invitation from an email");
    await expect(entries.nth(0)).toContainText("3 hours ago");
    await expect(entries.nth(2)).toContainText("5 hours ago");
    await expect(entries.nth(3)).toContainText("Invitation emailed to amal@example.com");
    await expect(entries.nth(3)).toContainText("Delivered");
    await expect(entries.nth(3)).toContainText("Opened 2 times, last");
    // Nothing on the timeline is a link into the party.
    await expect(sheet.getByRole("link")).toHaveCount(0);
    await expect(sheet).not.toContainText("e2e-amal");
  });
});
