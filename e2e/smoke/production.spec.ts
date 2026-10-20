import { expect, test } from "@playwright/test";

import { passProtection } from "./smoke";

/**
 * Production, read-only. Nothing here signs in, submits, or names a real party:
 * the guest list is live and these run on every production deploy.
 */

const CONVEX_SITE = (process.env.PROD_CONVEX_SITE_URL ?? "https://impartial-horse-754.convex.site").replace(/\/+$/, "");

test.beforeEach(async ({ context, baseURL }) => {
  await passProtection(context, baseURL!);
});

test("the site loads and asks for the password", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.ok()).toBe(true);
  await expect(page).toHaveURL(/\/enter/);
  await expect(page.getByLabel(/password from your invitation/i)).toBeVisible();
});

/**
 * Either a 404 while the RSVP is switched off in production, or the password page
 * once it is on. Never an invitation.
 */
test("a link that names no party opens nothing", async ({ page }) => {
  const response = await page.goto(`/rsvp/smoke-not-a-real-token-${Date.now()}`);
  const status = response?.status();
  const gated = /\/enter\?redirect=/.test(page.url());
  expect(status === 404 || gated, `status ${status} at ${page.url()}`).toBe(true);
  await expect(page.getByRole("button", { name: "JOYFULLY ACCEPT" })).toHaveCount(0);
});

test("the Resend webhook is routed and refuses an unsigned event", async ({ request }) => {
  const unsigned = await request.post(`${CONVEX_SITE}/resend-webhook`, {
    data: { type: "email.delivered", created_at: new Date().toISOString(), data: {} },
  });
  expect(unsigned.ok(), `unsigned event answered ${unsigned.status()}`).toBe(false);
  // 404 would mean the route is missing, not that the event was refused.
  expect(unsigned.status()).not.toBe(404);

  const control = await request.post(`${CONVEX_SITE}/smoke-no-such-route`);
  expect(control.status()).toBe(404);
});

test("the preview-only smoke door is shut", async ({ request }) => {
  const response = await request.post(`${CONVEX_SITE}/smoke`, {
    headers: { authorization: "Bearer not-the-secret" },
    data: { op: "reset" },
  });
  expect(response.status()).toBe(404);
});
