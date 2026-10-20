import { backend, expect, GUEST_PASSWORD, test, visit, enterPassword } from "../fixtures";

/**
 * The shared-password gate. Nothing on the guest side is reachable without it,
 * including the save-the-date, so these are the first user stories in the site.
 */
/**
 * These type the password over and over from one IP, and the gate allows twenty
 * tries per fifteen minutes. Three device projects would drain it mid-run.
 */
test.beforeEach(() => backend.resetRateLimits());

test.describe("the guest gate", () => {
  test("sends an unlocked visitor to the gate and lets the right password through", async ({ page }) => {
    await visit(page, "/");
    await expect(page).toHaveURL(/\/enter$/);

    await enterPassword(page, GUEST_PASSWORD);

    await expect(page).toHaveURL("/");
    await expect(page.getByText("LEBANON")).toBeVisible();
  });

  test("refuses a wrong password without saying which part was wrong", async ({ page }) => {
    await visit(page, "/enter");
    await enterPassword(page, "not-the-password");

    await expect(page.getByRole("status")).toContainText(/does not match/i);
    await expect(page).toHaveURL(/\/enter/);
  });

  test("keeps the visitor unlocked once they have the cookie", async ({ page }) => {
    await visit(page, "/enter");
    await enterPassword(page, GUEST_PASSWORD);
    await expect(page).toHaveURL("/");

    // A second visit to the gate should bounce, not ask again. WebKit reports
    // that bounce as the navigation being "interrupted", so only that error is
    // tolerated; where the page ends up is what is asserted.
    await page.goto("/enter").catch((error: Error) => {
      if (!/interrupted by another navigation/.test(error.message)) throw error;
    });
    await expect(page).toHaveURL("/");
    await expect(page.getByText("LEBANON")).toBeVisible();
  });

  /**
   * The whole reason the gate carries a redirect. A guest who lost their link and
   * types the bare RSVP address has no cookie; a gate that always lands on the
   * home page sends them away from the page they asked for. (A party's own link
   * no longer meets the gate at all: see arrival.spec.ts.)
   */
  test("returns a guest to the page they actually asked for", async ({ page }) => {
    await visit(page, "/rsvp");
    await expect(page).toHaveURL(/\/enter\?redirect=%2Frsvp$/);

    await enterPassword(page, GUEST_PASSWORD);

    await expect(page).toHaveURL("/rsvp");
    await expect(page.getByRole("heading", { name: "Find your invitation" })).toBeVisible();
  });

  /**
   * The gate takes its destination from the URL, so without validation it is an
   * open redirect, and these guests are the ideal mark: the link arrives from
   * someone they trust and nobody checks the host.
   */
  test("refuses to be pointed at another site", async ({ page }) => {
    await visit(page, "/enter?redirect=https://evil.example/login");
    await enterPassword(page, GUEST_PASSWORD);

    await expect(page).toHaveURL("/");
  });

  test("refuses a scheme-relative redirect, which a browser reads as another host", async ({ page }) => {
    await visit(page, "/enter?redirect=//evil.example");
    await enterPassword(page, GUEST_PASSWORD);

    await expect(page).toHaveURL("/");
  });
});
