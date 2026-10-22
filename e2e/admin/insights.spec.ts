import type { Locator, Page } from "@playwright/test";

import { randomUUID } from "node:crypto";

import {
  ADMIN_STATE,
  backend,
  expect,
  openAdmin,
  party,
  postResendEvent,
  resendEvent,
  showLane,
  test,
} from "../fixtures";

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
const DAY = 24 * HOUR;

async function scenario(request: Parameters<typeof postResendEvent>[0]) {
  const now = Date.now();
  await backend.seed([
    party({ token: "e2e-amal", displayName: "Amal", surname: "Khalil", contactEmail: "amal@example.com" }),
    party({ token: "e2e-bassam", displayName: "Bassam", surname: "Aoun", respondedAt: now - HOUR }),
    party({ token: "e2e-chadi", displayName: "Chadi", surname: "Mrad", earlyDecline: true }),
    party({ token: "e2e-dalia", displayName: "Dalia", surname: "Saab" }),
  ]);
  await backend.seedGuests("e2e-bassam", [{ firstName: "Bassam", lastName: "Aoun", wedding: "yes" }]);

  const sendId = await backend.seedSend({
    token: "e2e-amal",
    channel: "email",
    kind: "invite",
    to: "amal@example.com",
    sentAt: now - 6 * HOUR,
  });
  const resendId = `re_${randomUUID()}`;
  await backend.linkSendToResend(sendId, resendId);
  for (const type of ["email.delivered", "email.opened", "email.opened"] as const) {
    expect((await postResendEvent(request, resendEvent(type, resendId, "amal@example.com"))).ok()).toBe(true);
  }
  await expect.poll(async () => (await backend.activity("e2e-amal")).sends[0].openCount).toBe(2);

  await backend.seedSend({ token: "e2e-bassam", channel: "whatsapp", kind: "invite", sentAt: now - 5 * HOUR });
  for (const hoursAgo of [5, 4, 3])
    await backend.seedVisit({ token: "e2e-amal", source: "email", at: now - hoursAgo * HOUR });
  for (const hoursAgo of [2, 1])
    await backend.seedVisit({ token: "e2e-bassam", source: "link", at: now - hoursAgo * HOUR });
}

function funnelStep(page: Page, label: string) {
  return page.getByRole("region", { name: "Invitation funnel" }).getByText(label, { exact: true }).locator("..");
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
    await expect(page.getByText(/No invitations emailed yet/)).toHaveCount(0);
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

/**
 * The pipeline board. Eleven households, one for every place a party can land:
 *
 * - Not invited: Dalia (nothing yet), Karim (and invited to no events, so flagged).
 * - Invited: Elie (WhatsApp, yesterday), Fadi (emailed, and the email bounced),
 *   Imad (WhatsApp 20 days ago, never seen, so flagged).
 * - Seen: Amal (emailed, delivered and opened; first looked 9 days ago and came
 *   back today, so not chased), Joumana (looked 12 and 10 days ago and never
 *   answered, so flagged from the latest look).
 * - Replied: Ghada (coming), Bassam (named one of two seats: partly), Chadi (the
 *   sheet's early "No") and Hana (said no online).
 */
async function boardScenario(request: Parameters<typeof postResendEvent>[0]) {
  const now = Date.now();
  await backend.seed([
    party({ token: "e2e-amal", displayName: "Amal", surname: "Khalil", contactEmail: "amal@example.com" }),
    party({ token: "e2e-bassam", displayName: "Bassam", surname: "Aoun", respondedAt: now - HOUR, who: "lucien" }),
    party({ token: "e2e-chadi", displayName: "Chadi", surname: "Mrad", earlyDecline: true }),
    party({ token: "e2e-dalia", displayName: "Dalia", surname: "Saab", wave: "tier2" }),
    party({ token: "e2e-elie", displayName: "Elie", surname: "Nassar" }),
    party({ token: "e2e-fadi", displayName: "Fadi", surname: "Haddad", contactEmail: "fadi@example.com" }),
    party({ token: "e2e-ghada", displayName: "Ghada", surname: "Azar", headCount: 1, respondedAt: now - 2 * HOUR }),
    party({ token: "e2e-hana", displayName: "Hana", surname: "Daher", respondedAt: now - 3 * HOUR }),
    party({ token: "e2e-imad", displayName: "Imad", surname: "Saliba" }),
    party({ token: "e2e-joumana", displayName: "Joumana", surname: "Khoury" }),
    party({ token: "e2e-karim", displayName: "Karim", surname: "Fares", invitedToWedding: false }),
  ]);

  // Replies: one named seat of two, all of one, and a no from both.
  await backend.seedGuests("e2e-bassam", [{ firstName: "Bassam", lastName: "Aoun", wedding: "yes" }]);
  await backend.seedGuests("e2e-ghada", [{ firstName: "Ghada", lastName: "Azar", wedding: "yes" }]);
  await backend.seedGuests("e2e-hana", [
    { firstName: "Hana", lastName: "Daher", wedding: "no" },
    { firstName: "Rami", lastName: "Daher", wedding: "no" },
  ]);

  // WhatsApp stamps.
  for (const [token, daysAgo] of [
    ["e2e-bassam", 0.2],
    ["e2e-elie", 1],
    ["e2e-ghada", 1],
    ["e2e-imad", 20],
    ["e2e-joumana", 12],
  ] as const) {
    await backend.seedSend({ token, channel: "whatsapp", kind: "invite", sentAt: now - daysAgo * DAY });
  }

  // Emails, and what Resend's webhook says happened to them.
  for (const [token, to, events] of [
    ["e2e-amal", "amal@example.com", ["email.delivered", "email.opened"]],
    ["e2e-fadi", "fadi@example.com", ["email.bounced"]],
  ] as const) {
    const sendId = await backend.seedSend({ token, channel: "email", kind: "invite", to, sentAt: now - 6 * HOUR });
    const resendId = `re_${randomUUID()}`;
    await backend.linkSendToResend(sendId, resendId);
    for (const type of events)
      expect((await postResendEvent(request, resendEvent(type, resendId, to))).ok()).toBe(true);
  }
  await expect.poll(async () => (await backend.activity("e2e-fadi")).sends[0].status).toBe("bounced");
  await expect.poll(async () => (await backend.activity("e2e-amal")).sends[0].openCount).toBe(1);

  await backend.seedVisit({ token: "e2e-amal", source: "link", at: now - 9 * DAY });
  for (const hoursAgo of [5, 4, 3])
    await backend.seedVisit({ token: "e2e-amal", source: "email", at: now - hoursAgo * HOUR });
  await backend.seedVisit({ token: "e2e-bassam", source: "link", at: now - 2 * HOUR });
  for (const daysAgo of [12, 10])
    await backend.seedVisit({ token: "e2e-joumana", source: "link", at: now - daysAgo * DAY });
}

/** Card names in a lane or group, top to bottom. */
async function cards(region: Locator): Promise<string[]> {
  return await region.locator("[data-party]").evaluateAll((nodes) => nodes.map((node) => node.ariaLabel ?? ""));
}

function laneHeader(lane: Locator) {
  return lane.locator("header");
}

async function whatsappSends(token: string) {
  return (await backend.activity(token)).sends.filter((send) => send.channel === "whatsapp" && send.kind === "invite");
}

test.describe("the pipeline board", () => {
  // The eleven-party scenario is some twenty backend calls before the page even opens.
  test.describe.configure({ timeout: 120_000 });

  test("puts each party in the furthest stage it reached, and flags who needs a look", async ({ page, request }) => {
    await boardScenario(request);
    await openAdmin(page, "/admin/insights");

    const notInvited = await showLane(page, "Not invited");
    expect(await cards(notInvited)).toEqual(["Dalia Saab", "Karim Fares"]);
    await expect(laneHeader(notInvited)).toContainText("Not invited2");

    const invited = await showLane(page, "Invited");
    // Most recent activity first: Fadi's bounce came in just now.
    await expect.poll(() => cards(invited)).toEqual(["Fadi Haddad", "Elie Nassar", "Imad Saliba"]);
    await expect(laneHeader(invited)).toContainText("Invited3");
    await expect(laneHeader(invited)).toContainText("64% of the list");
    await expect(invited.getByRole("button", { name: "Fadi Haddad", exact: true })).toContainText("Bounced");

    const seen = await showLane(page, "Seen");
    expect(await cards(seen)).toEqual(["Amal Khalil", "Joumana Khoury"]);
    // Chadi and Hana replied without an invite on record, so they count towards
    // neither share: 7 of 11 were sent one, 3 of those 7 looked, 1 of those 3 replied.
    await expect(laneHeader(seen)).toContainText("43% of invited");
    const amal = seen.getByRole("button", { name: "Amal Khalil", exact: true });
    await expect(amal.getByText("Delivered", { exact: true })).toBeVisible();
    // Opened is the soft one, and says why on hover.
    await expect(amal.getByTitle(/hint, not proof/)).toHaveText(/^Opened/);
    // Last activity is the newest thing that happened, here the email being opened, with the exact time on hover.
    await expect(amal.locator("time")).toHaveText(/just now|minute/);
    await expect(amal.locator("time")).toHaveAttribute("title", /\d{4}/);

    const replied = await showLane(page, "Replied");
    await expect(laneHeader(replied)).toContainText("Replied4");
    await expect(laneHeader(replied)).toContainText("33% of seen");
    expect(await cards(replied.getByRole("region", { name: "Coming" }))).toEqual(["Ghada Azar"]);
    expect(await cards(replied.getByRole("region", { name: "Partly" }))).toEqual(["Bassam Aoun"]);
    // An online "no" and the sheet's early "No" are both declines.
    expect((await cards(replied.getByRole("region", { name: "Declined" }))).sort()).toEqual([
      "Chadi Mrad",
      "Hana Daher",
    ]);

    const attention = await showLane(page, "Needs attention");
    // Amal first looked 9 days ago but came back today, so she is not here.
    expect(await cards(attention)).toEqual(["Fadi Haddad", "Imad Saliba", "Joumana Khoury", "Karim Fares"]);
    await expect(attention.getByRole("button", { name: "Fadi Haddad", exact: true })).toContainText("Email bounced");
    await expect(attention.getByRole("button", { name: "Imad Saliba", exact: true })).toContainText(
      "Invited 20 days ago, not seen",
    );
    await expect(attention.getByRole("button", { name: "Joumana Khoury", exact: true })).toContainText(
      "Seen 10 days ago, no reply",
    );
    await expect(attention.getByRole("button", { name: "Karim Fares", exact: true })).toContainText(
      "Invited to no events",
    );

    // Each party credited to the channel that reached it first.
    const strip = page.getByRole("region", { name: "Funnel by channel" });
    await expect(strip.getByRole("group", { name: "Email first" })).toHaveText(
      "Email first2 invited→1 seen 50%→0 replied 0%",
    );
    await expect(strip.getByRole("group", { name: "WhatsApp first" })).toHaveText(
      "WhatsApp first5 invited→2 seen 40%→2 replied 40%",
    );
    await expect(strip.getByRole("group", { name: "Emails" }).getByText(/^\d+ delivered$/)).toHaveText("1 delivered");
    await expect(strip.getByRole("group", { name: "Emails" }).getByText(/^\d+ bounced$/)).toHaveText("1 bounced");
  });

  test("flags an email that failed to send, in its own words", async ({ page }) => {
    await backend.seed([
      party({ token: "e2e-lina", displayName: "Lina", surname: "Sfeir", contactEmail: "lina@example" }),
    ]);
    await backend.seedSend({
      token: "e2e-lina",
      channel: "email",
      kind: "invite",
      to: "lina@example",
      status: "failed",
    });
    await openAdmin(page, "/admin/insights");

    const attention = await showLane(page, "Needs attention");
    const lina = attention.getByRole("button", { name: "Lina Sfeir", exact: true });
    await expect(lina).toContainText("Email failed");
    await expect(lina).not.toContainText("Email bounced");
    expect(await cards(await showLane(page, "Invited"))).toEqual(["Lina Sfeir"]);
  });

  test("narrows the board by name and by filter", async ({ page, request }) => {
    await boardScenario(request);
    await openAdmin(page, "/admin/insights");

    await page.getByRole("searchbox", { name: "Search name or surname" }).fill("khoury");
    await expect(page.getByText("1 of 11 parties")).toBeVisible();
    expect(await cards(await showLane(page, "Seen"))).toEqual(["Joumana Khoury"]);
    expect(await cards(await showLane(page, "Invited"))).toEqual([]);

    await page.getByRole("button", { name: "Clear", exact: true }).click();
    await page.getByRole("combobox", { name: "Wave" }).click();
    await page.getByRole("option", { name: "Tier 2" }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByText("1 of 11 parties")).toBeVisible();
    expect(await cards(await showLane(page, "Not invited"))).toEqual(["Dalia Saab"]);
  });

  test("opens a party's timeline from its card, by click or Enter", async ({ page, request }) => {
    await boardScenario(request);
    await openAdmin(page, "/admin/insights");

    const seen = await showLane(page, "Seen");
    await seen.getByRole("button", { name: "Amal Khalil", exact: true }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByText("Amal Khalil", { exact: true })).toBeVisible();
    const entries = sheet.getByRole("listitem");
    await expect(entries).toHaveCount(5);
    await expect(entries.nth(0)).toContainText("Opened their invitation from an email");
    await expect(entries.nth(3)).toContainText("Invitation emailed to amal@example.com");
    await expect(entries.nth(3)).toContainText("Opened once, last");
    await expect(entries.nth(4)).toContainText("Opened their invitation from their link");
    await expect(sheet.getByRole("link")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();

    const replied = await showLane(page, "Replied");
    await replied.getByRole("button", { name: "Ghada Azar", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog").getByText("Ghada Azar", { exact: true })).toBeVisible();
    await expect(page.getByRole("dialog")).toContainText("Invitation sent on WhatsApp");
  });
});

/** Dragging needs the lanes side by side, so these run at desktop size on every engine. */
test.describe("dragging a party to Invited", () => {
  test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false });

  test.beforeEach(async () => {
    await backend.seed([
      party({ token: "e2e-dalia", displayName: "Dalia", surname: "Saab" }),
      party({ token: "e2e-amal", displayName: "Amal", surname: "Khalil" }),
    ]);
    await backend.seedVisit({ token: "e2e-amal", source: "link", at: Date.now() - HOUR });
  });

  async function dragTo(page: Page, card: Locator, target: Locator, check?: () => Promise<void>) {
    const from = await card.boundingBox();
    const to = await target.boundingBox();
    if (!from || !to) throw new Error("The card or the lane is not on screen");
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2 + 20, from.y + from.height / 2, { steps: 4 });
    await page.mouse.move(to.x + to.width / 2, to.y + 120, { steps: 12 });
    await check?.();
    await page.mouse.up();
  }

  test("only Invited takes the drop, it stamps WhatsApp, and Undo takes it back", async ({ page }) => {
    await openAdmin(page, "/admin/insights");
    const notInvited = page.getByRole("region", { name: "Not invited", exact: true });
    const invited = page.getByRole("region", { name: "Invited", exact: true });
    const seen = page.getByRole("region", { name: "Seen", exact: true });
    const dalia = notInvited.getByRole("button", { name: "Dalia Saab", exact: true });
    await expect(dalia).toHaveAttribute("aria-roledescription", "draggable");

    // Over Seen, the board says where a drop would land, and dropping there does nothing.
    await dragTo(page, dalia, seen, async () => {
      await expect(seen).toHaveAttribute("data-drop", "blocked");
      await expect(seen).toContainText("Only Invited takes a drop");
      await expect(invited).toHaveAttribute("data-drop", "accepts");
      await expect(invited).toContainText("Drop to mark invited on WhatsApp");
    });
    await expect(seen).not.toHaveAttribute("data-drop");
    expect(await cards(notInvited)).toEqual(["Dalia Saab"]);
    await expect(page.getByText(/as invited on WhatsApp$/)).toHaveCount(0);
    expect(await whatsappSends("e2e-dalia")).toHaveLength(0);

    await dragTo(page, dalia, invited);
    await expect(page.getByText("Marked Dalia Saab as invited on WhatsApp")).toBeVisible();
    await expect.poll(() => cards(invited)).toEqual(["Dalia Saab"]);
    expect(await cards(notInvited)).toEqual([]);
    await expect.poll(async () => (await whatsappSends("e2e-dalia")).length).toBe(1);
    await expect(page.getByRole("group", { name: "WhatsApp first" })).toContainText("1 invited");

    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByText("Undone: Dalia Saab no longer marked as invited on WhatsApp")).toBeVisible();
    await expect.poll(() => cards(notInvited)).toEqual(["Dalia Saab"]);
    expect(await whatsappSends("e2e-dalia")).toHaveLength(0);
  });

  test("works from the keyboard: Space, right arrow, Space", async ({ page }) => {
    await openAdmin(page, "/admin/insights");
    const invited = page.getByRole("region", { name: "Invited", exact: true });

    await page
      .getByRole("region", { name: "Not invited", exact: true })
      .getByRole("button", { name: "Dalia Saab", exact: true })
      .focus();
    await page.keyboard.press("Space");
    await expect(page.getByText("Picked up Dalia Saab.")).toBeAttached();
    await expect(invited).toHaveAttribute("data-drop", "accepts");
    // dnd-kit starts listening for arrows a tick after the pickup is announced, so
    // a press landing in that gap is lost. Pressing again is harmless: the arrow
    // always goes to the same lane.
    await expect(async () => {
      await page.keyboard.press("ArrowRight");
      await expect(page.getByText(/^Over Invited\. Drop to mark Dalia Saab/)).toBeAttached({ timeout: 1_000 });
    }).toPass({ timeout: 10_000 });
    await page.keyboard.press("Space");

    await expect(page.getByText("Marked Dalia Saab as invited on WhatsApp")).toBeVisible();
    await expect.poll(() => cards(invited)).toEqual(["Dalia Saab"]);
    await expect.poll(async () => (await whatsappSends("e2e-dalia")).length).toBe(1);
    // Picking up and dropping is not a click: the timeline stays shut.
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});

test.describe("on a 375px phone", () => {
  test.describe.configure({ timeout: 120_000 });

  test("lights up only the stage shown, and the lane names it", async ({ page, request }) => {
    await boardScenario(request);
    await openAdmin(page, "/admin/insights");

    const stages = page.getByRole("group", { name: "Stage" });
    const lanes = [
      { label: "Not invited", count: 2 },
      { label: "Invited", count: 3 },
      { label: "Seen", count: 2 },
      { label: "Replied", count: 4 },
      { label: "Needs attention", count: 4 },
    ];
    // Opens on Not invited, so tap it last as well as relying on the default.
    for (const { label, count } of [...lanes.slice(1), lanes[0]]) {
      const button = stages.getByRole("button", { name: `${label} ${count}`, exact: true });
      await button.click();
      await expect(button).toBeInViewport({ ratio: 1 });
      for (const other of lanes) {
        await expect(
          stages.getByRole("button", { name: `${other.label} ${other.count}`, exact: true }),
        ).toHaveAttribute("aria-pressed", String(other.label === label));
        await expect(page.getByRole("region", { name: other.label, exact: true })).toBeVisible({
          visible: other.label === label,
        });
      }
      const lane = page.getByRole("region", { name: label, exact: true });
      await expect(lane.getByRole("heading", { level: 2 })).toHaveText(label);
      await expect(lane.locator("header")).toContainText(`${label}${count}`);
    }
  });
  test.use({ viewport: { width: 375, height: 812 } });

  test("shows one stage at a time, marks invited from the card's menu, and never scrolls sideways", async ({
    page,
    request,
  }) => {
    await boardScenario(request);
    await openAdmin(page, "/admin/insights");

    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(await overflow()).toBeLessThanOrEqual(0);

    const notInvited = await showLane(page, "Not invited");
    await expect(page.getByRole("region", { name: "Seen", exact: true })).toBeHidden();
    // No drop target on screen, so the card is not draggable here: the menu does the move.
    await expect(notInvited.getByRole("button", { name: "Dalia Saab", exact: true })).not.toHaveAttribute(
      "aria-roledescription",
    );

    await notInvited.getByRole("button", { name: "Actions for Dalia Saab" }).click();
    await page.getByRole("menuitem", { name: "Mark invited on WhatsApp" }).click();
    await expect(page.getByText("Marked Dalia Saab as invited on WhatsApp")).toBeVisible();
    await expect.poll(() => cards(notInvited)).toEqual(["Karim Fares"]);
    await expect.poll(async () => (await whatsappSends("e2e-dalia")).length).toBe(1);

    const invited = await showLane(page, "Invited");
    await expect.poll(() => cards(invited)).toContain("Dalia Saab");

    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByText("Undone: Dalia Saab no longer marked as invited on WhatsApp")).toBeVisible();
    await expect.poll(() => cards(invited)).not.toContain("Dalia Saab");
    expect(await whatsappSends("e2e-dalia")).toHaveLength(0);

    for (const lane of ["Seen", "Replied", "Needs attention"]) {
      await showLane(page, lane);
      expect(await overflow()).toBeLessThanOrEqual(0);
    }
  });
});
