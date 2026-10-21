import { ADMIN_STATE, backend, expect, GUEST_PASSWORD, party, test, visit, enterPassword } from "../fixtures";

/**
 * A guest arriving on their own link, cold: no gate cookie, no memory of any
 * invitation. This is how every one of the ~400 households first lands, from
 * WhatsApp or an email, so nothing here uses the parked guest cookie.
 *
 * Each arrival also leaves a visit behind, which is the only read receipt
 * WhatsApp gives the couple. These assert the stored visit as well as the page.
 */

const TOKEN = "e2e-arrival";

// Two of these type the password, and the gate counts tries per IP.
test.beforeEach(() => backend.resetRateLimits());

test.describe("a party opening its own link", () => {
  test("skips the password and lands on the reply form", async ({ page }) => {
    await backend.seed([party({ token: TOKEN })]);

    await visit(page, `/rsvp/${TOKEN}`);

    await expect(page).toHaveURL(`/rsvp/${TOKEN}`);
    await expect(page.getByText("Rae & Cherif")).toBeVisible();
    await expect(page.getByRole("button", { name: "JOYFULLY ACCEPT" })).toBeVisible();
    expect((await backend.activity(TOKEN)).visits).toEqual([{ source: "link" }]);

    // The link unlocked the whole site, not just this page.
    await visit(page, "/");
    await expect(page).toHaveURL("/");
    await expect(page.getByText("LEBANON")).toBeVisible();
  });

  test("is not counted twice for a reload, but a different way in is its own visit", async ({ page }) => {
    await backend.seed([party({ token: TOKEN })]);

    await visit(page, `/rsvp/${TOKEN}`);
    await expect(page.getByText("Rae & Cherif")).toBeVisible();
    await page.reload();
    await expect(page.getByText("Rae & Cherif")).toBeVisible();
    await visit(page, `/rsvp/${TOKEN}`);
    await expect(page.getByText("Rae & Cherif")).toBeVisible();

    // The visit is recorded while the page loads on the server, so once the page
    // is up the row is either there or it is not; no waiting involved.
    expect((await backend.activity(TOKEN)).visits).toEqual([{ source: "link" }]);

    // Coming back through /rsvp on the same device is a different signal.
    await visit(page, "/rsvp");
    await expect(page).toHaveURL(`/rsvp/${TOKEN}?via=remembered`);
    expect((await backend.activity(TOKEN)).visits.map((v) => v.source)).toEqual(["link", "remembered"]);
  });
});

test.describe("a party arriving from an email", () => {
  test("is credited to the email it came from", async ({ page }) => {
    await backend.seed([party({ token: TOKEN })]);
    const sendId = await backend.seedSend({ token: TOKEN, channel: "email", kind: "invite", to: "rae@example.com" });

    await visit(page, `/rsvp/${TOKEN}?s=${sendId}`);
    await expect(page.getByText("Rae & Cherif")).toBeVisible();

    expect((await backend.activity(TOKEN)).visits).toEqual([{ source: "email", sendId }]);
  });

  /**
   * `s` is on a URL anyone can edit. Another family's send id must not be joined
   * to this family's visit, and junk must not break the page.
   */
  test("ignores a send id that belongs to another party, or is not an id at all", async ({ page }) => {
    await backend.seed([party({ token: TOKEN }), party({ token: "e2e-other", displayName: "Lina", surname: "Saad" })]);
    const othersSend = await backend.seedSend({
      token: "e2e-other",
      channel: "email",
      kind: "invite",
      to: "l@example.com",
    });

    await visit(page, `/rsvp/${TOKEN}?s=${othersSend}`);
    await expect(page.getByText("Rae & Cherif")).toBeVisible();
    expect((await backend.activity(TOKEN)).visits).toEqual([{ source: "email" }]);
    expect((await backend.activity("e2e-other")).visits).toEqual([]);

    await backend.reset();
    await backend.seed([party({ token: TOKEN })]);
    await visit(page, `/rsvp/${TOKEN}?s=not-a-real-id`);
    await expect(page.getByText("Rae & Cherif")).toBeVisible();
    expect((await backend.activity(TOKEN)).visits).toEqual([{ source: "email" }]);
  });
});

test.describe("a link that does not resolve", () => {
  /**
   * A dead token is not a credential, so it meets the password like any other
   * stranger. Past it, the guest is told kindly rather than shown an error.
   */
  test("meets the password gate, then a kind not-found page", async ({ page }) => {
    await visit(page, "/rsvp/not-a-real-token");
    await expect(page).toHaveURL(/\/enter\?redirect=%2Frsvp%2Fnot-a-real-token/);

    await enterPassword(page, GUEST_PASSWORD);

    await expect(page).toHaveURL("/rsvp/not-a-real-token");
    await expect(page.getByText(/could not find that invitation/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "JOYFULLY ACCEPT" })).toHaveCount(0);
  });
});

test.describe("the couple testing a link", () => {
  /** Laura and Lucien will open dozens of links to check them. None of that is a guest looking. */
  test("records no visit when the signed-in admin opens a party's link", async ({ browser }) => {
    await backend.seed([party({ token: TOKEN })]);

    const context = await browser.newContext({ storageState: ADMIN_STATE });
    const page = await context.newPage();
    await visit(page, `/rsvp/${TOKEN}`);
    await expect(page.getByText("Rae & Cherif")).toBeVisible();
    await context.close();

    expect((await backend.activity(TOKEN)).visits).toEqual([]);
  });
});
