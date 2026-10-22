import type { Page } from "@playwright/test";

import { ADMIN_STATE, backend, expect, openAdmin, party, test } from "../fixtures";

test.use({ storageState: ADMIN_STATE });

/**
 * Four households, small enough to count by hand:
 *
 * - Amal (4 seats, plus-one): emailed in a send run (delivered, opened), came
 *   from the email, and replied for 2 seats plus a vegan plus-one.
 * - Bassam (2 seats): invited on WhatsApp, opened the link, said no online.
 * - Chadi (3 seats): the sheet's early "No".
 * - Dalia (2 seats): nothing yet.
 */
const HOUR = 60 * 60 * 1000;

async function scenario() {
  const now = Date.now();
  await backend.seed([
    party({
      token: "e2e-amal",
      displayName: "Amal",
      surname: "Khalil",
      headCount: 4,
      plusOneAllowed: true,
      respondedAt: now - 2 * HOUR,
    }),
    party({ token: "e2e-bassam", displayName: "Bassam", surname: "Aoun", who: "lucien", respondedAt: now - HOUR }),
    party({ token: "e2e-chadi", displayName: "Chadi", surname: "Mrad", headCount: 3, earlyDecline: true }),
    party({ token: "e2e-dalia", displayName: "Dalia", surname: "Saab" }),
  ]);
  await backend.seedGuests("e2e-amal", [
    { firstName: "Amal", lastName: "Khalil", wedding: "yes" },
    { firstName: "Rami", lastName: "Khalil", wedding: "yes" },
    { firstName: "Joe", lastName: "Plus", isPlusOne: true, wedding: "yes", dietaryNotes: "Vegan" },
  ]);
  await backend.seedGuests("e2e-bassam", [{ firstName: "Bassam", lastName: "Aoun", wedding: "no" }]);

  const run = await backend.seedCampaign({ kind: "invite", createdAt: now - 6 * HOUR, total: 1 });
  await backend.seedSend({
    token: "e2e-amal",
    channel: "email",
    kind: "invite",
    to: "amal@example.com",
    status: "delivered",
    sentAt: now - 6 * HOUR,
    deliveredAt: now - 6 * HOUR + 1000,
    openCount: 1,
    campaignId: run,
  });
  await backend.seedSend({ token: "e2e-bassam", channel: "whatsapp", kind: "invite", sentAt: now - 5 * HOUR });
  await backend.seedVisit({ token: "e2e-amal", source: "email", at: now - 3 * HOUR });
  await backend.seedVisit({ token: "e2e-bassam", source: "link", at: now - 2 * HOUR });
}

const summaryOf = (page: Page, chart: string) =>
  page.getByRole("region", { name: chart, exact: true }).locator("[data-slot=chart-summary]");

test.describe("the dashboard", () => {
  test("states the key numbers in words and draws every chart", async ({ page }) => {
    await scenario();
    await openAdmin(page, "/admin/dashboard");

    await expect(summaryOf(page, "Seats per event")).toHaveText(
      "Wedding: 2 of 11 seats coming (+1 plus-one), 5 not coming, 4 no answer yet.",
    );
    await expect(summaryOf(page, "Projected headcount")).toContainText(
      "Wedding: 3 confirmed, 4 seats still to answer.",
    );
    await expect(page.getByText(/The projection appears after 10 replies \(3 so far\)/)).toBeVisible();
    await expect(summaryOf(page, "Plus-ones & dietary needs")).toHaveText("1 plus-one allowed, 1 named, 1 coming.");
    await expect(summaryOf(page, "Replies over time")).toContainText("1 party coming and 1 declined online over");
    await expect(summaryOf(page, "Replies over time")).toContainText("1 early decline from the sheet has no date");
    await expect(summaryOf(page, "Funnel by channel")).toHaveText(
      "Email first: 1 invited → 1 seen (100%) → 1 replied (100%).WhatsApp first: 1 invited → 1 seen (100%) → 1 replied (100%).",
    );
    await expect(summaryOf(page, "Email health per send run")).toContainText(
      "1 email, 1 delivered, 1 opened, 0 clicked, 0 bounced, 0 failed.",
    );
    await expect(summaryOf(page, "Visits per day")).toContainText("Direct link 1, Email button 1");

    // The dietary list is folded away until asked for.
    await page.getByText("1 guest coming with dietary notes").click();
    await expect(page.getByText("Vegan", { exact: true })).toBeVisible();

    await expect(page.locator(".viz-chart svg[role=img]")).toHaveCount(9);
    for (const svg of await page.locator(".viz-chart svg[role=img]").all()) {
      await expect(svg).toHaveAttribute("aria-label", /.+/);
    }
  });

  test("shows an intentional empty state before anyone has replied", async ({ page }) => {
    await backend.seed([party({ token: "e2e-dalia", displayName: "Dalia", surname: "Saab" })]);
    await openAdmin(page, "/admin/dashboard");

    await expect(page.getByRole("region", { name: "Replies over time" }).getByText("No replies yet")).toBeVisible();
    await expect(page.getByRole("region", { name: "Visits per day" }).getByText("No visits yet")).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Email health per send run" }).getByText("No emails sent yet"),
    ).toBeVisible();
  });

  test("fits a 375px phone without scrolling sideways", async ({ page }) => {
    await scenario();
    await page.setViewportSize({ width: 375, height: 812 });
    await openAdmin(page, "/admin/dashboard");
    await expect(page.locator(".viz-chart svg[role=img]")).toHaveCount(9);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
    const widths = await page
      .locator(".viz-chart svg[role=img]")
      .evaluateAll((svgs) => svgs.map((svg) => svg.getBoundingClientRect().right));
    for (const right of widths) expect(right).toBeLessThanOrEqual(375);
  });

  test("is a tab in the admin header", async ({ page }) => {
    await openAdmin(page);
    await page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Dashboard" }).click();
    await expect(page).toHaveURL(/\/admin\/dashboard$/);
    await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Dashboard" }),
    ).toHaveAttribute("data-status", "active");
  });
});
