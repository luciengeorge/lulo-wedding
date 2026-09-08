import { backend, expect, GUEST_PASSWORD, GUEST_STATE, test as setup, visit } from "./fixtures";

/**
 * Unlocks the guest gate once and saves the cookie for the specs that need to be
 * past it.
 *
 * Not just for speed. The gate is rate limited to 20 attempts per 15 minutes per
 * IP, and every test runs from 127.0.0.1, so a suite that types the password in
 * each test drains the bucket and then fails on the app working exactly as
 * designed. gate.spec.ts deliberately does not use this state, because the gate
 * is what it is testing.
 */
setup("unlock the guest gate", async ({ page }) => {
  // Clears the gate and magic-link buckets, which several runs an hour exhaust.
  backend.resetRateLimits();

  await visit(page, "/enter");
  await page.getByLabel(/password from your invitation/i).fill(GUEST_PASSWORD);
  await page.getByRole("button", { name: "ENTER" }).click();
  await expect(page).toHaveURL("/");

  await page.context().storageState({ path: GUEST_STATE });
});
