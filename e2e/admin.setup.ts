import { ADMIN_STATE, backend, expect, signIn, test as setup } from "./fixtures";

/**
 * Signs the admin in once and saves the session for the admin specs.
 *
 * Magic links are capped at three an hour per address, so a suite that signed in
 * per test would run out partway through and then fail on the limiter. The
 * sign-in flow itself is covered by e2e/admin/sign-in.spec.ts.
 */
setup("sign the admin in", async ({ page }) => {
  await backend.resetRateLimits();
  await signIn(page);
  await expect(page).toHaveURL(/\/admin/);
  await page.context().storageState({ path: ADMIN_STATE });
});
