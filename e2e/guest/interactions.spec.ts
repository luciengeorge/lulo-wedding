import type { Page, Route } from "@playwright/test";

import { backend, expect, GUEST_STATE, party, test, visit, waitForEmail } from "../fixtures";
import { card, chip, expectStoredReply, fillCard, sendReply } from "../rsvp-form";

test.use({ storageState: GUEST_STATE });

/**
 * What people do to a form on a phone: tap twice, go back, reload, lose signal,
 * open the link on two devices at once.
 */

const TOKEN = "e2e-interact";
const EMAIL = "rae@example.com";

/** TanStack Start names a server function in its URL as base64 JSON; this finds the reply submit. */
function isSubmit(url: string): boolean {
  const encoded = url.split("/_serverFn/")[1]?.split(/[?#]/)[0];
  if (!encoded) return false;
  return Buffer.from(encoded, "base64url").toString("utf8").includes("submitRsvp");
}

async function openForm(page: Page) {
  await visit(page, `/rsvp/${TOKEN}`);
  await page.getByRole("button", { name: "JOYFULLY ACCEPT" }).click();
}

async function fillRae(page: Page) {
  await fillCard(page, "GUEST 1", 0, { first: "Rae", last: "Haddad", days: ["wedding"] });
  await page.getByLabel("Your email").fill(EMAIL);
}

test.beforeEach(() => {
  backend.seed([party({ token: TOKEN, headCount: 2 })]);
});

test.describe("sending a reply", () => {
  test("a double tap sends one reply and one receipt, and the button says it is busy", async ({ page }) => {
    await openForm(page);
    await fillRae(page);

    // Hold the request, as a slow connection would, so the busy state can be seen
    // and the second tap lands while the first is still in flight.
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    let sent = 0;
    await page.route(
      (url) => isSubmit(url.toString()),
      async (route: Route) => {
        if (route.request().method() === "POST") sent++;
        await held;
        await route.continue();
      },
    );

    await page.getByRole("button", { name: "SEND OUR REPLY" }).dblclick();
    await expect(page.getByRole("button", { name: "SENDING" })).toBeDisabled();
    await expect(page.getByLabel("First name, guest 1")).toBeDisabled();
    release();

    await expect(page.getByText("Thank you")).toBeVisible();
    await waitForEmail(EMAIL);
    expect(sent).toBe(1);
    expect(backend.activity(TOKEN).sends).toHaveLength(1);
    expect(backend.emailCount(EMAIL)).toBe(1);
  });

  test("a dropped connection shows an error and keeps everything typed", async ({ page }) => {
    await openForm(page);
    await fillRae(page);

    await page.route(
      (url) => isSubmit(url.toString()),
      (route) => route.abort("internetdisconnected"),
    );
    await page.getByRole("button", { name: "SEND OUR REPLY" }).click();

    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByLabel("First name, guest 1")).toHaveValue("Rae");
    await expect(chip(page, "GUEST 1", "wedding")).toBeChecked();
    await expect(page.getByLabel("Your email")).toHaveValue(EMAIL);
    await expect(page.getByRole("button", { name: "SEND OUR REPLY" })).toBeEnabled();
    expect(backend.replyFor(TOKEN)?.respondedAt).toBeUndefined();

    // Signal back: the same form goes through.
    await page.unrouteAll();
    await page.getByRole("button", { name: "SEND OUR REPLY" }).click();
    await expect(page.getByText("Thank you")).toBeVisible();
    expect(backend.replyFor(TOKEN)?.guests).toEqual([expect.objectContaining({ firstName: "Rae", wedding: "yes" })]);
  });

  test("too many replies from one link in a row are refused, and say why", async ({ page }) => {
    await openForm(page);
    await fillRae(page);
    backend.exhaustSubmit(TOKEN);

    await page.getByRole("button", { name: "SEND OUR REPLY" }).click();
    await expect(page.getByRole("alert")).toContainText("That is a lot of changes at once.");
    expect(backend.replyFor(TOKEN)?.respondedAt).toBeUndefined();
  });
});

test.describe("moving around", () => {
  test("back and forward after replying shows the reply, not the question", async ({ page }) => {
    await visit(page, "/rsvp");
    await page.getByLabel("Your first and last name").fill("Rae Haddad");
    await page.getByRole("button", { name: "FIND MY INVITATION" }).click();
    await page.getByRole("link", { name: /Rae & Cherif/ }).click();
    await page.getByRole("button", { name: "JOYFULLY ACCEPT" }).click();
    await fillRae(page);
    await page.getByRole("button", { name: "SEND OUR REPLY" }).click();
    await expect(page.getByText("Thank you")).toBeVisible();

    // Back is /rsvp, which now remembers this party and returns to it.
    await page.goBack();
    await expect(page).toHaveURL(`/rsvp/${TOKEN}?via=remembered`);
    await expect(page.getByText("Thank you")).toBeVisible();
    await expect(page.getByRole("button", { name: "JOYFULLY ACCEPT" })).toHaveCount(0);
    await page.goForward();
    await expect(page.getByText("Thank you")).toBeVisible();
    await expect(page.getByRole("button", { name: "JOYFULLY ACCEPT" })).toHaveCount(0);
    expect(backend.replyFor(TOKEN)?.guests).toHaveLength(1);
  });

  test("a reload halfway through starts over and saves nothing", async ({ page }) => {
    await openForm(page);
    await fillRae(page);

    await page.reload();
    await expect(page.getByRole("button", { name: "JOYFULLY ACCEPT" })).toBeVisible();
    expect(backend.replyFor(TOKEN)?.respondedAt).toBeUndefined();

    await page.getByRole("button", { name: "JOYFULLY ACCEPT" }).click();
    await fillRae(page);
    await page.getByRole("button", { name: "SEND OUR REPLY" }).click();
    await expect(page.getByText("Thank you")).toBeVisible();
  });
});

test.describe("two devices on one invitation", () => {
  test("the later reply wins, cleanly", async ({ page, browser }) => {
    const other = await browser.newContext({ storageState: GUEST_STATE });
    const second = await other.newPage();
    await openForm(page);
    await openForm(second);

    await fillRae(page);
    await page.getByRole("button", { name: "SEND OUR REPLY" }).click();
    await expect(page.getByText("Thank you")).toBeVisible();

    await fillCard(second, "GUEST 1", 0, { first: "Cherif", last: "Haddad", days: ["wedding"] });
    await sendReply(second, "cherif@example.com");
    await expect(second.getByText("Thank you")).toBeVisible();

    expect(backend.replyFor(TOKEN)).toEqual(
      expect.objectContaining({
        contactEmail: "cherif@example.com",
        guests: [expect.objectContaining({ firstName: "Cherif", wedding: "yes" })],
      }),
    );
    await visit(page, `/rsvp/${TOKEN}`);
    await expect(page.getByText("Cherif", { exact: true })).toBeVisible();
    await other.close();
  });

  /**
   * Both devices hold the same stored person. One removes them; the other then
   * sends an edit to that person. It must be told to reload, not resurrect or
   * duplicate anyone.
   */
  test("an edit to someone the other device removed is refused as out of date", async ({ page, browser }) => {
    await openForm(page);
    await fillRae(page);
    await fillCard(page, "GUEST 2", 1, { first: "Cherif", last: "Haddad", days: ["wedding"] });
    await page.getByRole("button", { name: "SEND OUR REPLY" }).click();
    await expect(page.getByText("Thank you")).toBeVisible();
    await expectStoredReply(page, EMAIL);

    const other = await browser.newContext({ storageState: GUEST_STATE });
    const second = await other.newPage();
    await visit(second, `/rsvp/${TOKEN}`);
    await second.getByRole("button", { name: "CHANGE OUR REPLY" }).click();
    await page.getByRole("button", { name: "CHANGE OUR REPLY" }).click();

    // The second device clears Cherif's card and sends.
    await second.getByLabel("First name, guest 2").fill("");
    await second.getByLabel("Last name, guest 2").fill("");
    await second.getByRole("button", { name: "SEND OUR REPLY" }).click();
    await expect(second.getByText(/told us about 1 of your 2 places/)).toBeVisible();

    // The first device, still showing Cherif, edits him.
    await page.getByLabel("Last name, guest 2").fill("Haddad-Saab");
    await page.getByRole("button", { name: "SEND OUR REPLY" }).click();
    await expect(page.getByRole("alert")).toContainText("That reply is out of date. Please reload the page");
    await expect(card(page, "GUEST 2").getByLabel("Last name, guest 2")).toHaveValue("Haddad-Saab");

    expect(backend.replyFor(TOKEN)?.guests.map((guest) => guest.firstName)).toEqual(["Rae"]);
    await other.close();
  });
});
