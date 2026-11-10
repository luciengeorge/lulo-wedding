import { expect, test } from "@playwright/test";

import { convexSiteUrl, go, linkFromEmail, passProtection, required, smokeClient } from "./smoke";

/**
 * One guest's whole path on a preview, then the couple's view of it. The preview
 * captures mail instead of sending it, and the party is the preview's own smoke
 * party, reset at the start so a retry starts clean.
 */

const GUEST_EMAIL = "smoke-guest@example.com";

test("a guest finds their name, replies, and the couple see it", async ({ browser, page, request, baseURL }) => {
  const secret = required("SMOKE_SECRET");
  const adminEmail = required("SMOKE_ADMIN_EMAIL");

  await passProtection(page.context(), baseURL!);
  const smoke = smokeClient(request, await convexSiteUrl(page), secret);
  const party = await smoke.reset();

  // The name search: the smoke party is "Smoke & Test", surname "Preview".
  await expect(page).toHaveURL(/\/enter/);
  const nameField = page.getByLabel("Please enter your first and last name");
  const find = page.getByRole("button", { name: "FIND MY INVITATION" });
  await expect(async () => {
    await nameField.fill(`Smoke ${party.surname}`);
    await expect(find).toBeEnabled({ timeout: 1_000 });
  }).toPass({ timeout: 30_000 });
  await find.click();
  await page.getByRole("button", { name: party.displayName, exact: true }).click();
  await expect(page).toHaveURL(new URL("/", baseURL).toString());
  await expect(page.getByText(`Welcome, ${party.displayName}`)).toBeVisible();

  // A party's own link, cold: no name asked.
  const cold = await browser.newContext();
  await passProtection(cold, baseURL!);
  const coldPage = await cold.newPage();
  await go(coldPage, `/rsvp/${party.token}`);
  await expect(coldPage.getByRole("button", { name: /^(WE|I)'LL BE THERE$/ })).toBeVisible();
  await cold.close();

  // Back on the first device, /rsvp opens the invitation it picked. Reply.
  await go(page, "/rsvp");
  await expect(page).toHaveURL(new RegExp(`/rsvp/${party.token}\\?via=remembered$`));
  await page.getByLabel("First name, guest 1").fill("Smoke");
  await page.getByLabel("Last name, guest 1").fill("Preview");
  await page
    .getByRole("group", { name: "GUEST 1", exact: true })
    .getByRole("checkbox", { name: "Wedding", exact: true })
    .check({ force: true });
  await page.getByLabel("Email me a copy (optional)").fill(GUEST_EMAIL);
  await page.getByRole("button", { name: /^(WE|I)'LL BE THERE$/ }).click();
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
  await adminPage.goto(linkFromEmail(signIn, "/api/auth", baseURL!));
  // The sign-in happens here, on the preview, but better-auth builds its redirect
  // from SITE_URL, which on a preview is the live site. Come back to the preview.
  await go(adminPage, "/admin");
  await expect(adminPage).toHaveURL(new URL("/admin", baseURL).toString());

  const row = adminPage.getByRole("row").filter({ has: adminPage.getByText(party.displayName, { exact: true }) });
  await expect(row).toContainText("1 coming");
  await expect(row).not.toContainText("Never");
  await expect(
    adminPage.getByRole("region", { name: "Invitation funnel" }).getByRole("group", { name: "Replied", exact: true }),
  ).not.toContainText("Replied0");
  await admin.close();
});
