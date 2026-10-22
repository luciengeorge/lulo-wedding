import type { Page } from "@playwright/test";

import {
  ADMIN_EMAIL,
  ADMIN_STATE,
  backend,
  expect,
  linkFromEmail,
  openAdmin,
  party,
  showLane,
  test,
  waitForEmail,
  waitForHydration,
} from "../fixtures";

test.use({ storageState: ADMIN_STATE });

/**
 * Invitations and reminders emailed from /admin, end to end on the throwaway
 * backend: the composer, the paced run, the captured emails, and the link in
 * each one moving its party along the pipeline. Nothing reaches Resend: the
 * backend captures every email instead.
 */

const AMAL = { token: "e2e-amal", email: "amal@example.com" };
const BASSAM = { token: "e2e-bassam", email: "bassam@example.com" };
const INVITE_SUBJECT = "You are invited: Laura & Lucien, 17 July 2027";
const REMINDER_SUBJECT = "A gentle reminder from Laura & Lucien";
/**
 * A phone's mail app: no cookies at all. A bare `browser.newContext()` would
 * inherit this file's signed-in admin, whose visits are never counted.
 */
const MAIL_APP = { storageState: { cookies: [], origins: [] } };

async function select(page: Page, name: string) {
  await page.getByRole("checkbox", { name: `Select ${name}` }).click();
}

async function openComposer(page: Page) {
  await page.getByRole("button", { name: "Email…" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: /^Email \d+ part/ })).toBeVisible();
  return dialog;
}

function previewFrame(page: Page) {
  return page.frameLocator('iframe[title="Email preview"]');
}

test.describe("emailing invitations", () => {
  test("previews per party, sends a test to the admin only, then sends each party its own link", async ({
    page,
    browser,
  }) => {
    await backend.seed([
      party({ token: AMAL.token, displayName: "Amal", surname: "Khalil", contactEmail: AMAL.email }),
      party({ token: BASSAM.token, displayName: "Bassam", surname: "Aoun", contactEmail: BASSAM.email }),
      party({ token: "e2e-chadi", displayName: "Chadi", surname: "Mrad" }),
    ]);
    // Amal's mother is asked to the brunch as well, so Amal's email lists it.
    await backend.seedGuests(AMAL.token, [
      {
        firstName: "Hoda",
        lastName: "Khalil",
        addedByCouple: true,
        invitedTo: { preWedding: false, wedding: true, brunch: true },
      },
    ]);

    await openAdmin(page);
    await page.getByRole("checkbox", { name: "Select all 3 matching parties" }).click();
    const dialog = await openComposer(page);

    const recipients = dialog.getByRole("region", { name: "Recipients" });
    await expect(recipients).toContainText("2 parties will get the invitation");
    await recipients.getByText("No email address").click();
    await expect(recipients.getByText("Chadi Mrad")).toBeVisible();

    const preview = previewFrame(page);
    await expect(preview.getByText("Dear Amal,")).toBeVisible();
    await expect(preview.getByText("Brunch")).toBeVisible();
    await expect(preview.getByText("Saturday 17 July 2027")).toBeVisible();
    await expect(dialog.getByText(INVITE_SUBJECT)).toBeVisible();

    await dialog.getByRole("combobox", { name: "Preview for" }).click();
    await page.getByRole("option", { name: "Bassam Aoun" }).click();
    await expect(preview.getByText("Dear Bassam,")).toBeVisible();
    await expect(preview.getByText("Brunch")).toHaveCount(0);

    // The test goes to the signed-in admin, not to Bassam, and is not a send.
    await dialog.getByRole("button", { name: "Send me a test" }).click();
    await expect(page.getByText(`Test sent to ${ADMIN_EMAIL}`)).toBeVisible();
    await expect.poll(async () => (await backend.latestEmail(ADMIN_EMAIL))?.subject).toBe(`[Test] ${INVITE_SUBJECT}`);
    const testCopy = await backend.latestEmail(ADMIN_EMAIL);
    expect(testCopy?.html).toContain("Dear Bassam,");
    expect(await backend.emailCount(BASSAM.email)).toBe(0);
    expect((await backend.activity(BASSAM.token)).sends).toHaveLength(0);

    // Opening the test copy does not count as Bassam seeing his invitation.
    const testLink = linkFromEmail(testCopy?.html ?? "", `/rsvp/${BASSAM.token}`);
    expect(new URL(testLink).searchParams.get("test")).toBe("1");
    const outsider = await browser.newContext(MAIL_APP);
    const phone = await outsider.newPage();
    await phone.goto(testLink);
    await waitForHydration(phone);
    await expect(phone.getByText("Bassam").first()).toBeVisible();
    await outsider.close();
    expect((await backend.activity(BASSAM.token)).visits).toHaveLength(0);

    await dialog.getByRole("button", { name: "Send to 2 parties" }).click();
    const confirm = dialog.getByRole("group", { name: "Confirm" });
    await expect(confirm).toContainText("Send the invitation to 2 parties?");
    // A double click starts one run, not two.
    await confirm.getByRole("button", { name: "Yes, send to 2 parties" }).dblclick();

    const progress = dialog.getByRole("region", { name: "Progress" });
    await expect(progress.getByText("All sent")).toBeVisible();
    await expect(progress).toContainText("2 sent");

    const invite = await waitForEmail(AMAL.email);
    expect(invite.subject).toBe(INVITE_SUBJECT);
    expect(invite.template).toBe("invite");
    const [send] = (await backend.activity(AMAL.token)).sends;
    expect(send).toEqual(expect.objectContaining({ channel: "email", kind: "invite", to: AMAL.email }));
    const link = linkFromEmail(invite.html, `/rsvp/${AMAL.token}`);
    expect(new URL(link).searchParams.get("s")).toBe(send._id);
    expect((await waitForEmail(BASSAM.email)).html).toContain("Dear Bassam,");

    await page.waitForTimeout(1_500);
    expect(await backend.emailCount(AMAL.email)).toBe(1);
    expect(await backend.emailCount(BASSAM.email)).toBe(1);
    expect((await backend.activity("e2e-chadi")).sends).toHaveLength(0);

    await page.keyboard.press("Escape");
    await expect(page.getByRole("region", { name: "Recent sends" })).toContainText("Invitation to 2 parties");

    await openAdmin(page, "/admin/insights");
    await expect(
      (await showLane(page, "Invited")).getByRole("button", { name: "Amal Khalil", exact: true }),
    ).toBeVisible();

    // Amal opens it from her mail app.
    const mail = await browser.newContext(MAIL_APP);
    const guest = await mail.newPage();
    await guest.goto(link);
    await waitForHydration(guest);
    await expect(guest.getByText("Amal").first()).toBeVisible();
    await mail.close();

    await expect
      .poll(async () => (await backend.activity(AMAL.token)).visits)
      .toEqual([{ source: "email", sendId: send._id }]);
    await expect(
      (await showLane(page, "Seen")).getByRole("button", { name: "Amal Khalil", exact: true }),
    ).toBeVisible();
  });

  test("Stop sending cancels whatever has not gone yet", async ({ page }) => {
    const parties = Array.from({ length: 10 }, (_, index) =>
      party({
        token: `e2e-run-${index}`,
        displayName: `Guest${index}`,
        surname: "Run",
        contactEmail: `run${index}@example.com`,
      }),
    );
    await backend.seed(parties);

    await openAdmin(page);
    await page.getByRole("checkbox", { name: "Select all 10 matching parties" }).click();
    const dialog = await openComposer(page);
    await dialog.getByRole("button", { name: "Send to 10 parties" }).click();
    await dialog.getByRole("button", { name: "Yes, send to 10 parties" }).click();
    await dialog.getByRole("button", { name: "Stop sending" }).click();

    const progress = dialog.getByRole("region", { name: "Progress" });
    await expect(progress.getByText("Stopped", { exact: true })).toBeVisible();

    // Long enough for every send of the run to have gone out had it not been stopped.
    await page.waitForTimeout(7_000);
    const statuses = await Promise.all(
      parties.map(async (seeded) => (await backend.activity(seeded.token)).sends.map((send) => send.status)),
    );
    const flat = statuses.flat();
    expect(flat).toHaveLength(10);
    const cancelled = flat.filter((status) => status === "cancelled").length;
    expect(cancelled).toBeGreaterThan(0);
    expect(flat.filter((status) => status === "sent")).toHaveLength(10 - cancelled);

    const captured = await Promise.all(parties.map((seeded) => backend.emailCount(seeded.contactEmail ?? "")));
    expect(captured.reduce((sum, count) => sum + count, 0)).toBe(10 - cancelled);
    await expect(progress).toContainText(`Stopped: ${10 - cancelled} sent, ${cancelled} not sent`);
  });
});

test("leaves out an address that bounced before, and says so", async ({ page }) => {
  await backend.seed([
    party({ token: AMAL.token, displayName: "Amal", surname: "Khalil", contactEmail: AMAL.email }),
    party({ token: BASSAM.token, displayName: "Bassam", surname: "Aoun", contactEmail: BASSAM.email }),
  ]);
  await backend.seedSend({
    token: BASSAM.token,
    channel: "email",
    kind: "receipt",
    to: BASSAM.email,
    status: "bounced",
  });

  await openAdmin(page);
  await page.getByRole("checkbox", { name: "Select all 2 matching parties" }).click();
  const dialog = await openComposer(page);
  const recipients = dialog.getByRole("region", { name: "Recipients" });
  await expect(recipients).toContainText("1 party will get the invitation");
  await recipients.getByText("Email bounced before").click();
  await expect(recipients.getByText("Bassam Aoun")).toBeVisible();
});

test.describe("emailing reminders", () => {
  test("go only to invited parties who have not replied", async ({ page }) => {
    await backend.seed([
      party({ token: AMAL.token, displayName: "Amal", surname: "Khalil", contactEmail: AMAL.email }),
      party({
        token: BASSAM.token,
        displayName: "Bassam",
        surname: "Aoun",
        contactEmail: BASSAM.email,
        respondedAt: Date.now(),
      }),
      party({ token: "e2e-chadi", displayName: "Chadi", surname: "Mrad", contactEmail: "chadi@example.com" }),
    ]);
    await backend.seedSend({ token: AMAL.token, channel: "whatsapp", kind: "invite" });
    await backend.seedSend({ token: BASSAM.token, channel: "whatsapp", kind: "invite" });

    await openAdmin(page);
    await page.getByRole("checkbox", { name: "Select all 3 matching parties" }).click();
    const dialog = await openComposer(page);
    await dialog.getByRole("radio", { name: "Reminder" }).click();

    const recipients = dialog.getByRole("region", { name: "Recipients" });
    await expect(recipients).toContainText("1 party will get the reminder");
    await expect(recipients.getByText("Already replied")).toBeVisible();
    await expect(recipients.getByText("Not invited yet")).toBeVisible();
    await expect(previewFrame(page).getByText("A small nudge in case our invitation slipped past you.")).toBeVisible();

    await dialog.getByRole("button", { name: "Send to 1 party" }).click();
    await dialog.getByRole("button", { name: "Yes, send to 1 party" }).click();
    await expect(dialog.getByRole("region", { name: "Progress" }).getByText("All sent")).toBeVisible();

    const reminder = await waitForEmail(AMAL.email);
    expect(reminder.subject).toBe(REMINDER_SUBJECT);
    expect(reminder.template).toBe("reminder");
    const sent = (await backend.activity(AMAL.token)).sends.find((send) => send.kind === "reminder");
    expect(new URL(linkFromEmail(reminder.html, `/rsvp/${AMAL.token}`)).searchParams.get("s")).toBe(sent?._id);
    expect(await backend.emailCount(BASSAM.email)).toBe(0);
    expect(await backend.emailCount("chadi@example.com")).toBe(0);

    // The reminder counts in the email numbers; it does not make Amal invited by email.
    await openAdmin(page, "/admin/insights");
    await expect(page.getByRole("group", { name: "Emails" })).toContainText("1 sent");
    await expect(page.getByRole("group", { name: "Email first" })).toContainText("0 invited");
    await expect(page.getByText(/No invitations emailed yet/)).toHaveCount(0);
  });

  test("can be started from a lane of the pipeline", async ({ page }) => {
    await backend.seed([
      party({ token: AMAL.token, displayName: "Amal", surname: "Khalil", contactEmail: AMAL.email }),
      party({ token: "e2e-dana", displayName: "Dana", surname: "Saab" }),
    ]);
    await backend.seedSend({ token: AMAL.token, channel: "whatsapp", kind: "invite" });
    await backend.seedSend({ token: "e2e-dana", channel: "whatsapp", kind: "invite" });

    await openAdmin(page, "/admin/insights");
    const lane = await showLane(page, "Invited");
    await lane.getByRole("button", { name: "Remind this lane: Invited" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("radio", { name: "Reminder" })).toBeChecked();
    const recipients = dialog.getByRole("region", { name: "Recipients" });
    await expect(recipients).toContainText("1 party will get the reminder");
    await expect(recipients.getByText("No email address")).toBeVisible();
  });
});

test.describe("the composer on a phone", () => {
  test("fits a 375px screen without sideways scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    await backend.seed([
      party({ token: AMAL.token, displayName: "Amal", surname: "Khalil", contactEmail: AMAL.email }),
    ]);
    await openAdmin(page);
    await select(page, "Amal Khalil");
    const dialog = await openComposer(page);
    await expect(previewFrame(page).getByText("Dear Amal,")).toBeVisible();

    const box = await dialog.boundingBox();
    expect(box?.x).toBeGreaterThanOrEqual(0);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(375);
    const overflow = await dialog.evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(dialog.getByRole("button", { name: "Send to 1 party" })).toBeInViewport();
  });
});
