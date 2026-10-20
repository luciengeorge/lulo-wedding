import { expect, test } from "@playwright/test";

import { convexSiteUrl, go, linkFromEmail, passProtection, required, smokeClient } from "./smoke";

/**
 * One guest's whole path on a preview, then the couple's view of it. The preview
 * captures mail instead of sending it, and the party is the preview's own smoke
 * party, reset at the start so a retry starts clean.
 */

const GUEST_EMAIL = "smoke-guest@example.com";

test("a guest gets in, finds their invitation, replies, and the couple see it", async ({
  browser,
  page,
  request,
  baseURL,
}) => {
  const password = required("PREVIEW_GUEST_PASSWORD");
  const secret = required("SMOKE_SECRET");
  const adminEmail = required("SMOKE_ADMIN_EMAIL");

  await passProtection(page.context(), baseURL!);
  const smoke = smokeClient(request, await convexSiteUrl(page), secret);
  const party = await smoke.reset();

  // The shared password.
  await expect(page).toHaveURL(/\/enter/);
  await expect(async () => {
    await page.getByLabel(/password from your invitation/i).fill(password);
    await expect(page.getByRole("button", { name: "ENTER" })).toBeEnabled({ timeout: 1_000 });
  }).toPass({ timeout: 30_000 });
  await page.getByRole("button", { name: "ENTER" }).click();
  await expect(page).toHaveURL(new URL("/", baseURL).toString());

  // A party's own link, cold: no password asked.
  const cold = await browser.newContext();
  await passProtection(cold, baseURL!);
  const coldPage = await cold.newPage();
  await go(coldPage, `/rsvp/${party.token}`);
  await expect(coldPage.getByRole("button", { name: "JOYFULLY ACCEPT" })).toBeVisible();
  await cold.close();

  // Lost the link: find it by name, then reply.
  await go(page, "/rsvp");
  await page.getByLabel("Your first and last name").fill("Smoke Preview");
  await page.getByRole("button", { name: "FIND MY INVITATION" }).click();
  await page.getByRole("link", { name: new RegExp(party.displayName) }).click();
  await page.getByRole("button", { name: "JOYFULLY ACCEPT" }).click();
  await page.getByLabel("First name, guest 1").fill("Smoke");
  await page.getByLabel("Last name, guest 1").fill("Preview");
  await page
    .getByRole("group", { name: "GUEST 1", exact: true })
    .getByRole("checkbox", { name: "Wedding", exact: true })
    .check({ force: true });
  await page.getByLabel("Your email").fill(GUEST_EMAIL);
  await page.getByRole("button", { name: "SEND OUR REPLY" }).click();
  await expect(page.getByText("Thank you")).toBeVisible();

  // The receipt, captured rather than sent, linking back to this party.
  await expect
    .poll(async () => (await smoke.latestEmail(GUEST_EMAIL))?.html ?? "", { timeout: 30_000 })
    .toContain(`/rsvp/${party.token}?s=`);

  // The couple sign in through the real magic link and see the reply.
  const previous = (await smoke.latestEmail(adminEmail))?.html ?? null;
  const admin = await browser.newContext();
  await passProtection(admin, baseURL!);
  const adminPage = await admin.newPage();
  await go(adminPage, "/login");
  await expect(async () => {
    await adminPage.getByLabel("Email").fill(adminEmail);
    await expect(adminPage.getByLabel("Email")).toHaveValue(adminEmail, { timeout: 1_000 });
    await adminPage.getByRole("button", { name: /Email me a sign-in link/i }).click();
    await expect(adminPage.getByText(/Check your inbox/i)).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 30_000 });
  let signIn = "";
  await expect
    .poll(
      async () => {
        const email = await smoke.latestEmail(adminEmail);
        signIn = email && email.html !== previous ? email.html : "";
        return signIn;
      },
      { timeout: 30_000 },
    )
    .not.toBe("");
  await adminPage.goto(linkFromEmail(signIn, "/api/auth"));
  await expect(adminPage).toHaveURL(/\/admin/);

  const row = adminPage.getByRole("row").filter({ has: adminPage.getByText(party.displayName, { exact: true }) });
  await expect(row).toContainText("1 coming");
  await expect(row).not.toContainText("Never");
  await expect(
    adminPage.getByRole("region", { name: "Invitation funnel" }).getByText("Replied", { exact: true }).locator(".."),
  ).not.toContainText("Replied0");
  await admin.close();
});
