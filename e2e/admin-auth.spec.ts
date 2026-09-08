import {
  ADMIN_EMAIL,
  expect,
  expectNoEmail,
  linkFromEmail,
  test,
  visit,
  waitForEmail,
  waitForHydration,
} from "./fixtures";

/**
 * Signing in to /admin.
 *
 * The tests go through the real magic-link flow rather than a back door that
 * mints a session: the throwaway deployment captures outbound email instead of
 * sending it, and the spec reads the link out of the rendered template. So this
 * covers better-auth, the allowlist, the email template and the redirect in one
 * pass, and there is no session-minting mutation living in the shipped bundle.
 */
async function signIn(page: import("@playwright/test").Page, email = ADMIN_EMAIL) {
  await visit(page, "/login");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: /Email me a sign-in link/i }).click();
  await expect(page.getByText(/Check your inbox/i)).toBeVisible();

  const captured = await waitForEmail(email);
  await page.goto(linkFromEmail(captured.html, "/api/auth"));
  // The link lands on /admin through a server redirect, so the page still has to
  // hydrate before anything on it will respond to a click.
  await waitForHydration(page);
  // Wait for the guest list itself, not just the header. The query resolving
  // swaps the skeleton for the table and reflows the page, and a click fired into
  // that reflow hits a button that is detached or still moving.
  await expect(page.getByText(/No parties|Showing all/)).toBeVisible();
}

test.describe("admin sign-in", () => {
  test("signs an allowlisted address in through the emailed link", async ({ page }) => {
    await signIn(page);

    await expect(page).toHaveURL(/\/admin/);
    await expect(page.getByText(ADMIN_EMAIL)).toBeVisible();
  });

  /**
   * The response is identical for an unlisted address, so the form cannot be used
   * to find out who the couple are. Only the absence of an email tells them apart,
   * and that is not visible from the browser.
   */
  test("says the same thing to an address that is not allowed, and sends nothing", async ({ page }) => {
    await visit(page, "/login");
    await page.getByLabel("Email").fill("stranger@example.com");
    await page.getByRole("button", { name: /Email me a sign-in link/i }).click();

    await expect(page.getByText(/Check your inbox/i)).toBeVisible();
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

export { signIn };
