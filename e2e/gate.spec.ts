import { backend, expect, GUEST_PASSWORD, party, test, visit } from "./fixtures";

/**
 * The shared-password gate. Nothing on the guest side is reachable without it,
 * including the save-the-date, so these are the first user stories in the site.
 */
test.describe("the guest gate", () => {
  test("sends an unlocked visitor to the gate and lets the right password through", async ({ page }) => {
    await visit(page, "/");
    await expect(page).toHaveURL(/\/enter$/);

    await page.getByLabel(/password from your invitation/i).fill(GUEST_PASSWORD);
    await page.getByRole("button", { name: "ENTER" }).click();

    await expect(page).toHaveURL("/");
    await expect(page.getByText("LEBANON")).toBeVisible();
  });

  test("refuses a wrong password without saying which part was wrong", async ({ page }) => {
    await visit(page, "/enter");
    await page.getByLabel(/password from your invitation/i).fill("not-the-password");
    await page.getByRole("button", { name: "ENTER" }).click();

    await expect(page.getByRole("status")).toContainText(/does not match/i);
    await expect(page).toHaveURL(/\/enter/);
  });

  test("keeps the visitor unlocked once they have the cookie", async ({ page }) => {
    await visit(page, "/enter");
    await page.getByLabel(/password from your invitation/i).fill(GUEST_PASSWORD);
    await page.getByRole("button", { name: "ENTER" }).click();
    await expect(page).toHaveURL("/");

    // A second visit to the gate should bounce, not ask again.
    await visit(page, "/enter");
    await expect(page).toHaveURL("/");
  });

  /**
   * The whole reason the gate carries a redirect. Every party arrives from
   * WhatsApp on a deep link and none of them have the cookie the first time; a
   * gate that always lands on the home page loses them their own invitation.
   */
  test("returns a guest to the link they actually opened", async ({ page }) => {
    backend.seed([party({ token: "e2e-deep-link" })]);

    await visit(page, "/rsvp/e2e-deep-link");
    await expect(page).toHaveURL(/\/enter\?redirect=%2Frsvp%2Fe2e-deep-link/);

    await page.getByLabel(/password from your invitation/i).fill(GUEST_PASSWORD);
    await page.getByRole("button", { name: "ENTER" }).click();

    await expect(page).toHaveURL("/rsvp/e2e-deep-link");
    await expect(page.getByText("Rae & Cherif")).toBeVisible();
  });

  /**
   * The gate takes its destination from the URL, so without validation it is an
   * open redirect, and these guests are the ideal mark: the link arrives from
   * someone they trust and nobody checks the host.
   */
  test("refuses to be pointed at another site", async ({ page }) => {
    await visit(page, "/enter?redirect=https://evil.example/login");
    await page.getByLabel(/password from your invitation/i).fill(GUEST_PASSWORD);
    await page.getByRole("button", { name: "ENTER" }).click();

    await expect(page).toHaveURL("/");
  });

  test("refuses a scheme-relative redirect, which a browser reads as another host", async ({ page }) => {
    await visit(page, "/enter?redirect=//evil.example");
    await page.getByLabel(/password from your invitation/i).fill(GUEST_PASSWORD);
    await page.getByRole("button", { name: "ENTER" }).click();

    await expect(page).toHaveURL("/");
  });
});
