import { ADMIN_EMAIL, backend, expect, expectNoEmail, requestSignInLink, signIn, test, visit } from "../fixtures";

/**
 * Signing in to /admin, through the real magic-link flow (see `signIn`).
 *
 * Each test asks for a fresh link, and links are capped at three an hour per
 * address, so the bucket is emptied first. The limit itself stays in force.
 */
test.beforeEach(() => backend.resetRateLimits());

test.describe("admin sign-in", () => {
  test("signs an allowlisted address in through the emailed link", async ({ page }) => {
    await signIn(page);

    await expect(page).toHaveURL(/\/admin/);
    // The address is hidden on a phone to save the header; the way out is not.
    await expect(page.getByText(ADMIN_EMAIL)).toBeAttached();
    await expect(page.getByRole("button", { name: /Sign out/i })).toBeVisible();
  });

  /**
   * The response is identical for an unlisted address, so the form cannot be used
   * to find out who the couple are. Only the absence of an email tells them apart,
   * and that is not visible from the browser.
   */
  test("says the same thing to an address that is not allowed, and sends nothing", async ({ page }) => {
    await requestSignInLink(page, "stranger@example.com");
    await expectNoEmail("stranger@example.com");
  });

  test("keeps /admin closed to a visitor who is not signed in", async ({ page }) => {
    await visit(page, "/admin");
    await expect(page).toHaveURL(/\/login/);
  });

  test("signs out again", async ({ page }) => {
    await signIn(page);
    await expect(page).toHaveURL(/\/admin/);

    await page.getByRole("button", { name: /Sign out/i }).click();
    // Sign out navigates to "/", which is behind the guest gate, so an admin who
    // signs out lands on the password screen rather than the save-the-date.
    await expect(page).toHaveURL(/\/enter/);

    await visit(page, "/admin");
    await expect(page).toHaveURL(/\/login/);
  });
});
